import {
    collection, collectionGroup, doc, getDoc, getDocs, query, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Exam, Result } from "@/types";
import { getStudentClassInfo } from "./studentProfile";

/**
 * Result documents live at:
 *   results/{examId}/classes/{classId}/sections/{sectionId}/students/{uid}
 *
 * The teacher writes them using the class name as stored on the class-teacher
 * assignment ("7"), while the student portal only knows the class name kept in
 * studentLookup ("Class 7", "7", or nothing at all after a promotion/transfer).
 * Any mismatch used to make the whole Report Cards page render "No Results
 * Available" even though the docs existed — so the lookup here never trusts a
 * single path:
 *
 *   1. One collectionGroup query on `studentId` — path independent, catches
 *      results saved under ANY class/section spelling (needs the rules +
 *      index shipped in firestore.rules / firestore.indexes.json).
 *   2. Direct getDoc probes over class/section spellings for anything the
 *      query did not cover (also covers legacy docs with no `studentId`).
 *   3. The legacy flat path results/{examId}_{uid}.
 */

export type StudentResultHit = {
    examId: string;
    classId: string;
    sectionId: string;
    result: Result;
};

export type StudentResultsPayload = {
    hits: StudentResultHit[];
    className: string;
    section: string;
    name: string;
    /** Reasons worth surfacing when nothing was found. */
    diagnostics: string[];
};

const dedupe = (arr: (string | undefined | null)[]): string[] =>
    Array.from(new Set(arr.map(v => (v || "").trim()).filter(Boolean)));

export const normClassName = (cls: string) => cls.replace(/^class\s*/i, "").trim();

const classVariants = (cls: string): string[] => {
    if (!cls?.trim()) return [];
    const n = normClassName(cls);
    return dedupe([cls, n, `Class ${n}`, n.toUpperCase()]);
};

const sectionVariants = (sec: string): string[] => {
    if (!sec?.trim()) return [];
    return dedupe([sec, sec.toUpperCase(), sec.toLowerCase()]);
};

const errCode = (err: unknown) => {
    const e = err as { code?: string; message?: string } | null;
    return e?.code || e?.message || "unknown error";
};

/** className → sections, read from the `classes` collection (readable by any signed-in user). */
async function loadClassSections(): Promise<Record<string, string[]>> {
    const map: Record<string, string[]> = {};
    try {
        const snap = await getDocs(collection(db, "classes"));
        snap.docs.forEach(d => {
            const data = d.data() as { name?: string; sections?: string[] };
            const name = (data.name || d.id || "").toString();
            const sections: string[] = Array.isArray(data.sections) ? data.sections : [];
            if (name) map[name] = sections.length ? sections : ["A"];
        });
    } catch { /* falls back to the default section list below */ }
    return map;
}

/**
 * Loads every exam result belonging to `uid`, whatever class/section spelling
 * it was saved under. `exams` is the full list from the `exams` collection.
 */
export async function fetchStudentResults(uid: string, exams: Exam[]): Promise<StudentResultsPayload> {
    const diagnostics: string[] = [];
    let { className, section, name } = await getStudentClassInfo(uid);

    const byExam = new Map<string, StudentResultHit>();

    // ── 1. Path-independent lookup ────────────────────────────────────────────
    let groupQueryWorked = false;
    try {
        const snap = await getDocs(
            query(collectionGroup(db, "students"), where("studentId", "==", uid))
        );
        groupQueryWorked = true;
        snap.docs.forEach(d => {
            const parts = d.ref.path.split("/");
            // results/{examId}/classes/{cls}/sections/{sec}/students/{uid}
            if (parts[0] !== "results" || parts.length < 8) return;
            const examId = parts[1];
            if (byExam.has(examId)) return;
            byExam.set(examId, {
                examId,
                classId: parts[3],
                sectionId: parts[5],
                result: { id: d.id, ...d.data() } as Result,
            });
        });
    } catch (err) {
        diagnostics.push(
            `Fast result lookup unavailable (${errCode(err)}) — deploy firestore.rules and firestore.indexes.json.`
        );
    }

    // ── 2. Direct probes for exams the query did not cover ────────────────────
    const missing = exams.filter(e => e.id && !byExam.has(e.id));
    // "Deep" mode also sweeps the classes the exam applies to — needed when the
    // student's stored class name does not match how the teacher saved results.
    const deep = !groupQueryWorked || byExam.size === 0;

    if (missing.length > 0) {
        const classSections = deep ? await loadClassSections() : {};

        if (!className || !section) {
            // Usually means studentLookup/{uid} is absent — e.g. the login account was
            // re-created, so the auth UID no longer matches the profile/result doc ID.
            diagnostics.push(
                `Class/section missing from your profile record (studentLookup/${uid}). Ask the office to re-save your student record.`
            );
        }

        await Promise.all(missing.map(async exam => {
            const clsCandidates = dedupe([
                ...classVariants(className),
                ...(deep ? (exam.classesApplicable || []).flatMap(c => classVariants(c)) : []),
            ]);

            for (const cls of clsCandidates) {
                const secCandidates = dedupe([
                    ...sectionVariants(section),
                    ...(deep
                        ? [...(classSections[cls] || classSections[normClassName(cls)] || ["A", "B", "C", "D"])]
                        : []),
                ]);

                for (const sec of secCandidates) {
                    if (byExam.has(exam.id!)) return;
                    try {
                        const snap = await getDoc(
                            doc(db, "results", exam.id!, "classes", cls, "sections", sec, "students", uid)
                        );
                        if (snap.exists()) {
                            byExam.set(exam.id!, {
                                examId: exam.id!,
                                classId: cls,
                                sectionId: sec,
                                result: { id: snap.id, ...snap.data() } as Result,
                            });
                            return;
                        }
                    } catch { /* try the next spelling */ }
                }
            }

            // ── 3. Legacy flat path ───────────────────────────────────────────
            if (byExam.has(exam.id!)) return;
            try {
                const legacy = await getDoc(doc(db, "results", `${exam.id}_${uid}`));
                if (legacy.exists()) {
                    const data = legacy.data() as Partial<Result>;
                    byExam.set(exam.id!, {
                        examId: exam.id!,
                        classId: data.classId || className,
                        sectionId: data.sectionId || section,
                        result: { id: legacy.id, ...data } as Result,
                    });
                }
            } catch { /* ignore */ }
        }));
    }

    const hits = Array.from(byExam.values());

    // The result docs themselves are the most reliable source of class/section
    // when the profile lookup came back empty.
    if (hits.length > 0) {
        if (!className) className = hits[0].result.classId || hits[0].classId || "";
        if (!section) section = hits[0].result.sectionId || hits[0].sectionId || "";
        if (!name) name = (hits[0].result as Result & { studentName?: string }).studentName || "";
    }

    return { hits, className, section, name, diagnostics };
}
