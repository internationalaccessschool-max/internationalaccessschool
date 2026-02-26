const fs = require('fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function checkUser(uid) {
    const userSnap = await db.collection('users').doc(uid).get();
    console.log(`User ${uid} exists:`, userSnap.exists);
    if (userSnap.exists) {
        console.log("User Data:", userSnap.data());
    }
}
checkUser("tKIDK9eBB5M5UPOiC78wyGKGKH82");
