import { collection, doc, getDoc, getDocs, limit, query, where } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { auth, db, googleProvider, usernameSessionKey } from './firebase.js';

const status = document.querySelector('#sign-in-status');
const googleButton = document.querySelector('#google-sign-in');
googleButton.addEventListener('click', async () => {
    googleButton.disabled = true;
    googleButton.textContent = 'Connecting to Google…';
    status.textContent = '';

    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        const profileId = await findGoogleProfile(user);
        if (!profileId) {
            await signOut(auth);
            status.textContent = 'We couldn’t find a profile for this Google account. Sign in with your username or ask an administrator to link your account.';
            return;
        }
        localStorage.setItem(usernameSessionKey, profileId);
        window.location.href = 'runs.html';
    } catch (error) {
        console.error('Google sign-in failed:', error);
        status.textContent = error.code === 'auth/popup-closed-by-user'
            ? 'Google sign-in was closed before it finished.'
            : 'Unable to sign in with Google right now. Please try again.';
    } finally {
        googleButton.disabled = false;
        googleButton.textContent = 'Continue with Google';
    }
});

async function findGoogleProfile(user) {
    // The rest of the app stores the Firestore users document ID in session
    // storage. Google credentials identify a Firebase Auth user instead, so
    // resolve the profile by its Auth UID (and email for older records).
    const directProfile = await getDoc(doc(db, 'users', user.uid));
    if (directProfile.exists()) return directProfile.id;

    for (const [field, value] of [['userID', user.uid], ['uid', user.uid], ['email', user.email]]) {
        if (!value) continue;
        const matches = await getDocs(query(
            collection(db, 'users'),
            where(field, '==', value),
            limit(1)
        ));
        if (!matches.empty) return matches.docs[0].id;
    }
    return null;
}

document.querySelectorAll('[data-page]').forEach(button => {
    button.addEventListener('click', () => {
        window.location.href = button.dataset.page;
    });
});

document.querySelector('#sign-in-form').addEventListener('submit', async event => {
    event.preventDefault();
    const usernameInput = document.querySelector('#username');
    const username = usernameInput.value.trim();
    const submitButton = document.querySelector('#submit-sign-in');

    if (!username) return;
    submitButton.disabled = true;
    submitButton.textContent = 'Checking…';
    status.textContent = '';

    try {
        let profile = await getDoc(doc(db, 'users', username));
        let profileId = profile.exists() ? profile.id : null;
        if (!profile.exists()) {
            const matches = await getDocs(query(
                collection(db, 'users'),
                where('username', '==', username),
                limit(1)
            ));
            if (!matches.empty) {
                profile = matches.docs[0];
                profileId = profile.id;
            }
        }
        if (!profileId) {
            status.textContent = 'We couldn’t find an account with that username.';
            return;
        }

        localStorage.setItem(usernameSessionKey, profileId);
        window.location.href = 'runs.html';
    } catch (error) {
        console.error('Sign-in lookup failed:', error);
        status.textContent = 'Unable to sign in right now. Please try again.';
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Continue';
    }
});
