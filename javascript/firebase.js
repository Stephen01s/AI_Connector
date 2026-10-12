import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebaseConfig = {
    apiKey: 'AIzaSyAw0bPvJthyO6NaNAYU8OwSUq5jFhlAD2A',
    authDomain: 'signintest-8f353.firebaseapp.com',
    projectId: 'signintest-8f353',
    storageBucket: 'signintest-8f353.firebasestorage.app',
    messagingSenderId: '767392226522',
    appId: '1:767392226522:web:e66297ffbf1796d59c99e3'
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const usernameSessionKey = 'vellumSignedInUsername';
