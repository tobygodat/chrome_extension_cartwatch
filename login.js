// login.js (MV3 compatible with Firebase Auth)
console.log("🚀 LOGIN.JS SCRIPT LOADED");

// Import modules
import { auth } from "./firebase-config.js";
import { signInWithEmailAndPassword } from "../vendor/firebase-auth.js";
import {
    addUserToFirestore,
    getUserFromFirestore,
    getUserBalance,
    getUserAccountData,
} from "./firestore.js";

console.log("✅ All modules imported successfully");

const $ = (s) => document.querySelector(s);
const ui = {
    user: $("#username"),
    pass: $("#password"),
    submit: $("#submit"),
    error: $("#error"),
};

const STORAGE_KEYS = {
    SESSION: "cartwatch_session",
    SIGNED_AT: "cartwatch_signed_in_at",
    USER_DATA: "cartwatch_user_data",
};

function setLoading(loading) {
    ui.submit.disabled = loading;
    ui.submit.textContent = loading ? "Signing in..." : "Continue";
}

function showError(msg) {
    ui.error.textContent = msg || "";
    const invalid = Boolean(msg);
    ui.user.classList.toggle("invalid", invalid);
    ui.pass.classList.toggle("invalid", invalid);
}

function showSuccess(msg) {
    ui.error.textContent = msg || "";
    ui.error.style.color = "#10b981"; // Green color for success
    ui.user.classList.remove("invalid");
    ui.pass.classList.remove("invalid");
}

async function saveSession(firebaseUser, userAccountData, balance) {
    const area = chrome.storage.local;

    const userData = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        balance: balance,
        token: firebaseUser.uid, // Using Firebase UID as token
        // Include user account data
        customerId: userAccountData.CustomerID || userAccountData.customerID,
        savings_goal: userAccountData.savings_goal,
        username: userAccountData.username,
    };

    await area.set({
        [STORAGE_KEYS.SESSION]: userData.token,
        [STORAGE_KEYS.USER_DATA]: userData,
        [STORAGE_KEYS.SIGNED_AT]: Date.now(),
    });

    // Also store balance in sync storage for the popup to access
    await chrome.storage.sync.set({
        checkout_guard_user_balance: balance,
    });
}

async function login(email, password) {
    try {
        console.log("=== LOGIN START ===");
        console.log("Attempting to sign in with Firebase Auth for:", email);

        // Sign in with Firebase Auth
        const userCredential = await signInWithEmailAndPassword(
            auth,
            email,
            password
        );
        const firebaseUser = userCredential.user;

        console.log("Firebase Auth successful for user:", firebaseUser.uid);
        console.log("Full Firebase UID:", firebaseUser.uid);
        console.log("UID length:", firebaseUser.uid.length);
        console.log(
            "UID characters:",
            firebaseUser.uid
                .split("")
                .map((c, i) => `${i}: '${c}'`)
                .join(", ")
        );

        // Add user to Firestore if they don't exist
        await addUserToFirestore(firebaseUser);

        // Get user data from user_accounts collection using Firebase UID
        console.log(
            "About to call getUserAccountData with UID:",
            firebaseUser.uid
        );
        const userAccountData = await getUserAccountData(firebaseUser.uid);
        console.log(
            "User account data from user_accounts collection:",
            userAccountData
        );

        if (!userAccountData) {
            console.log(
                "❌ ERROR: No user account data returned from getUserAccountData"
            );
            throw new Error(
                "User account not found in user_accounts collection"
            );
        }

        // Get user's balance using the customer ID from user_accounts
        const customerId =
            userAccountData.CustomerID || userAccountData.customerID;
        const balance = await getUserBalance(customerId);
        console.log("User balance:", balance);

        console.log("Saving session data...");
        await saveSession(firebaseUser, userAccountData, balance);

        console.log("Login process completed successfully");
        console.log("Customer ID (Firebase UID):", firebaseUser.uid);

        return {
            user: firebaseUser,
            uid: firebaseUser.uid,
        };
    } catch (error) {
        console.error("Login error:", error);
        throw new Error(error.message || "Login failed");
    }
}

function validate(email, password) {
    if (!email || !password) return "Enter your email and password.";
    if (!email.includes("@")) return "Please enter a valid email address.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    return null;
}

async function onSubmit(ev) {
    console.log("=== FORM SUBMISSION STARTED ===");
    ev?.preventDefault?.();
    const email = ui.user.value.trim();
    const password = ui.pass.value;
    console.log("Form submitted with email:", email);

    const v = validate(email, password);
    if (v) {
        showError(v);
        return;
    }

    showError("");
    setLoading(true);
    try {
        await login(email, password);

        // Show success message
        showSuccess("Authentication successful!");

        // Wait a moment to show the success message, then navigate
        setTimeout(() => {
            // Make popup the default after successful login and navigate
            try {
                chrome.action.setPopup({ popup: "popup.html" });
            } catch (error) {
                console.log("Could not set popup:", error);
            }
            window.location.href = "popup.html";
        }, 1500);
    } catch (e) {
        console.error("Login error details:", e);
        console.log("=== LOGIN ERROR ===");

        // Handle Firebase Auth error codes
        if (e.code === "auth/user-not-found") {
            showError("No account found with this email address.");
        } else if (e.code === "auth/wrong-password") {
            showError("Incorrect password.");
        } else if (e.code === "auth/invalid-email") {
            showError("Invalid email address.");
        } else if (e.code === "auth/too-many-requests") {
            showError("Too many failed attempts. Please try again later.");
        } else if (e.code === "auth/user-disabled") {
            showError("This account has been disabled.");
        } else if (e.code === "auth/network-request-failed") {
            showError("Network error. Please check your connection.");
        } else {
            showError(e.message || "Could not sign in.");
        }
    } finally {
        setLoading(false);
    }
}

function onKey(ev) {
    if (ev.key === "Enter") onSubmit(ev);
}

console.log("Adding event listeners...");
console.log("UI elements:", {
    user: ui.user,
    pass: ui.pass,
    submit: ui.submit,
    error: ui.error,
});

if (ui.submit) {
    ui.submit.addEventListener("click", (ev) => {
        console.log("Submit button clicked!");
        onSubmit(ev);
    });
} else {
    console.error("❌ Submit button not found!");
}

if (ui.pass) {
    ui.pass.addEventListener("keydown", (ev) => {
        console.log("Password field keydown:", ev.key);
        onKey(ev);
    });
} else {
    console.error("❌ Password field not found!");
}

if (ui.user) {
    ui.user.addEventListener("keydown", (ev) => {
        console.log("Email field keydown:", ev.key);
        onKey(ev);
    });
} else {
    console.error("❌ Email field not found!");
}

console.log("Event listeners added successfully");

// Initialize Firebase when page loads
document.addEventListener("DOMContentLoaded", async () => {
    console.log("=== PAGE LOADED ===");
    console.log("UI elements found:", {
        user: !!ui.user,
        pass: !!ui.pass,
        submit: !!ui.submit,
    });

    try {
        // The initFirebase function is removed, so we directly use the imported auth object.
        // If other Firebase initialization is needed, it should be handled here.
        console.log("Firebase auth object:", auth);
    } catch (error) {
        console.error("Failed to initialize Firebase:", error);
        showError("Failed to initialize authentication");
    }
});
