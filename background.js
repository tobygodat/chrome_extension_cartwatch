// Background service worker for classification requests via Gemini.
// The service worker is persisted as a module (see manifest.json) so we can use top-level await if needed.

console.log("Background: Script loaded at", new Date().toISOString());

import { initializeApp } from "./vendor/firebase-app.js";
import {
    getFirestore,
    collection,
    query,
    where,
    getDocs,
    doc,
    getDoc,
} from "./vendor/firebase-firestore.js";

const GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_API_KEY = "AIzaSyC4K2AgeIpAcEPt4xXdXpDijgBdHQDu0WI";
const DEBUG = false;

// Firebase app and db instances
let firebaseApp = null;
let firebaseDb = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Background: Received message:", request);

    try {
        if (request?.action === "classifyPurchase") {
            classify(request.payload, sender.origin)
                .then(sendResponse)
                .catch((error) => {
                    console.error(
                        "Background: Error in classifyPurchase:",
                        error
                    );
                    sendResponse({ error: error.message || String(error) });
                });
            return true; // keep channel open for async response
        }
        if (request?.action === "getFinancialProfile") {
            console.log(
                "Background: Received getFinancialProfile request for customerId:",
                request.customerId
            );

            if (!request.customerId) {
                console.error("Background: No customerId provided");
                sendResponse({ error: "No customerId provided" });
                return true;
            }

            // Test: Send immediate response to verify communication works
            console.log("Background: About to call getFinancialProfile");

            getFinancialProfile(request.customerId)
                .then((result) => {
                    console.log(
                        "Background: Financial profile result:",
                        result
                    );
                    sendResponse(result);
                })
                .catch((error) => {
                    console.error(
                        "Background: Error fetching financial profile:",
                        error
                    );
                    sendResponse({ error: error.message || String(error) });
                });
            return true; // keep channel open for async response
        }
        if (request?.action === "getUserBalance") {
            console.log(
                "Background: Received getUserBalance request for customerId:",
                request.customerId
            );

            if (!request.customerId) {
                console.error("Background: No customerId provided");
                sendResponse({ error: "No customerId provided" });
                return true;
            }

            getUserBalance(request.customerId)
                .then((balance) => {
                    console.log("Background: User balance result:", balance);
                    sendResponse({ balance });
                })
                .catch((error) => {
                    console.error(
                        "Background: Error fetching user balance:",
                        error
                    );
                    sendResponse({ error: error.message || String(error) });
                });
            return true; // keep channel open for async response
        }
        if (request?.action === "getUserAccountData") {
            console.log(
                "Background: Received getUserAccountData request for firebaseUID:",
                request.firebaseUID
            );

            if (!request.firebaseUID) {
                console.error("Background: No firebaseUID provided");
                sendResponse({ error: "No firebaseUID provided" });
                return true;
            }

            getUserAccountData(request.firebaseUID)
                .then((userData) => {
                    console.log(
                        "Background: User account data result:",
                        userData
                    );
                    sendResponse({ userData });
                })
                .catch((error) => {
                    console.error(
                        "Background: Error fetching user account data:",
                        error
                    );
                    sendResponse({ error: error.message || String(error) });
                });
            return true; // keep channel open for async response
        }
        if (request?.action === "test") {
            console.log("Background: Test message received");
            sendResponse({
                status: "success",
                message: "Background script is working",
            });
            return true;
        }

        console.log(
            "Background: No matching action found for:",
            request?.action
        );
        sendResponse({ error: "Unknown action: " + request?.action });
        return true;
    } catch (error) {
        console.error("Background: Exception in message listener:", error);
        sendResponse({
            error:
                "Background script error: " + (error.message || String(error)),
        });
        return true;
    }
});

/**
 * Runs the Gemini classification flow, pulling configuration from storage when available.
 * @param {Record<string, unknown>} payload
 * @param {string | undefined} origin
 */
async function classify(payload, origin) {
    const apiKey = await resolveApiKey();
    if (!apiKey) {
        throw new Error("Gemini API key missing.");
    }

    const body = {
        contents: [
            {
                parts: [{ text: buildPrompt(payload) }],
            },
        ],
        generationConfig: {
            temperature: 0,
            topP: 0,
            maxOutputTokens: 512,
            responseMimeType: "application/json",
        },
    };

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        }
    );

    if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    logDebug("Gemini usage metadata", {
        origin,
        candidates: data.candidates?.length ?? 0,
        usage: data.usageMetadata,
    });

    // JSON parsing for checkout intent classification
    const parsed = extractJsonCandidate(data);
    return {
        isPurchase: Boolean(parsed.is_purchase ?? parsed.isPurchase),
        confidence: Number(parsed.confidence ?? 0),
        reason: parsed.reason || parsed.explanation || "",
        purchaseType: parsed.purchase_type || parsed.purchaseType || "other",
        item: parsed.item || null,
    };
}

/**
 * Returns the default Gemini API key.
 * @returns {Promise<string | null>}
 */
async function resolveApiKey() {
    return DEFAULT_API_KEY || null;
}

/**
 * Extracts structured JSON from Gemini response payload.
 * @param {any} response
 * @returns {Record<string, unknown>}
 */
function extractJsonCandidate(response) {
    const text = response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text || typeof text !== "string") {
        throw new Error("Empty response from Gemini");
    }

    const tryParse = (candidate) => {
        if (!candidate) return null;
        try {
            return JSON.parse(candidate);
        } catch (error) {
            return null;
        }
    };

    const direct = tryParse(text.trim());
    if (direct) return direct;

    const match = text.match(/\{[\s\S]*?\}/);
    if (match) {
        const fallback = tryParse(match[0]);
        if (fallback) return fallback;
    }

    throw new Error("Failed to parse Gemini JSON response");
}

/**
 * Builds the prompt sent to Gemini. Keep payload minimal to avoid leaking user PII.
 * @param {Record<string, unknown>} payload
 * @returns {string}
 */
function buildPrompt(payload) {
    const redacted = {
        url: payload?.url,
        title: payload?.title,
        text: payload?.text,
        contextPreview: Array.isArray(payload?.context)
            ? payload.context.slice(0, 3)
            : undefined,
        detectedSubtotal: payload?.detectedSubtotal || null,
        currencySymbol: payload?.currencySymbol || undefined,
    };

    // JSON format for checkout intent classification
    return `You are a checkout intent classifier. Respond ONLY with compact JSON matching:
{
  "is_purchase": boolean,
  "confidence": number,
  "reason": string,
  "purchase_type": "subscription" | "bnpl" | "one_time" | "other",
  "item": {
    "name": string | null,
    "unit_price": number | null,
    "quantity": number | null
  }
}

Infer item fields from the provided text/context. Use detectedSubtotal to sanity-check unit_price*quantity when possible.
Payload:\n${JSON.stringify(redacted, null, 2)}`;
}

/**
 * Fetches user's financial profile from Firestore
 * @param {string} customerId
 */
async function getFinancialProfile(customerId) {
    try {
        console.log(
            "Background: getFinancialProfile called with customerId:",
            customerId
        );

        // Initialize Firebase if not already done
        if (!firebaseApp) {
            const firebaseConfig = {
                apiKey: "AIzaSyCCGxpWlKYlVTS9raduQOzsL3nq-YSq1Ao",
                authDomain: "mvidia-c10e5.firebaseapp.com",
                projectId: "mvidia-c10e5",
                storageBucket: "mvidia-c10e5.firebasestorage.app",
                messagingSenderId: "276910117717",
                appId: "1:276910117717:ios:9d4212c3baa6d6ce48d5dc",
            };
            firebaseApp = initializeApp(firebaseConfig);
            firebaseDb = getFirestore(firebaseApp);
        }

        const db = firebaseDb;

        // Get financial profile document directly by customerId as document ID
        console.log(
            "Background: Fetching financial profile document by ID:",
            customerId
        );
        
        const docRef = doc(db, "financial_profiles", customerId);
        const docSnap = await getDoc(docRef);
        
        console.log("Background: Document exists:", docSnap.exists());
        
        if (!docSnap.exists()) {
            console.log(
                "Background: No financial profile found for customerId:",
                customerId
            );
            return { profile: null };
        }

        // Return the financial profile data (data is at top level, not nested)
        const profileData = docSnap.data();
        console.log("Background: Found financial profile document:", docSnap.id);
        console.log("Background: Financial profile data:", profileData);
        console.log("Background: Financial profile fields:", Object.keys(profileData));
        console.log("Background: Final adjusted FCF:", profileData.final_adjusted_fcf);
        return { profile: profileData };
    } catch (error) {
        console.error("Error fetching user financial profile:", error);
        throw error;
    }
}

/**
 * Fetches user's total balance from accounts collection
 * @param {string} customerId
 */
async function getUserBalance(customerId) {
    try {
        console.log(
            "Background: getUserBalance called with customerId:",
            customerId
        );

        // Initialize Firebase if not already done
        if (!firebaseApp) {
            const firebaseConfig = {
                apiKey: "AIzaSyCCGxpWlKYlVTS9raduQOzsL3nq-YSq1Ao",
                authDomain: "mvidia-c10e5.firebaseapp.com",
                projectId: "mvidia-c10e5",
                storageBucket: "mvidia-c10e5.firebasestorage.app",
                messagingSenderId: "276910117717",
                appId: "1:276910117717:ios:9d4212c3baa6d6ce48d5dc",
            };
            firebaseApp = initializeApp(firebaseConfig);
            firebaseDb = getFirestore(firebaseApp);
        }

        const db = firebaseDb;
        const accountsCollection = collection(db, "accounts");

        // Query accounts collection for the user's accounts using customerId
        console.log(
            "Background: Querying accounts for customerId:",
            customerId
        );
        const q = query(
            accountsCollection,
            where("customer_firestore_id", "==", customerId)
        );

        const querySnapshot = await getDocs(q);
        console.log(
            "Background: Accounts query snapshot size:",
            querySnapshot.size
        );

        if (querySnapshot.empty) {
            console.log(
                "Background: No accounts found for customerId:",
                customerId
            );
            return 0;
        }

        // Sum up all account balances
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
            "Background: Total balance for customer",
            customerId,
            ":",
            totalBalance
        );
        return totalBalance;
    } catch (error) {
        console.error("Error fetching user balance:", error);
        throw error;
    }
}

/**
 * Fetches user account data from user_accounts collection
 * @param {string} firebaseUID
 */
async function getUserAccountData(firebaseUID) {
    try {
        console.log(
            "Background: getUserAccountData called with firebaseUID:",
            firebaseUID
        );

        // Initialize Firebase if not already done
        if (!firebaseApp) {
            const firebaseConfig = {
                apiKey: "AIzaSyCCGxpWlKYlVTS9raduQOzsL3nq-YSq1Ao",
                authDomain: "mvidia-c10e5.firebaseapp.com",
                projectId: "mvidia-c10e5",
                storageBucket: "mvidia-c10e5.firebasestorage.app",
                messagingSenderId: "276910117717",
                appId: "1:276910117717:ios:9d4212c3baa6d6ce48d5dc",
            };
            firebaseApp = initializeApp(firebaseConfig);
            firebaseDb = getFirestore(firebaseApp);
        }

        const db = firebaseDb;
        const userAccountsCollection = collection(db, "user_accounts");

        // Query user_accounts collection for the user's account data
        console.log(
            "Background: Querying user_accounts for firebase_uid:",
            firebaseUID
        );
        console.log(
            "Background: Looking for document in 'user_accounts' collection where firebase_uid =",
            firebaseUID
        );

        const q = query(
            userAccountsCollection,
            where("firebase_uid", "==", firebaseUID)
        );

        console.log("Background: Executing query:", q);
        const querySnapshot = await getDocs(q);
        console.log(
            "Background: User accounts query snapshot size:",
            querySnapshot.size
        );

        if (querySnapshot.empty) {
            console.log(
                "Background: ❌ No user account found for firebaseUID:",
                firebaseUID
            );
            console.log(
                "Background: Expected document structure: { firebase_uid: '" +
                    firebaseUID +
                    "', ... }"
            );
            return null;
        }

        const doc = querySnapshot.docs[0];
        const userData = { id: doc.id, ...doc.data() };
        console.log("Background: ✅ Found user account document:", doc.id);
        console.log("Background: Document data:", userData);
        return userData;
    } catch (error) {
        console.error("Error fetching user account data:", error);
        throw error;
    }
}

function logDebug(message, detail) {
    if (!DEBUG) return;
    console.log(`[CheckoutGuard] ${message}`, detail);
}
