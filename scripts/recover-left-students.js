/**
 * RECOVERY SCRIPT — Restore LEFT students from studentLookup
 * 
 * studentLookup mein LEFT students ka basic data hai.
 * Yeh script unhe wapas profiles collection mein restore karega.
 * 
 * Run: node scripts/recover-left-students.js
 * 
 * Requirements:
 *   npm install firebase-admin
 *   GOOGLE_APPLICATION_CREDENTIALS env set honi chahiye
 *   Ya neeche serviceAccount path set karo
 */

const admin = require("firebase-admin");

// ─── Firebase Init ────────────────────────────────────────────────────────────
// Option A: Service account file se (recommended)
// const serviceAccount = require("../serviceAccountKey.json");
// admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

// Option B: Environment variable se (agar GOOGLE_APPLICATION_CREDENTIALS set hai)
admin.initializeApp();

const db = admin.firestore();

// ─── Config ───────────────────────────────────────────────────────────────────
const DRY_RUN = true; // TRUE = sirf report karo, kuch save mat karo
                      // FALSE karo jab actually restore karna ho

async function main() {
    console.log("\n========================================");
    console.log("  LEFT STUDENT RECOVERY SCRIPT");
    console.log(`  Mode: ${DRY_RUN ? "DRY RUN (no changes)" : "LIVE (will write to DB)"}`);
    console.log("========================================\n");

    // 1. Sare studentLookup docs fetch karo
    console.log("📥 Fetching all studentLookup entries...");
    const lookupSnap = await db.collection("studentLookup").get();
    console.log(`   Found ${lookupSnap.size} total entries in studentLookup\n`);

    // 2. LEFT status wale filter karo
    const leftStudents = [];
    lookupSnap.forEach(doc => {
        const data = doc.data();
        const status = (data.status || "").toUpperCase();
        if (status === "LEFT" || status === "TC" || status === "INACTIVE") {
            leftStudents.push({ uid: doc.id, ...data });
        }
    });

    console.log(`🔍 Found ${leftStudents.length} LEFT/TC/INACTIVE students in studentLookup\n`);

    if (leftStudents.length === 0) {
        console.log("✅ No LEFT students found. Nothing to restore.");
        return;
    }

    // 3. Check which ones are already in profiles (existing ones skip karo)
    let alreadyExists = 0;
    let toRestore = 0;
    let errors = 0;

    const results = [];

    for (const student of leftStudents) {
        const { uid, name, className, section, admissionNumber, mobileNo, email, status } = student;

        if (!className || !section) {
            console.warn(`⚠️  SKIP ${name || uid} — className or section missing in lookup`);
            errors++;
            results.push({ uid, name, status: "SKIP - missing class/section", className, section });
            continue;
        }

        // Check if profile already exists
        const profilePath = `users/classes/${className}/sections/${section}/students/profiles/${uid}`;
        const profileRef = db.doc(profilePath);
        const profileSnap = await profileRef.get();

        if (profileSnap.exists()) {
            alreadyExists++;
            results.push({ uid, name, admissionNumber, className, section, status: "ALREADY_EXISTS" });
            continue;
        }

        toRestore++;
        results.push({ uid, name, admissionNumber, className, section, mobileNo, email, lookupStatus: status, status: "WILL_RESTORE" });

        if (!DRY_RUN) {
            try {
                // Restore minimal profile from lookup data
                await profileRef.set({
                    id: uid,
                    uid,
                    email: email || `${admissionNumber || uid}@ias.edu`,
                    role: "student",
                    name: name || "",
                    firstName: (name || "").split(" ")[0] || "",
                    lastName: (name || "").split(" ").slice(1).join(" ") || "",
                    className,
                    currentClass: className,
                    section,
                    admissionNumber: admissionNumber || "",
                    mobileNo: mobileNo || "",
                    status: status || "LEFT",   // Keep original status
                    restoredFromLookup: true,   // Flag so you know it was recovered
                    restoredAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true }); // merge: true — existing fields won't be overwritten

                console.log(`  ✅ RESTORED: ${name} (${admissionNumber}) → Class ${className}-${section}`);
            } catch (err) {
                console.error(`  ❌ FAILED: ${name} — ${err.message}`);
                errors++;
            }
        }
    }

    // 4. Summary report
    console.log("\n========================================");
    console.log("  SUMMARY REPORT");
    console.log("========================================");
    console.log(`Total LEFT students found:  ${leftStudents.length}`);
    console.log(`Already in DB (skip):       ${alreadyExists}`);
    console.log(`To be restored:             ${toRestore}`);
    console.log(`Errors/Skipped:             ${errors}`);

    console.log("\n📋 Detail List:");
    console.log("─".repeat(80));
    console.table(results.map(r => ({
        Name: r.name || "—",
        Admission: r.admissionNumber || "—",
        Class: r.className || "—",
        Section: r.section || "—",
        Status: r.status,
    })));

    if (DRY_RUN && toRestore > 0) {
        console.log("\n⚠️  DRY RUN mode — No changes made.");
        console.log("   Agar restore karna hai toh DRY_RUN = false karo aur script dobara chalao.\n");
    } else if (!DRY_RUN) {
        console.log(`\n✅ Restore complete! ${toRestore} students restored.\n`);
    }
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
