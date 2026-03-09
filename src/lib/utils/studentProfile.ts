import { doc, getDoc, getDocs, collectionGroup, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Fetches a student's profile from Firestore using the most efficient path available.
 * 
 * Data structure:
 *   users/classes/{className}/sections/{section}/students/profiles/{uid}
 *   studentLookup/{uid} — quick index with className, section, name, status
 *   users/{uid} — auth info (email, role, may have className)
 * 
 * Strategy:
 *   1. Check studentLookup for class & section → build direct path
 *   2. Check users/{uid} for className → try known sections
 *   3. Last resort: collectionGroup("profiles") scan
 */
export async function fetchStudentProfile(uid: string): Promise<{
    profile: Record<string, any> | null;
    className: string;
    section: string;
    profilePath: string;
}> {
    const empty = { profile: null, className: "", section: "", profilePath: "" };

    try {
        // Step 1: Try studentLookup (fastest — single doc read)
        const lookupDoc = await getDoc(doc(db, "studentLookup", uid));
        if (lookupDoc.exists()) {
            const lookup = lookupDoc.data();
            const cls = lookup.className?.toString() || "";
            const sec = lookup.section?.toString() || "";

            if (cls && sec) {
                const profilePath = `users/classes/${cls}/sections/${sec}/students/profiles/${uid}`;
                const profileDoc = await getDoc(doc(db, profilePath));
                if (profileDoc.exists()) {
                    return {
                        profile: { ...profileDoc.data(), name: lookup.name },
                        className: cls,
                        section: sec,
                        profilePath,
                    };
                }
            }
        }

        // Step 2: Try users/{uid} doc for className hint
        const userDoc = await getDoc(doc(db, "users", uid));
        if (userDoc.exists()) {
            const uData = userDoc.data();
            const cls = uData.className?.toString() || uData.currentClass?.toString() || "";
            const sec = uData.section?.toString() || "";

            if (cls && sec) {
                const profilePath = `users/classes/${cls}/sections/${sec}/students/profiles/${uid}`;
                const profileDoc = await getDoc(doc(db, profilePath));
                if (profileDoc.exists()) {
                    return {
                        profile: profileDoc.data(),
                        className: cls,
                        section: sec,
                        profilePath,
                    };
                }
            }
        }

        // Step 3: Last resort — collectionGroup scan (expensive but reliable)
        const profilesSnap = await getDocs(collectionGroup(db, "profiles"));
        for (const d of profilesSnap.docs) {
            if (d.id === uid) {
                const data = d.data();
                // Extract class and section from the document path
                // Path: users/classes/{class}/sections/{section}/students/profiles/{uid}
                const pathParts = d.ref.path.split("/");
                const clsIdx = pathParts.indexOf("classes");
                const secIdx = pathParts.indexOf("sections");
                const cls = clsIdx >= 0 ? pathParts[clsIdx + 1] : (data.currentClass || data.className || "");
                const sec = secIdx >= 0 ? pathParts[secIdx + 1] : (data.section || "");

                return {
                    profile: data,
                    className: cls,
                    section: sec,
                    profilePath: d.ref.path,
                };
            }
        }

        return empty;
    } catch (err) {
        console.error("fetchStudentProfile error:", err);
        return empty;
    }
}

/**
 * Gets just the className and section for a student (lightweight).
 * Uses studentLookup only — no profile fetch.
 */
export async function getStudentClassInfo(uid: string): Promise<{ className: string; section: string; name: string }> {
    try {
        const lookupDoc = await getDoc(doc(db, "studentLookup", uid));
        if (lookupDoc.exists()) {
            const data = lookupDoc.data();
            return {
                className: data.className?.toString() || "",
                section: data.section?.toString() || "",
                name: data.name || "",
            };
        }

        // Fallback: check users doc
        const userDoc = await getDoc(doc(db, "users", uid));
        if (userDoc.exists()) {
            const data = userDoc.data();
            return {
                className: data.className?.toString() || data.currentClass?.toString() || "",
                section: data.section?.toString() || "",
                name: data.name || "",
            };
        }
    } catch (err) {
        console.error("getStudentClassInfo error:", err);
    }

    return { className: "", section: "", name: "" };
}
