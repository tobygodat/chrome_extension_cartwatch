import { initializeApp } from "./vendor/firebase-app.js";
import { getAuth } from "./vendor/firebase-auth.js";
import { getFirestore } from "./vendor/firebase-firestore.js";

// Firebase configuration for CartWatch Chrome Extension
// SECURITY: This file imports from firebase-config.local.js which is gitignored
// Make sure to copy firebase-config.example.js to firebase-config.local.js and add your actual credentials

let firebaseConfig;

try {
    // Import the local configuration (gitignored file with actual credentials)
    const localConfig = await import('./firebase-config.local.js');
    firebaseConfig = localConfig.firebaseConfig;
    console.log('✅ Firebase configuration loaded from firebase-config.local.js');
} catch (error) {
    console.error('❌ firebase-config.local.js not found!');
    console.error('Please copy firebase-config.example.js to firebase-config.local.js and configure your Firebase settings.');
    
    // Fallback to example configuration (will not work with real Firebase)
    const exampleConfig = await import('./firebase-config.example.js');
    firebaseConfig = exampleConfig.firebaseConfig;
    console.warn('⚠️ Using example configuration - Firebase will not work until you set up firebase-config.local.js');
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db, firebaseConfig };
