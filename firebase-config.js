// Firebase configuration for CartWatch Chrome Extension
// This file imports the actual configuration from firebase-config.local.js
// which is gitignored for security

try {
    // Try to import local configuration first
    const { app, auth, db, firebaseConfig } = await import('./firebase-config.local.js');
    export { app, auth, db, firebaseConfig };
} catch (error) {
    // Fallback to example configuration if local config doesn't exist
    console.warn('firebase-config.local.js not found. Please copy firebase-config.example.js to firebase-config.local.js and configure your Firebase settings.');
    
    // Import example configuration as fallback
    const { app, auth, db, firebaseConfig } = await import('./firebase-config.example.js');
    export { app, auth, db, firebaseConfig };
}
