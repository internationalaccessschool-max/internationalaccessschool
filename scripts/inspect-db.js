const admin = require("firebase-admin");
const serviceAccount = require("./service-account.json");

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function inspect() {
    console.log("Fetching flat feeRecords...");
    const flat = await db.collection("feeRecords").get();
    console.log("Flat records count:", flat.size);

    console.log("\nChecking nested records for 2026/months/3...");
    const classes = await db.collection("fees").doc("structure").collection("classes").get();
    console.log("Classes with fee structures:");
    for (const doc of classes.docs) {
        console.log(`- ${doc.id}`);
        const records = await db.collection("feeRecords").doc("2026").collection("months").doc("3").collection("classes").doc(doc.id).collection("records").get();
        console.log(`  -> Records nested here: ${records.size}`);
    }
}

inspect().catch(console.error);
