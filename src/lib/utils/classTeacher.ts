import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Resolves the class/section a logged-in teacher is the Class Teacher of.
 * A teacher can be Class Teacher of exactly one section school-wide
 * (enforced in admin/class-teacher/page.tsx), so this returns at most one match.
 *
 * Mirrors the class-teacher resolution already used in
 * teacher/attendance/page.tsx and teacher/marks/page.tsx.
 */
export async function resolveClassTeacherSection(
    uid: string,
    email?: string | null
): Promise<{ cls: string; section: string } | null> {
    try {
        let ctQuery = query(collection(db, "class_teachers"), where("teacherId", "==", uid));
        let snap = await getDocs(ctQuery);

        if (snap.empty && email) {
            ctQuery = query(collection(db, "class_teachers"), where("teacherEmail", "==", email));
            snap = await getDocs(ctQuery);
        }

        if (snap.empty) return null;

        const data = snap.docs[0].data();
        if (!data.cls || !data.section) return null;
        return { cls: data.cls, section: data.section };
    } catch (err) {
        console.warn("resolveClassTeacherSection failed:", err);
        return null;
    }
}

/** One-off fetch of the class_teachers doc for a given class/section (id = `${cls}-${section}` with spaces -> `_`). */
export async function getClassTeacherFor(cls: string, section: string) {
    try {
        const docId = `${cls}-${section}`.replace(/ /g, "_");
        const snap = await getDoc(doc(db, "class_teachers", docId));
        return snap.exists() ? (snap.data() as { teacherId?: string; teacherName?: string; teacherEmail?: string }) : null;
    } catch {
        return null;
    }
}
