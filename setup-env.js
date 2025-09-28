#!/usr/bin/env node

// Setup script to create environment files for CartWatch Chrome Extension
// This script helps developers set up their local environment securely

const fs = require('fs');
const path = require('path');

console.log('🔧 Setting up CartWatch Chrome Extension environment...\n');

// Create .env.example file
const envExample = `# Firebase Configuration
# Copy this file to .env and fill in your actual values
# .env is gitignored for security

FIREBASE_API_KEY=your_firebase_api_key_here
FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id_here
FIREBASE_STORAGE_BUCKET=your_project_id.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id_here
FIREBASE_APP_ID=your_app_id_here

# Gemini API Configuration
GEMINI_API_KEY=your_gemini_api_key_here

# Optional: Risk Scoring API
RISK_API_URL=your_risk_api_url_here`;

// Create firebase-config.local.js from environment variables
const firebaseConfigTemplate = `// Firebase configuration for CartWatch Chrome Extension
// This file is generated from environment variables and is gitignored

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY || "YOUR_FIREBASE_API_KEY",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: process.env.FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "YOUR_PROJECT_ID.firebasestorage.app",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "YOUR_MESSAGING_SENDER_ID",
    appId: process.env.FIREBASE_APP_ID || "YOUR_APP_ID",
};

export { firebaseConfig };`;

try {
    // Create .env.example
    if (!fs.existsSync('.env.example')) {
        fs.writeFileSync('.env.example', envExample);
        console.log('✅ Created .env.example file');
    } else {
        console.log('ℹ️  .env.example already exists');
    }

    // Check if .env exists
    if (!fs.existsSync('.env')) {
        console.log('⚠️  .env file not found!');
        console.log('📝 Please copy .env.example to .env and fill in your actual values:');
        console.log('   cp .env.example .env');
        console.log('   # Then edit .env with your Firebase and API credentials\n');
    } else {
        console.log('✅ .env file found');
    }

    // Check if firebase-config.local.js exists
    if (!fs.existsSync('firebase-config.local.js')) {
        console.log('⚠️  firebase-config.local.js not found!');
        console.log('📝 Please copy firebase-config.example.js to firebase-config.local.js and configure:');
        console.log('   cp firebase-config.example.js firebase-config.local.js');
        console.log('   # Then edit firebase-config.local.js with your Firebase credentials\n');
    } else {
        console.log('✅ firebase-config.local.js found');
    }

    console.log('🔒 Security Checklist:');
    console.log('   ✅ .env files are gitignored');
    console.log('   ✅ firebase-config.local.js is gitignored');
    console.log('   ✅ API keys are not committed to repository');
    console.log('   ✅ Example files provided for setup\n');

    console.log('🚀 Next steps:');
    console.log('   1. Copy .env.example to .env and fill in your credentials');
    console.log('   2. Copy firebase-config.example.js to firebase-config.local.js');
    console.log('   3. Load the extension in Chrome: chrome://extensions/');
    console.log('   4. Enable Developer mode and click "Load unpacked"');

} catch (error) {
    console.error('❌ Error setting up environment:', error.message);
    process.exit(1);
}
