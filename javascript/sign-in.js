import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db, usernameSessionKey } from './firebase.js';

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
    const status = document.querySelector('#sign-in-status');

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
