import {
    collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, where
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {
    createUserWithEmailAndPassword, getIdToken, reload, sendEmailVerification,
    sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { auth, db, googleProvider, usernameSessionKey } from './firebase.js';

const status = document.querySelector('#sign-in-status');
const googleButton = document.querySelector('#google-sign-in');
const emailForm = document.querySelector('#email-form');
const emailInput = document.querySelector('#auth-email');
const passwordInput = document.querySelector('#auth-password');
const usernameLabel = document.querySelector('#new-username-label');
const usernameInput = document.querySelector('#new-username');
const submitButton = document.querySelector('#submit-email-auth');
const modeButton = document.querySelector('#toggle-auth-mode');
const resetButton = document.querySelector('#reset-password');

const pendingEmailKey = 'vellumPendingAuthEmail';
const pendingUsernameKey = 'vellumPendingAuthUsername';
let mode = 'sign-in';
let busy = false;

function setBusy(value) {
    busy = value;
    googleButton.disabled = value;
    submitButton.disabled = value;
    modeButton.disabled = value;
    resetButton.disabled = value;
}

function setMode(nextMode) {
    mode = nextMode;
    const creating = mode === 'create';
    usernameLabel.hidden = !creating;
    usernameInput.required = creating;
    passwordInput.autocomplete = creating ? 'new-password' : 'current-password';
    submitButton.textContent = creating ? 'Create Account' : 'Sign In';
    modeButton.textContent = creating ? 'I already have an account' : 'Create an account';
    status.textContent = '';
}

modeButton.addEventListener('click', () => {
    setMode(mode === 'sign-in' ? 'create' : 'sign-in');
});

document.querySelectorAll('[data-page]').forEach(button => {
    button.addEventListener('click', () => {
        window.location.href = button.dataset.page;
    });
});

googleButton.addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    status.textContent = '';
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const profileId = await findAuthProfile(result.user);
        if (!profileId) {
            await signOut(auth);
            status.textContent = 'No Jash profile is linked to this Google account. For a legacy profile, ask an administrator to add your verified email to that profile.';
            return;
        }
        finishSignIn(profileId);
    } catch (error) {
        console.error('Google sign-in failed:', error);
        status.textContent = readableAuthError(error, 'Google sign-in could not be completed.');
    } finally {
        setBusy(false);
    }
});

emailForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const username = usernameInput.value.trim();
    if (mode === 'create' && !username) {
        usernameInput.focus();
        return;
    }

    setBusy(true);
    status.textContent = '';
    try {
        if (mode === 'create') {
            const credential = await createUserWithEmailAndPassword(auth, email, password);
            localStorage.setItem(pendingEmailKey, email);
            localStorage.setItem(pendingUsernameKey, username);
            await sendEmailVerification(credential.user);
            await signOut(auth);
            setMode('sign-in');
            status.textContent = 'Account created. Verify your email, then sign in here to continue.';
            return;
        }

        const credential = await signInWithEmailAndPassword(auth, email, password);
        await reload(credential.user);
        await getIdToken(credential.user, true);
        if (!credential.user.emailVerified) {
            await sendEmailVerification(credential.user);
            await signOut(auth);
            status.textContent = 'Verify your email using the link we sent, then sign in again.';
            return;
        }

        let profileId = await findAuthProfile(credential.user);
        if (!profileId) {
            profileId = await createNewProfileIfPending(credential.user, email);
        }
        if (!profileId) {
            await signOut(auth);
            status.textContent = 'No profile is linked to this verified email. For a legacy profile, ask an administrator to add this email to that profile.';
            return;
        }
        localStorage.removeItem(pendingEmailKey);
        localStorage.removeItem(pendingUsernameKey);
        finishSignIn(profileId);
    } catch (error) {
        console.error('Email sign-in failed:', error);
        status.textContent = readableAuthError(error, 'Email sign-in could not be completed.');
    } finally {
        setBusy(false);
    }
});

resetButton.addEventListener('click', async () => {
    const email = emailInput.value.trim().toLowerCase();
    if (!email) {
        status.textContent = 'Enter your email address first, then choose Forgot password.';
        emailInput.focus();
        return;
    }
    if (busy) return;

    setBusy(true);
    try {
        await sendPasswordResetEmail(auth, email);
        status.textContent = 'If an account exists for that email, a password reset link has been sent.';
    } catch (error) {
        console.error('Password reset failed:', error);
        status.textContent = readableAuthError(error, 'Could not send a password reset email.');
    } finally {
        setBusy(false);
    }
});

async function findAuthProfile(user) {
    const directProfile = await getDoc(doc(db, 'users', user.uid));
    if (directProfile.exists()) return directProfile.id;

    const identifiers = [
        ['uid', user.uid],
        ['userID', user.uid],
        ['userId', user.uid]
    ];
    if (user.emailVerified && user.email) {
        identifiers.push(['email', user.email.trim().toLowerCase()]);
    }

    for (const [field, value] of identifiers) {
        const matches = await getDocs(query(
            collection(db, 'users'),
            where(field, '==', value),
            limit(1)
        ));
        if (!matches.empty) return matches.docs[0].id;
    }
    return null;
}

async function createNewProfileIfPending(user, email) {
    const pendingEmail = localStorage.getItem(pendingEmailKey);
    const username = localStorage.getItem(pendingUsernameKey)?.trim();
    if (!username || !pendingEmail || pendingEmail.toLowerCase() !== email.toLowerCase()) return null;

    await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        username,
        createdAt: serverTimestamp()
    });
    return user.uid;
}

function finishSignIn(profileId) {
    localStorage.setItem(usernameSessionKey, profileId);
    window.location.href = 'runs.html';
}

function readableAuthError(error, fallback) {
    const messages = {
        'auth/email-already-in-use': 'An account already exists for this email. Sign in instead.',
        'auth/invalid-credential': 'The email or password is incorrect.',
        'auth/invalid-email': 'Enter a valid email address.',
        'auth/operation-not-allowed': 'Email/password sign-in is not enabled for this Firebase project.',
        'auth/weak-password': 'Choose a password with at least 6 characters.',
        'auth/too-many-requests': 'Too many attempts. Wait a while, then try again.',
        'auth/network-request-failed': 'Could not reach Firebase. Check your connection and try again.',
        'auth/popup-closed-by-user': 'Google sign-in was closed before it finished.',
        'auth/unauthorized-domain': 'This site domain is not authorized for Firebase Authentication.',
        'permission-denied': 'Firestore denied profile access. Publish the latest firestore.rules, including the verified-user profile create rule.',
        'unavailable': 'Firestore is temporarily unavailable. Try again shortly.'
    };
    return messages[error.code] || (error.code ? `${fallback} (${error.code})` : fallback);
}

setMode('sign-in');
