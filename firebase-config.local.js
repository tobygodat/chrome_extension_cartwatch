import { initializeApp } from "../vendor/firebase-app.js";
import { getAuth } from "../vendor/firebase-auth.js";
import { getFirestore } from "../vendor/firebase-firestore.js";

// Firebase configuration for CartWatch Chrome Extension
// This file contains actual configuration values and is gitignored

const firebaseConfig = {
    apiKey: "AIzaSyCCGxpWlKYlVTS9raduQOzsL3nq-YSq1Ao",
    authDomain: "mvidia-c10e5.firebaseapp.com",
    projectId: "mvidia-c10e5",
    storageBucket: "mvidia-c10e5.firebasestorage.app",
    messagingSenderId: "276910117717",
    appId: "1:276910117717:ios:9d4212c3baa6d6ce48d5dc",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db, firebaseConfig };
