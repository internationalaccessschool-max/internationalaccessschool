/**
 * ONE-TIME SCRIPT: Fix admin account role + password
 * Run: node fix-admin.js
 * DELETE this file after running!
 */

require("dotenv").config({ path: ".env.local" });
const admin = require("firebase-admin");

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("❌ Missing Firebase Admin env vars. Check .env.local");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
});

const auth = admin.auth();
const db = admin.firestore();

const TARGET_EMAIL = "internationalaccessschool@gmail.com";
const NEW_PASSWORD = "password123";

async function fixAdmin() {
  try {
    // 1. Find user by email in Firebase Auth
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(TARGET_EMAIL);
      console.log("✅ User found in Auth. UID:", userRecord.uid);
    } catch (e) {
      console.error("❌ User not found in Firebase Auth:", TARGET_EMAIL);
      console.log("   → Go to Firebase Console > Authentication > Add user manually");
      process.exit(1);
    }

    const uid = userRecord.uid;

    // 2. Reset password
    await auth.updateUser(uid, { password: NEW_PASSWORD });
    console.log("✅ Password reset to:", NEW_PASSWORD);

    // 3. Set role = admin in Firestore users collection
    await db.collection("users").doc(uid).set(
      {
        uid,
        email: TARGET_EMAIL,
        role: "admin",
        name: "Admin",
      },
      { merge: true }
    );
    console.log("✅ Firestore role set to: admin");

    console.log("\n🎉 DONE! You can now login with:");
    console.log("   Email:   ", TARGET_EMAIL);
    console.log("   Password:", NEW_PASSWORD);
    console.log("\n⚠️  Please DELETE this file (fix-admin.js) after logging in!");

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    process.exit(0);
  }
}

fixAdmin();
