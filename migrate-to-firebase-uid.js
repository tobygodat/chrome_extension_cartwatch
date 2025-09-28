// Migration script to update Firestore collections to use Firebase UIDs
// Run this in your Firebase console or as a Cloud Function

import { initializeApp } from "firebase/app";
import {
    getFirestore,
    collection,
    doc,
    getDocs,
    setDoc,
    deleteDoc,
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

async function migrateAccountsToFirebaseUID() {
    console.log("Starting migration of accounts collection...");

    // Get all accounts
    const accountsSnapshot = await getDocs(collection(db, "accounts"));

    for (const accountDoc of accountsSnapshot.docs) {
        const accountData = accountDoc.data();
        const oldCustomerId = accountData.customer_firestore_id;

        if (oldCustomerId) {
            // Find the corresponding Firebase UID
            // You'll need to map your old customer IDs to Firebase UIDs
            const firebaseUID = await findFirebaseUIDForCustomer(oldCustomerId);

            if (firebaseUID) {
                // Create new document with Firebase UID
                await setDoc(
                    doc(
                        db,
                        "accounts",
                        firebaseUID,
                        "account_" + accountDoc.id
                    ),
                    {
                        ...accountData,
                        customer_firestore_id: firebaseUID,
                    }
                );

                // Delete old document
                await deleteDoc(accountDoc.ref);
                console.log(
                    `Migrated account ${accountDoc.id} for customer ${oldCustomerId} to Firebase UID ${firebaseUID}`
                );
            }
        }
    }
}

async function migrateFinancialProfilesToFirebaseUID() {
    console.log("Starting migration of financial_profiles collection...");

    // Get all financial profiles
    const profilesSnapshot = await getDocs(
        collection(db, "financial_profiles")
    );

    for (const profileDoc of profilesSnapshot.docs) {
        const profileData = profileDoc.data();
        const oldCustomerId = profileData.customer_firestore_id;

        if (oldCustomerId) {
            // Find the corresponding Firebase UID
            const firebaseUID = await findFirebaseUIDForCustomer(oldCustomerId);

            if (firebaseUID) {
                // Create new document with Firebase UID as document ID
                await setDoc(doc(db, "financial_profiles", firebaseUID), {
                    ...profileData,
                    customer_firestore_id: firebaseUID,
                });

                // Delete old document
                await deleteDoc(profileDoc.ref);
                console.log(
                    `Migrated financial profile for customer ${oldCustomerId} to Firebase UID ${firebaseUID}`
                );
            }
        }
    }
}

async function findFirebaseUIDForCustomer(oldCustomerId) {
    // This function needs to be implemented based on your data structure
    // You might have a mapping table or need to look up by email/username

    // Option 1: If you have a mapping collection
    const mappingQuery = query(
        collection(db, "customer_mappings"),
        where("old_customer_id", "==", oldCustomerId)
    );
    const mappingSnapshot = await getDocs(mappingQuery);

    if (!mappingSnapshot.empty) {
        return mappingSnapshot.docs[0].data().firebase_uid;
    }

    // Option 2: If you can look up by email
    // const emailQuery = query(
    //     collection(db, 'user_accounts'),
    //     where('customerID', '==', oldCustomerId)
    // );
    // const emailSnapshot = await getDocs(emailQuery);
    // if (!emailSnapshot.empty) {
    //     const email = emailSnapshot.docs[0].data().email;
    //     // Find Firebase user by email and return UID
    // }

    return null;
}

// Run migration
async function runMigration() {
    try {
        await migrateAccountsToFirebaseUID();
        await migrateFinancialProfilesToFirebaseUID();
        console.log("Migration completed successfully!");
    } catch (error) {
        console.error("Migration failed:", error);
    }
}

// Uncomment to run migration
// runMigration();
