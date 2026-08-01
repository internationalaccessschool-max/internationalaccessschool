import { doc, getDoc, getDocs, collectionGroup, query, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Student profile lookups.
 *
 * Data structure:
 *   users/classes/{className}/sections/{section}/students/profiles/{uid}
 *   studentLookup/{uid} — quick index with className, section, name, status
 *   users/{uid} — auth info (email, role, may have className)
 *
 * The class name is not written consistently everywhere ("7" vs "Class 7"), and
 * studentLookup can be missing entirely (older admissions, interrupted imports).
 * Both used to leave the student portal with a completely blank profile, so every
 * lookup below tries name variants and finally falls back to a `uid` query that
 * needs no path knowledge at all.
 */

const normClass = (cls: string) => cls.replace(/^class\s*/i, "").trim();

const dedupe = (arr: (string | undefined | null)[]): string[] =>
    Array.from(new Set(arr.map(v => (v || "").trim()).filter(Boolean)));

const classVariants = (cls: string): string[] => {
    if (!cls?.trim()) return [];
    const n = normClass(cls);
    return dedupe([cls, n, `Class ${n}`, n.toUpperCase()]);
};

const sectionVariants = (sec: string): string[] => {
    if (!sec?.trim()) return [];
    return dedupe([sec, sec.toUpperCase(), sec.toLowerCase()]);
};

const profilePathFor = (cls: string, sec: string, uid: string) =>
    `users/classes/${cls}/sections/${sec}/students/profiles/${uid}`;

/** Tries every class/section spelling until the profile doc is found. */
async function tryProfilePaths(uid: string, cls: string, sec: string) {
    for (const c of classVariants(cls)) {
        for (const s of sectionVariants(sec)) {
            const path = profilePathFor(c, s, uid);
            try {
                const snap = await getDoc(doc(db, path));
                if (snap.exists()) return { data: snap.data(), className: c, section: s, profilePath: path };
            } catch { /* try the next spelling */ }
        }
    }
    return null;
}

/**
 * Path-independent lookup: the profile doc stores its own `uid`, and the
 * security rules allow a student to read profiles where `uid == request.auth.uid`,
 * so this single query works no matter which class/section it lives under.
 */
async function findProfileByUid(uid: string) {
    try {
        const snap = await getDocs(
            query(collectionGroup(db, "profiles"), where("uid", "==", uid), limit(1))
        );
        if (snap.empty) return null;
        const d = snap.docs[0];
        const parts = d.ref.path.split("/");
        // users/classes/{cls}/sections/{sec}/students/profiles/{uid}
        const clsIdx = parts.indexOf("classes");
        const secIdx = parts.indexOf("sections");
        const data = d.data();
        return {
            data,
            className: clsIdx >= 0 ? parts[clsIdx + 1] : (data.className || data.currentClass || ""),
            section: secIdx >= 0 ? parts[secIdx + 1] : (data.section || ""),
            profilePath: d.ref.path,
        };
    } catch (err) {
        console.warn("findProfileByUid failed:", err);
        return null;
    }
}

/**
 * Fetches a student's full profile document.
 * `profilePath` is the exact doc path, used by the profile page when saving.
 */
export async function fetchStudentProfile(uid: string): Promise<{
    profile: Record<string, any> | null;
    className: string;
    section: string;
    profilePath: string;
}> {
    const empty = { profile: null, className: "", section: "", profilePath: "" };

    try {
        // Step 1: studentLookup (fastest — one doc read, then one profile read)
        let lookupName = "";
        try {
            const lookupDoc = await getDoc(doc(db, "studentLookup", uid));
            if (lookupDoc.exists()) {
                const lookup = lookupDoc.data();
                lookupName = lookup.name || "";
                const hit = await tryProfilePaths(
                    uid,
                    lookup.className?.toString() || "",
                    lookup.section?.toString() || ""
                );
                if (hit) {
                    return {
                        profile: { ...hit.data, name: lookupName || hit.data.name },
                        className: hit.className,
                        section: hit.section,
                        profilePath: hit.profilePath,
                    };
                }
            }
        } catch { /* fall through */ }

        // Step 2: users/{uid} may carry a class hint
        try {
            const userDoc = await getDoc(doc(db, "users", uid));
            if (userDoc.exists()) {
                const uData = userDoc.data();
                const hit = await tryProfilePaths(
                    uid,
                    uData.className?.toString() || uData.currentClass?.toString() || "",
                    uData.section?.toString() || ""
                );
                if (hit) {
                    return {
                        profile: hit.data,
                        className: hit.className,
                        section: hit.section,
                        profilePath: hit.profilePath,
                    };
                }
            }
        } catch { /* fall through */ }

        // Step 3: path-independent query — works even when studentLookup is missing
        // or the class was renamed after admission.
        const byUid = await findProfileByUid(uid);
        if (byUid) {
            return {
                profile: { ...byUid.data, name: byUid.data.name || lookupName },
                className: byUid.className,
                section: byUid.section,
                profilePath: byUid.profilePath,
            };
        }

        return empty;
    } catch (err) {
        console.error("fetchStudentProfile error:", err);
        return empty;
    }
}

/**
 * Gets just the className and section for a student (lightweight).
 * Falls back to the profile document when studentLookup / users are unusable.
 */
export async function getStudentClassInfo(uid: string): Promise<{ className: string; section: string; name: string }> {
    let name = "";

    try {
        const lookupDoc = await getDoc(doc(db, "studentLookup", uid));
        if (lookupDoc.exists()) {
            const data = lookupDoc.data();
            name = data.name || "";
            const className = data.className?.toString() || "";
            const section = data.section?.toString() || "";
            if (className && section) return { className, section, name };
        }
    } catch (err) {
        console.warn("getStudentClassInfo: studentLookup read failed", err);
    }

    try {
        const userDoc = await getDoc(doc(db, "users", uid));
        if (userDoc.exists()) {
            const data = userDoc.data();
            name = name || data.name || "";
            const className = data.className?.toString() || data.currentClass?.toString() || "";
            const section = data.section?.toString() || "";
            if (className && section) return { className, section, name };
        }
    } catch (err) {
        console.warn("getStudentClassInfo: users read failed", err);
    }

    // Last resort — read it straight off the profile document.
    const byUid = await findProfileByUid(uid);
    if (byUid) {
        return {
            className: byUid.className,
            section: byUid.section,
            name: name || byUid.data.name ||
                `${byUid.data.firstName || ""} ${byUid.data.lastName || ""}`.trim(),
        };
    }

    return { className: "", section: "", name };
}
