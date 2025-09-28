document.addEventListener("DOMContentLoaded", async () => {
    const message = document.getElementById("statusMessage");
    if (message) {
        message.textContent =
            "Inline detector active. Click payment buttons to see popups.";
    }

    // Try to fetch fresh balance from Firestore
    await refreshBalanceFromFirestore();
});

const STORAGE_KEYS = {
    SUMMARY: "checkout_guard_summary",
};

const balanceNode = document.getElementById("popupBalance");
const signOutLink = document.getElementById("signOut");
const statusNode = document.getElementById("statusMessage");

if (signOutLink) {
    signOutLink.addEventListener("click", async (event) => {
        event.preventDefault();
        await signOut();
    });
}

async function refreshBalanceFromFirestore() {
    try {
        // Get user data from local storage
        const userData = await chrome.storage.local.get("cartwatch_user_data");
        const user = userData.cartwatch_user_data;

        console.log("Popup: Retrieved user data:", user);
        console.log("Popup: User uid:", user?.uid);
        console.log("Popup: User customerId:", user?.customerId);

        if (!user || !user.uid) {
            console.log("No user data found, skipping balance refresh");
            // Show loading state
            if (balanceNode) balanceNode.textContent = "Loading...";
            return;
        }

        if (!user.customerId) {
            console.log("No customerId found in user data, skipping balance refresh");
            if (balanceNode) balanceNode.textContent = "No customer ID";
            return;
        }

        // Show loading state
        if (balanceNode) balanceNode.textContent = "Loading...";

        // Import the getUserBalance function
        const { getUserBalance } = await import("./firestore.js");

        // Fetch fresh balance from Firestore using customerId
        const balance = await getUserBalance(user.customerId);

        // Update the stored balance
        await chrome.storage.sync.set({
            checkout_guard_user_balance: balance,
        });

        // Update the display with fresh data
        const formatted = formatCurrency(balance);
        if (balanceNode) balanceNode.textContent = formatted;

        console.log("Balance refreshed from Firestore:", balance);
    } catch (error) {
        console.error("Failed to refresh balance from Firestore:", error);
        // Fall back to default display
        if (balanceNode) balanceNode.textContent = "$0.00";
    }
}

async function refreshSummary() {
    try {
        const stored = await chrome.storage.local.get(STORAGE_KEYS.SUMMARY);
        const summary = stored?.[STORAGE_KEYS.SUMMARY];
        if (!statusNode) return;
        if (!summary || summary.status !== "active") {
            statusNode.textContent = "Not on a checkout page.";
            return;
        }
        const formattedTotal = formatCurrency(summary.total);
        statusNode.textContent =
            summary.paymentHint === "bnpl"
                ? `Installment plan detected — checkout total ${formattedTotal}`
                : `Checkout detected — cart total ${formattedTotal}`;
    } catch (error) {
        console.error("Popup: failed to load summary", error);
    }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (
        areaName === "local" &&
        Object.prototype.hasOwnProperty.call(changes, STORAGE_KEYS.SUMMARY)
    ) {
        refreshSummary();
    }
});

// Always try to get fresh data from Firestore first
refreshBalanceFromFirestore();
refreshSummary();

async function signOut() {
    try {
        // Clear all stored user data
        await chrome.storage.local.clear();
        await chrome.storage.sync.clear();

        // Reset the popup to show logged out state
        if (balanceNode) balanceNode.textContent = "$0.00";
        if (statusNode) statusNode.textContent = "Please sign in to continue.";

        // Change the popup back to login page
        try {
            chrome.action.setPopup({ popup: "login.html" });
        } catch (error) {
            console.log("Could not set popup:", error);
        }

        // Navigate to login page
        window.location.href = "login.html";

        console.log("User signed out successfully");
    } catch (error) {
        console.error("Error during sign out:", error);
    }
}

function formatCurrency(value) {
    const amount =
        typeof value === "number" && Number.isFinite(value) ? value : 0;
    return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
    }).format(amount);
}
