"use client";

import { useState } from "react";
import { doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { X, Loader2, ArrowLeftRight, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";

const CLASS_LIST = ["NUR", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const SECTIONS = ["A", "B", "C", "D", "E"];

interface Props {
    student: any;
    onClose: () => void;
    onSaved: (updated: any) => void;
}

export function ChangeClassModal({ student, onClose, onSaved }: Props) {
    const oldClass = (student.className || student.currentClass || "").toString();
    const oldSection = student.section || "";
    const oldRollNo = student.rollNumber || "";

    const [newClass, setNewClass] = useState(oldClass);
    const [newSection, setNewSection] = useState(oldSection);
    const [newRollNo, setNewRollNo] = useState(oldRollNo);
    const [saving, setSaving] = useState(false);

    const classOrSectionChanged = newClass !== oldClass || newSection !== oldSection;
    const hasChanged = classOrSectionChanged || newRollNo !== oldRollNo;

    const handleSave = async () => {
        if (!newClass || !newSection) {
            toast.error("Class aur Section dono select karo");
            return;
        }
        setSaving(true);
        try {
            const oldDocRef = doc(db, "users", "classes", oldClass, "sections", oldSection, "students", "profiles", student.id);
            const newDocRef = doc(db, "users", "classes", newClass, "sections", newSection, "students", "profiles", student.id);

            // Build updated data — preserve everything, update only changed fields
            const updatedData = {
                ...student,
                currentClass: newClass,
                className: newClass,
                section: newSection,
                rollNumber: newRollNo,
                id: undefined, // don't store id as a field
            };
            delete updatedData.id;

            if (classOrSectionChanged) {
                // Write to new path first (safe), then delete old
                await setDoc(newDocRef, updatedData, { merge: true });
                // Ensure parent stub docs exist for Firestore console visibility
                await setDoc(
                    doc(db, "users", "classes", newClass, "sections", newSection, "students"),
                    { description: `Root for students in ${newClass} - ${newSection}`, updatedAt: new Date() },
                    { merge: true }
                );
                await deleteDoc(oldDocRef);
                // Keep studentLookup in sync — timetable/attendance/fees depend on this
                await setDoc(doc(db, "studentLookup", student.id), {
                    className: newClass,
                    section: newSection,
                }, { merge: true });
            } else {
                // Only roll number changed — simple in-place update
                await setDoc(oldDocRef, { rollNumber: newRollNo }, { merge: true });
            }

            const updated = { ...student, currentClass: newClass, className: newClass, section: newSection, rollNumber: newRollNo };
            onSaved(updated);
            toast.success(`${student.firstName || "Student"} → Class ${newClass}-${newSection} transferred!`);
            onClose();
        } catch (err: any) {
            toast.error(err.message || "Transfer failed");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center">
                            <ArrowLeftRight className="w-4 h-4 text-violet-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-navy text-sm">Change Class / Section / Roll No</h3>
                            <p className="text-xs text-gray-400">
                                {student.firstName} {student.lastName} · {student.admissionNumber}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Current info */}
                    <div className="bg-gray-50 rounded-xl px-4 py-3 flex gap-6 text-sm">
                        <div>
                            <p className="text-xs text-gray-400 mb-0.5">Current Class</p>
                            <p className="font-semibold text-navy">{oldClass || "—"}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400 mb-0.5">Section</p>
                            <p className="font-semibold text-navy">{oldSection || "—"}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400 mb-0.5">Roll No</p>
                            <p className="font-semibold text-navy">{oldRollNo || "—"}</p>
                        </div>
                    </div>

                    {/* New Class & Section */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1.5">New Class</label>
                            <select
                                value={newClass}
                                onChange={e => setNewClass(e.target.value)}
                                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-navy outline-none bg-white"
                            >
                                <option value="">— Select —</option>
                                {CLASS_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1.5">New Section</label>
                            <select
                                value={newSection}
                                onChange={e => setNewSection(e.target.value)}
                                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-navy outline-none bg-white"
                            >
                                <option value="">— Select —</option>
                                {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Roll Number */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Roll Number</label>
                        <input
                            type="text"
                            value={newRollNo}
                            onChange={e => setNewRollNo(e.target.value)}
                            placeholder="Enter roll number..."
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-navy outline-none bg-white"
                        />
                    </div>

                    {/* Warning if class/section changed */}
                    {classOrSectionChanged && (
                        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5 text-xs text-amber-700">
                            Student ka Firestore document Class {oldClass}-{oldSection} se move ho kar Class {newClass}-{newSection} mein jayega.
                            Fees aur transport records automatically student ID se linked hain — wo safe rahenge.
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="px-5 pb-5 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || !hasChanged || !newClass || !newSection}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold hover:bg-opacity-90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        {saving ? "Saving..." : "Save Changes"}
                    </button>
                </div>
            </div>
        </div>
    );
}
