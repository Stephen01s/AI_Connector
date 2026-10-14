import { signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { auth, db, usernameSessionKey } from './firebase.js';

const sessionUserKey = localStorage.getItem(usernameSessionKey);
const settingsButton = document.querySelector('#user-settings');
const signOutButton = document.querySelector('#sign-out');
const signInButton = document.querySelector('#sign-in-nav');

if (settingsButton && signOutButton) {
    if (!sessionUserKey) {
        settingsButton.hidden = true;
        signOutButton.hidden = true;
        if (signInButton) {
            signInButton.hidden = false;
            signInButton.addEventListener('click', () => {
                window.location.href = 'sign-in.html';
            });
        }
    } else {
        if (signInButton) signInButton.hidden = true;
        settingsButton.addEventListener('click', () => {
            window.location.href = 'settings.html';
        });
        getDoc(doc(db, 'users', sessionUserKey)).then(profile => {
            const username = profile.exists() ? profile.data().username : sessionUserKey;
            settingsButton.textContent = `User Settings · ${username || sessionUserKey}`;
        }).catch(error => console.error('Could not load account name:', error));
        signOutButton.addEventListener('click', async () => {
            localStorage.removeItem(usernameSessionKey);
            await signOut(auth);
            window.location.href = 'index.html';
        });
    }
}
