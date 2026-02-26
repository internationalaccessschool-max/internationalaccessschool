const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");

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

initializeApp({
    credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
    }),
});

const db = getFirestore();

async function check() {
    try {
        const snapshot = await db.collectionGroup("profiles").get();
        console.log(`Found ${snapshot.size} profiles via collectionGroup("profiles"):`);
        snapshot.forEach(doc => {
            const data = doc.data();
            console.log(`- ${data.firstName} ${data.lastName} (Class ${data.className}, Sec ${data.section}) Adm: ${data.admissionNumber}`);
        });

        // Check classes structure
        console.log("\nChecking 'classes' root collection:");
        const classes = await db.collection("users").doc("classes").collection("10").get();
        console.log(`Class 10 count from direct test paths? (We don't query this directly normally, but just checking)`);

    } catch (e) {
        console.error(e);
    }
}
check();
