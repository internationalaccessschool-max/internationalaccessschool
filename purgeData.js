const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const fs = require("fs");

// Load environment variables manually
const envPath = ".env.local";
if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, "utf-8");
    envFile.split("\n").forEach((line) => {
        const [key, ...valueParts] = line.split("=");
        if (key && valueParts.length > 0) {
            process.env[key.trim()] = valueParts.join("=").trim().replace(/"/g, "");
        }
    });
}

const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;

if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
    console.error("Missing Firebase Admin credentials in .env.local");
    process.exit(1);
}

// Initialize Firebase Admin globally to avoid re-initialization
let app;
try {
    app = initializeApp({
        credential: cert({
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey,
        }),
    });
} catch (error) {
    if (error.code !== "app/duplicate-app") {
        console.error("Firebase Admin Initialization Error:", error);
        process.exit(1);
    }
}

const db = getFirestore();
const auth = getAuth();

async function purgeAll() {
    console.log("Starting a complete purge of test data including deep nested collections...");

    // 1. Delete authentication users
    try {
        const listUsersResult = await auth.listUsers(1000);
        const usersToDelete = listUsersResult.users
            .filter(u => u.email && u.email.endsWith('@ias.edu'))
            .map(u => u.uid);

        if (usersToDelete.length > 0) {
            await auth.deleteUsers(usersToDelete);
            console.log(`Deleted ${usersToDelete.length} test users from Firebase Auth.`);
        } else {
            console.log("No test users found in Firebase Auth.");
        }
    } catch (e) {
        console.log("Error wiping Auth:", e.message);
    }

    // 2. Deep recursive delete of collections
    const collectionsToDrop = ['students', 'classes', 'users'];

    for (const collName of collectionsToDrop) {
        console.log(`Attempting to recursively delete collection: ${collName}`);
        try {
            await db.recursiveDelete(db.collection(collName));
            console.log(`Successfully dropped ${collName} and all of its subcollections.`);
        } catch (e) {
            console.log(`Error dropping ${collName}:`, e.message);
        }
    }

    console.log("Purge complete.");
}

purgeAll().then(() => process.exit(0)).catch((e) => {
    console.error(e);
    process.exit(1);
});
