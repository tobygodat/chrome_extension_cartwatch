import { initializeApp } from "./vendor/firebase-app.js";
import { getAuth } from "./vendor/firebase-auth.js";
import { getFirestore } from "./vendor/firebase-firestore.js";

// Firebase configuration for CartWatch Chrome Extension
// This version can read from environment variables for development
// For production, use firebase-config.local.js with actual values

// Function to get environment variable (for development)
function getEnvVar(name, defaultValue) {
    // In Chrome extensions, we can't access process.env directly
    // This is a placeholder for development environments
    return defaultValue;
}

// Try to import local configuration first
let firebaseConfig;
try {
    const localConfig = await import('./firebase-config.local.js');
    firebaseConfig = localConfig.firebaseConfig;
    console.log('✅ Using firebase-config.local.js');
} catch (error) {
    console.warn('⚠️ firebase-config.local.js not found. Using fallback configuration.');
    console.warn('Please copy firebase-config.example.js to firebase-config.local.js and configure your Firebase settings.');
    
    // Fallback configuration (should not be used in production)
    firebaseConfig = {
        apiKey: "YOUR_FIREBASE_API_KEY",
        authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
        projectId: "YOUR_PROJECT_ID",
        storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
        messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
        appId: "YOUR_APP_ID",
    };
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db, firebaseConfig };
