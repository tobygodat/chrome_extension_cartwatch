import { db } from "./firebase-config.js";
import {
    collection,
    doc,
    getDoc,
    setDoc,
    query,
    where,
    getDocs,
} from "../vendor/firebase-firestore.js";

const usersCollection = collection(db, "users");

export async function addUserToFirestore(user) {
    const userRef = doc(usersCollection, user.uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
        await setDoc(userRef, {
            email: user.email,
            createdAt: new Date(),
        });
    }
}

export async function getUserFromFirestore(user) {
    const userRef = doc(usersCollection, user.uid);
    const userDoc = await getDoc(userRef);

    return userDoc.exists() ? userDoc.data() : null;
}

export async function logInAuth(email, password) {
    Auth.auth().signInWithEmailAndPassword(email, password);
}

export async function checkUserCredentials(username, password) {
    try {
        // Query the user_accounts collection for matching username and password
        const { query, where, getDocs, collection } = await import(
            "../vendor/firebase-firestore.js"
        );
        const userAccountsCollection = collection(db, "user_accounts");

        const q = query(
            userAccountsCollection,
            where("username", "==", username),
            where("password", "==", password)
        );

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            return null;
        }

        // Return the first matching document
        const doc = querySnapshot.docs[0];
        return { id: doc.id, ...doc.data() };
    } catch (error) {
        console.error("Error checking user credentials:", error);
        return null;
    }
}

export async function getUserAccountData(firebaseUID) {
    try {
        console.log("getUserAccountData called with firebaseUID:", firebaseUID);
        console.log(
            "Looking for document in 'user_accounts' collection where firebase_uid =",
            firebaseUID
        );
        console.log("Firebase db object:", db);

        const userAccountsCollection = collection(db, "user_accounts");
        console.log("Collection reference:", userAccountsCollection);

        const q = query(
            userAccountsCollection,
            where("firebase_uid", "==", firebaseUID)
        );

        console.log("Executing query:", q);
        console.log("Query details:", {
            collection: "user_accounts",
            field: "firebase_uid",
            operator: "==",
            value: firebaseUID,
        });
        const querySnapshot = await getDocs(q);
        console.log("User accounts query snapshot size:", querySnapshot.size);
        console.log(
            "Query snapshot docs:",
            querySnapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() }))
        );

        if (querySnapshot.empty) {
            console.log(
                "❌ No user account found for firebaseUID:",
                firebaseUID
            );
            console.log(
                "Expected document structure: { firebase_uid: '" +
                    firebaseUID +
                    "', ... }"
            );
            console.log("UID length:", firebaseUID.length);
            console.log(
                "UID characters:",
                firebaseUID
                    .split("")
                    .map((c, i) => `${i}: '${c}'`)
                    .join(", ")
            );
            return null;
        }

        const doc = querySnapshot.docs[0];
        const userData = { id: doc.id, ...doc.data() };
        console.log("✅ Found user account document:", doc.id);
        console.log("Document data:", userData);
        return userData;
    } catch (error) {
        console.error("Error fetching user account data:", error);
        return null;
    }
}

export async function getUserBalance(customerId) {
    try {
        console.log("getUserBalance called with customerId:", customerId);

        // Validate customerId
        if (!customerId || customerId === undefined) {
            console.error(
                "Invalid customerId provided to getUserBalance:",
                customerId
            );
            return 0;
        }

        const accountsCollection = collection(db, "accounts");

        // Query accounts collection for the user's account using customerId
        const q = query(
            accountsCollection,
            where("customer_firestore_id", "==", customerId)
        );

        const querySnapshot = await getDocs(q);
        console.log("Query snapshot size:", querySnapshot.size);

        if (querySnapshot.empty) {
            console.log("No accounts found for customer:", customerId);
            console.log("Query was:", q);
            return 0;
        }

        // Sum up all account balances for the user
        let totalBalance = 0;
        querySnapshot.forEach((doc) => {
            const accountData = doc.data();
            if (
                accountData.balance &&
                typeof accountData.balance === "number"
            ) {
                totalBalance += accountData.balance;
            }
        });

        console.log(
            "Total balance for customer",
            customerId,
            ":",
            totalBalance
        );
        return totalBalance;
    } catch (error) {
        console.error("Error fetching user balance:", error);
        return 0;
    }
}

export async function getUserFinancialProfile(customerId) {
    try {
        console.log(
            "getUserFinancialProfile called with customerId:",
            customerId
        );

        // Validate customerId
        if (!customerId || customerId === undefined) {
            console.error(
                "Invalid customerId provided to getUserFinancialProfile:",
                customerId
            );
            return null;
        }

        const financialProfilesCollection = doc(
            db,
            "financial_profiles",
            customerId
        );

        // Query financial_profiles collection for the user's profile using customerId
        

        const querySnapshot = await getDoc(financialProfilesCollection);
        

        if (querySnapshot.empty) {
            console.log("No financial profile found for customer:", customerId);
            return null;
        }

        // Return the first matching financial profile
        const profileData = { id: doc.id, ...querySnapshot.data() };
        console.log("Financial profile data:", profileData);
        return profileData;
    } catch (error) {
        console.error("Error fetching user financial profile:", error);
        return null;
    }
}
