import { initializeApp } from "./vendor/firebase-app.js";
import { getAuth } from "./vendor/firebase-auth.js";
import { getFirestore } from "./vendor/firebase-firestore.js";

// Firebase configuration for CartWatch Chrome Extension
// Import the local configuration (copy firebase-config.example.js to firebase-config.local.js)
import { firebaseConfig } from './firebase-config.local.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db, firebaseConfig };
