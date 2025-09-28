// Script to update field names in existing Firestore collections
// This updates customer_firestore_id to firebase_uid

import { initializeApp } from "firebase/app";
import {
    getFirestore,
    collection,
    doc,
    getDocs,
    updateDoc,
    query,
    where,
} from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyCCGxpWlKYlVTS9raduQOzsL3nq-YSq1Ao",
    authDomain: "mvidia-c10e5.firebaseapp.com",
    projectId: "mvidia-c10e5",
    storageBucket: "mvidia-c10e5.firebasestorage.app",
    messagingSenderId: "276910117717",
    appId: "1:276910117717:ios:9d4212c3baa6d6ce48d5dc",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function updateFieldNames() {
    console.log("Updating field names in Firestore collections...");

    // Update accounts collection
    const accountsSnapshot = await getDocs(collection(db, "accounts"));
    for (const accountDoc of accountsSnapshot.docs) {
        const data = accountDoc.data();
        if (data.customer_firestore_id) {
            await updateDoc(accountDoc.ref, {
                firebase_uid: data.customer_firestore_id,
                customer_firestore_id: null, // Remove old field
            });
            console.log(`Updated account ${accountDoc.id}`);
        }
    }

    // Update financial_profiles collection
    const profilesSnapshot = await getDocs(
        collection(db, "financial_profiles")
    );
    for (const profileDoc of profilesSnapshot.docs) {
        const data = profileDoc.data();
        if (data.customer_firestore_id) {
            await updateDoc(profileDoc.ref, {
                firebase_uid: data.customer_firestore_id,
                customer_firestore_id: null, // Remove old field
            });
            console.log(`Updated financial profile ${profileDoc.id}`);
        }
    }

    console.log("Field name updates completed!");
}

// Uncomment to run
// updateFieldNames();
