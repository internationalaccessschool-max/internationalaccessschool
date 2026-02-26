/**
 * clear-student-data.js
 *
 * Deletes ALL student profile documents from Firestore and cleans up
 * the nested class/section collections under users/classes.
 *
 * Usage:
 *   node scripts/clear-student-data.js
 *
 * Requires:
 *   - firebase-admin installed (it's already in your project)
 *   - Your serviceAccountKey.json file in the project root
 *     OR set GOOGLE_APPLICATION_CREDENTIALS env var
 */

const admin = require("firebase-admin");
const path = require("path");

// ── Initialize ──────────────────────────────────────────────────────────────
// Try loading the service account key from root
let serviceAccount;
try {
    serviceAccount = require(path.join(__dirname, "..", "serviceAccountKey.json"));
} catch (e) {
    console.error("❌ Could not find serviceAccountKey.json in the project root.");
    console.error("   Place your Firebase service account key as 'serviceAccountKey.json' in the project root.");
    process.exit(1);
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

const db = admin.firestore();
const auth = admin.auth();

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Deletes all documents in a collection, in batches.
 */
async function deleteCollection(collectionRef, batchSize = 100) {
    let deleted = 0;
    let snapshot = await collectionRef.limit(batchSize).get();
    while (!snapshot.empty) {
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        deleted += snapshot.size;
        console.log(`   Deleted ${deleted} docs so far...`);
        snapshot = await collectionRef.limit(batchSize).get();
    }
    return deleted;
}

/**
 * Deletes docs and recurses into sub-collections.
 */
async function deleteDocumentAndSubcollections(docRef) {
    const subCollections = await docRef.listCollections();
    for (const subCol of subCollections) {
        const subDocs = await subCol.get();
        for (const subDoc of subDocs.docs) {
            await deleteDocumentAndSubcollections(subDoc.ref);
        }
    }
    await docRef.delete();
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log("\n🚨 STUDENT DATA CLEANUP SCRIPT 🚨");
    console.log("This will delete ALL student profile documents from Firestore.");
    console.log("It will also delete the 'users/classes' document and its entire nested structure.\n");

    // Step 1: Find all student profiles via collectionGroup
    console.log("📋 Step 1: Finding all student profiles...");
    const profilesSnap = await db.collectionGroup("profiles").get();
    console.log(`   Found ${profilesSnap.size} student profile documents.`);

    // Step 2: Delete all Firebase Auth accounts for students
    console.log("\n🔑 Step 2: Deleting Firebase Auth accounts for students...");
    let authDeleted = 0;
    let authFailed = 0;
    for (const doc of profilesSnap.docs) {
        const uid = doc.id;
        const data = doc.data();
        try {
            await auth.deleteUser(uid);
            authDeleted++;
            console.log(`   ✅ Deleted Auth user: ${data.firstName || ""} ${data.lastName || ""} (${data.email || uid})`);
        } catch (e) {
            if (e.code === "auth/user-not-found") {
                console.log(`   ⚠️  Auth user not found for uid ${uid} (skipping)`);
            } else {
                console.error(`   ❌ Failed to delete auth for ${uid}:`, e.message);
                authFailed++;
            }
        }
    }
    console.log(`   Auth accounts deleted: ${authDeleted}, Failed: ${authFailed}`);

    // Step 3: Delete the entire users/classes subtree
    console.log("\n🗂️  Step 3: Deleting users/classes document and all nested collections...");
    const classesDocRef = db.collection("users").doc("classes");
    const classesDoc = await classesDocRef.get();
    if (classesDoc.exists) {
        await deleteDocumentAndSubcollections(classesDocRef);
        console.log("   ✅ Deleted users/classes and all nested documents.");
    } else {
        console.log("   ℹ️  users/classes document does not exist (nothing to delete).");
    }

    // Step 4: Also clean up the top-level `classes` collection if it exists separately
    console.log("\n📁 Step 4: Checking for top-level 'classes' collection...");
    const classesColRef = db.collection("classes");
    const classColSnap = await classesColRef.limit(1).get();
    if (!classColSnap.empty) {
        const count = await deleteCollection(classesColRef);
        console.log(`   ✅ Deleted ${count} documents from top-level 'classes' collection.`);
    } else {
        console.log("   ℹ️  No top-level 'classes' collection found.");
    }

    console.log("\n🎉 CLEANUP COMPLETE!");
    console.log("   You can now re-import students using the bulk import page.\n");
    process.exit(0);
}

main().catch(err => {
    console.error("\n❌ Script failed:", err);
    process.exit(1);
});
