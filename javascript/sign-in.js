import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { signInWithPopup } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
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
        const username = user.email || user.displayName || user.uid;
        localStorage.setItem(usernameSessionKey, username);
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
        const profile = await getDoc(doc(db, 'users', username));
        if (!profile.exists()) {
            status.textContent = 'We couldn’t find an account with that username.';
            return;
        }

        const savedUsername = profile.data().username || username;
        localStorage.setItem(usernameSessionKey, savedUsername);
        window.location.href = 'runs.html';
    } catch (error) {
        console.error('Sign-in lookup failed:', error);
        status.textContent = 'Unable to sign in right now. Please try again.';
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Continue';
    }
});
