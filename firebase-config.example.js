import { initializeApp } from "../vendor/firebase-app.js";
import { getAuth } from "../vendor/firebase-auth.js";
import { getFirestore } from "../vendor/firebase-firestore.js";

// Firebase configuration for CartWatch Chrome Extension
// Copy this file to firebase-config.local.js and add your actual config values
// firebase-config.local.js is gitignored for security

const firebaseConfig = {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db, firebaseConfig };
