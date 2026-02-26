const admin = require('firebase-admin');
require('dotenv').config({ path: '.env.local' });

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        })
    });
}

const db = admin.firestore();

async function check() {
    console.log("Checking classes collection...");
    const snap = await db.collection("classes").get();
    if (snap.empty) {
        console.log("Classes collection is EMPTY.");
    } else {
        console.log(`Found ${snap.size} class documents.`);
        for (const doc of snap.docs) {
            console.log(`- ${doc.id}`);
        }
    }
}

check().catch(console.error);
