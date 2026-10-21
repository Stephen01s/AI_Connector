import {
    collection, doc, getDoc, getDocs, limit, query, serverTimestamp, updateDoc, where
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db, usernameSessionKey } from './firebase.js';

const sessionUserKey = localStorage.getItem(usernameSessionKey);
const form = document.querySelector('#settings-form');
const status = document.querySelector('#settings-status');
const saveButton = document.querySelector('#save-settings');
const fields = {
    username: document.querySelector('#settings-username'),
    description: document.querySelector('#settings-description'),
    email: document.querySelector('#settings-email'),
    userID: document.querySelector('#settings-user-id'),
    createdAt: document.querySelector('#settings-created-at'),
    updatedAt: document.querySelector('#settings-updated-at')
};

document.querySelectorAll('[data-page]').forEach(button => {
    button.addEventListener('click', () => {
        window.location.href = button.dataset.page;
    });
});

if (!sessionUserKey) {
    window.location.replace('sign-in.html');
} else {
    loadProfile().catch(error => {
        console.error('Could not load profile:', error);
        status.textContent = 'Could not load your profile. Please refresh to try again.';
    });
}

async function loadProfile() {
    const profileRef = doc(db, 'users', sessionUserKey);
    const profile = await getDoc(profileRef);
    if (!profile.exists()) {
        status.textContent = 'Your profile could not be found.';
        return;
    }

    const data = profile.data();
    fields.username.value = data.username || sessionUserKey;
    fields.description.value = data.description || '';
    fields.email.value = data.email || '';
    fields.userID.value = data.userID || data.userId || data.uid || '';
    fields.createdAt.value = formatTimestamp(data.createdAt);
    fields.updatedAt.value = formatTimestamp(data.updatedAt);
    fields.username.disabled = false;
    fields.description.disabled = false;
    saveButton.disabled = false;
    status.textContent = 'Profile loaded.';
}

form.addEventListener('submit', async event => {
    event.preventDefault();
    const nextUsername = fields.username.value.trim();
    if (!nextUsername) {
        fields.username.focus();
        status.textContent = 'Username is required.';
        return;
    }

    saveButton.disabled = true;
    status.textContent = 'Saving changes…';
    try {
        const matches = await getDocs(query(
            collection(db, 'users'),
            where('username', '==', nextUsername),
            limit(2)
        ));
        const usernameKeyProfile = await getDoc(doc(db, 'users', nextUsername));
        const duplicate = matches.docs.some(match => match.id !== sessionUserKey) ||
            (usernameKeyProfile.exists() && usernameKeyProfile.id !== sessionUserKey);
        if (duplicate) {
            status.textContent = 'That username is already in use.';
            fields.username.focus();
            return;
        }

        await updateDoc(doc(db, 'users', sessionUserKey), {
            username: nextUsername,
            description: fields.description.value.trim(),
            updatedAt: serverTimestamp()
        });
        const updatedProfile = await getDoc(doc(db, 'users', sessionUserKey));
        fields.updatedAt.value = formatTimestamp(updatedProfile.data().updatedAt);
        status.textContent = 'Your profile has been saved.';
    } catch (error) {
        console.error('Could not save profile:', error);
        status.textContent = 'Could not save your changes. Please try again.';
    } finally {
        saveButton.disabled = false;
    }
});

function formatTimestamp(value) {
    if (!value) return '—';
    const date = value.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}
