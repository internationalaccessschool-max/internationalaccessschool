"use client";

import toast from "react-hot-toast";
import { useState, useEffect } from "react";
import { collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { CloudinaryUpload } from "@/components/ui/cloudinary-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, BookOpen, ChevronDown, Loader2 } from "lucide-react";
import { FileViewerTrigger } from "@/components/ui/file-viewer";

// ── Constants ─────────────────────────────────────────────────────────────────
// Fallback subjects if class has no subjects configured in DB
const FALLBACK_SUBJECTS = [
    "Mathematics", "Science", "English", "Hindi", "Social Science",
    "Computer Science", "Physics", "Chemistry", "Biology",
    "History", "Geography", "Economics", "Accountancy",
    "Business Studies", "Physical Education", "Art", "Music"
];

const CLASS_COLORS: Record<string, string> = {
    "NUR": "bg-rose-100 text-rose-700",
    "LKG": "bg-fuchsia-100 text-fuchsia-700",
    "UKG": "bg-violet-100 text-violet-700",
    "1": "bg-pink-100 text-pink-700",
    "2": "bg-red-100 text-red-700",
    "3": "bg-orange-100 text-orange-700",
    "4": "bg-amber-100 text-amber-700",
    "5": "bg-yellow-100 text-yellow-700",
    "6": "bg-lime-100 text-lime-700",
    "7": "bg-green-100 text-green-700",
    "8": "bg-teal-100 text-teal-700",
    "9": "bg-cyan-100 text-cyan-700",
    "10": "bg-blue-100 text-blue-700",
    "11": "bg-indigo-100 text-indigo-700",
    "12": "bg-purple-100 text-purple-700",
};

export default function TeacherHomeworkPage() {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const todayDay = today.toLocaleDateString("en-IN", { weekday: "long" });
    const todayDisplay = today.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

    const [formData, setFormData] = useState({
        className: "",
        sections: [] as string[],
        subject: "",
        title: "",
        description: "",
        dueDate: "",
        totalMarks: "",
        fileUrl: "",
        fileName: "",
        assignedDate: todayStr,
        assignedDay: todayDay,
    });
    const [submitted, setSubmitted] = useState(false);
    const [saving, setSaving] = useState(false);

    // ── Class-specific subjects from Firestore ────────────────────────────────
    const [classSubjects, setClassSubjects] = useState<string[]>([]);
    const [loadingSubjects, setLoadingSubjects] = useState(false);

    useEffect(() => {
        if (!formData.className) {
            setClassSubjects([]);
            setFormData(prev => ({ ...prev, subject: "" }));
            return;
        }
        const fetchSubjects = async () => {
            setLoadingSubjects(true);
            try {
                const { doc: fsDoc, getDoc: fsGetDoc } = await import("firebase/firestore");
                // Admin stores with key "1","2"... so strip "Class " prefix
                const classKey = formData.className.replace(/^Class\s*/i, "").trim();
                const snap = await fsGetDoc(fsDoc(db, "classSubjects", classKey));
                if (snap.exists()) {
                    const subs = (snap.data().subjects || []) as Array<{ name: string } | string>;
                    const names = subs
                        .map(s => (typeof s === "string" ? s : s?.name))
                        .filter(Boolean) as string[];
                    setClassSubjects(names);
                } else {
                    setClassSubjects([]);
                }
            } catch {
                setClassSubjects([]);
            } finally {
                setLoadingSubjects(false);
            }
        };
        fetchSubjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formData.className]);

    // Subjects to show = class-specific (from DB) OR fallback list
    const subjectsToShow = classSubjects.length > 0 ? classSubjects : FALLBACK_SUBJECTS;

    // ── Assigned classes/sections from Firestore ──────────────────────────────
    const [assignedClassSections, setAssignedClassSections] = useState<Record<string, string[]>>({});
    const [loadingAssigned, setLoadingAssigned] = useState(true);

    useEffect(() => {
        const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
            if (!user) { setLoadingAssigned(false); return; }
            try {
                const { collection, getDocs } = await import("firebase/firestore");
                let cs: Record<string, string[]> = {};
                
                const ttSnap = await getDocs(collection(db, "timetable"));
                ttSnap.docs.forEach(d => {
                    const data = d.data();
                    const clsNameRaw = data.cls;
                    const section = data.section;
                    const slots = data.slots || {};
                    
                    let isAssigned = false;
                    Object.values(slots).forEach((slot: any) => {
                        if (slot.teacherId === user.uid) isAssigned = true;
                    });
                    
                    if (isAssigned && clsNameRaw && section) {
                        const clsName = clsNameRaw.startsWith("Class") ? clsNameRaw : `Class ${clsNameRaw}`;
                        if (!cs[clsName]) cs[clsName] = [];
                        if (!cs[clsName].includes(section)) {
                            cs[clsName].push(section);
                        }
                    }
                });

                // Fallback: Check if teacher doc has manual assignment field as last resort
                if (Object.keys(cs).length === 0) {
                    const { doc, getDoc } = await import("firebase/firestore");
                    const teacherDoc = await getDoc(doc(db, "teachers", user.uid));
                    if (teacherDoc.exists()) {
                        cs = teacherDoc.data()?.assignment?.classSections || {};
                    }
                }
                
                setAssignedClassSections(cs);
            } catch (err) {
                console.error("Failed to load assigned classes:", err);
            } finally {
                setLoadingAssigned(false);
            }
        });
        return () => unsubscribeAuth();
    }, []);

    const assignedClassNames = Object.keys(assignedClassSections);
    const availableSections = formData.className ? (assignedClassSections[formData.className] || []) : [];

    // When class changes, auto-select all sections for that class
    const handleClassChange = (cls: string) => {
        const secs = assignedClassSections[cls] || [];
        setFormData(prev => ({ ...prev, className: cls, sections: secs }));
    };

    const [recentAssignments, setRecentAssignments] = useState<any[]>([]);

    useEffect(() => {
        const q = query(
            collection(db, "homework"),
            orderBy("createdAt", "desc"),
            limit(10)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setRecentAssignments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, []);

    const handlePost = async () => {
        if (!formData.className || !formData.subject || !formData.title || !formData.dueDate) {
            toast.error("Please fill in all required fields.");
            return;
        }
        if (formData.sections.length === 0) {
            toast.error("Please select at least one section.");
            return;
        }
        setSaving(true);
        try {
            const { sections, ...dataToSave } = formData;
            const currentUser = auth.currentUser;
            const promises = sections.map(sec =>
                addDoc(collection(db, "homework"), {
                    ...dataToSave,
                    section: sec,
                    createdAt: serverTimestamp(),
                    teacherId: currentUser?.uid ?? "unknown",
                    teacherName: currentUser?.displayName ?? "Teacher",
                    status: "active"
                })
            );
            await Promise.all(promises);
            setSubmitted(true);
            setTimeout(() => {
                setSubmitted(false);
                setFormData({
                    className: "", sections: [], subject: "", title: "", description: "",
                    dueDate: "", totalMarks: "", fileUrl: "", fileName: "",
                    assignedDate: todayStr, assignedDay: todayDay,
                });
            }, 2000);
        } catch (error) {
            console.error("Error posting homework:", error);
            toast.error("Failed to post assignment. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-navy">Homework & Assignments</h1>
                    <p className="text-gray-500">
                        {loadingAssigned
                            ? "Loading your classes..."
                            : assignedClassNames.length > 0
                                ? `Your classes: ${assignedClassNames.join(", ")}`
                                : "No classes assigned yet — contact admin"}
                    </p>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
                {/* ── Create Form ─────────────────────────────────────────────── */}
                <Card>
                    <CardContent className="p-6 space-y-4">
                        <h2 className="text-lg font-bold text-navy flex items-center gap-2">
                            <Plus className="w-5 h-5" /> Create New Assignment
                        </h2>

                        {/* Class + Section */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Class *</label>
                                <div className="relative">
                                    {loadingAssigned ? (
                                        <div className="w-full px-3 py-2 border rounded-lg bg-gray-50 text-sm text-gray-400 flex items-center gap-2">
                                            <Loader2 className="w-3 h-3 animate-spin" /> Loading...
                                        </div>
                                    ) : assignedClassNames.length === 0 ? (
                                        <div className="w-full px-3 py-2 border border-amber-200 rounded-lg bg-amber-50 text-sm text-amber-700">
                                            No classes assigned
                                        </div>
                                    ) : (
                                        <>
                                            <select
                                                value={formData.className}
                                                onChange={e => handleClassChange(e.target.value)}
                                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy/20 outline-none appearance-none bg-white pr-8 text-sm"
                                            >
                                                <option value="">Select Class</option>
                                                {assignedClassNames.map(cls => (
                                                    <option key={cls} value={cls}>{cls}</option>
                                                ))}
                                            </select>
                                            <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                                        </>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Section</label>
                                {!formData.className ? (
                                    <div className="text-xs text-gray-400 py-2 italic">Select a class first</div>
                                ) : availableSections.length === 0 ? (
                                    <div className="text-xs text-amber-600 py-2">No sections for this class</div>
                                ) : (
                                    <div className="flex gap-1.5 flex-wrap">
                                        {availableSections.map(sec => (
                                            <button
                                                key={sec}
                                                type="button"
                                                onClick={() => {
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        sections: prev.sections.includes(sec)
                                                            ? prev.sections.filter(s => s !== sec)
                                                            : [...prev.sections, sec]
                                                    }));
                                                }}
                                                className={`px-3 py-2 rounded-lg text-sm font-bold border transition-colors ${formData.sections.includes(sec)
                                                        ? "bg-navy text-white border-navy"
                                                        : "bg-white text-gray-500 border-gray-200 hover:border-navy/30"
                                                    }`}
                                            >
                                                {sec}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Subject */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Subject *</label>
                            <div className="relative">
                                {!formData.className ? (
                                    <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-400">
                                        Select a class first
                                    </div>
                                ) : loadingSubjects ? (
                                    <div className="w-full px-3 py-2 border rounded-lg bg-gray-50 text-sm text-gray-400 flex items-center gap-2">
                                        <Loader2 className="w-3 h-3 animate-spin" /> Loading subjects...
                                    </div>
                                ) : (
                                    <>
                                        <select
                                            value={formData.subject}
                                            onChange={e => setFormData({ ...formData, subject: e.target.value })}
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy/20 outline-none appearance-none bg-white pr-8 text-sm"
                                        >
                                            <option value="">Select Subject</option>
                                            {subjectsToShow.map(sub => (
                                                <option key={sub} value={sub}>{sub}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                                        {classSubjects.length === 0 && formData.className && (
                                            <p className="text-xs text-amber-600 mt-1">⚠️ No subjects configured for {formData.className}. Ask admin to set class subjects.</p>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Title */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Assignment Title *</label>
                            <input
                                type="text"
                                placeholder="e.g. Chapter 5: Quadratic Equations"
                                value={formData.title}
                                onChange={e => setFormData({ ...formData, title: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy/20 outline-none text-sm"
                            />
                        </div>

                        {/* Instructions */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Instructions</label>
                            <textarea
                                rows={3}
                                placeholder="Write detailed instructions for students..."
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy/20 outline-none text-sm resize-none"
                            />
                        </div>

                        {/* Assigned On + Due Date */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">📅 Assigned On</label>
                                <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 font-medium">
                                    <div>{todayDay}</div>
                                    <div className="text-xs text-gray-500 font-normal">{todayDisplay}</div>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">⏰ Due Date *</label>
                                <input
                                    type="date"
                                    value={formData.dueDate}
                                    min={todayStr}
                                    onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy/20 outline-none text-sm"
                                />
                            </div>
                        </div>

                        {/* File Upload */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Attachment <span className="text-gray-400 font-normal">(Optional — Image, PDF, or DOCX)</span>
                            </label>
                            <CloudinaryUpload
                                folder="homework"
                                subFolder={`class-${formData.className?.replace("Class ", "") || "general"}/${formData.subject || "general"}`}
                                onUpload={(url, publicId, name) => setFormData({ ...formData, fileUrl: url, fileName: name })}
                                acceptedFileTypes="all"
                                maxSizeMB={1}
                            />
                            <p className="text-xs text-amber-600 font-medium mt-2 bg-amber-50 p-2 rounded-lg border border-amber-100 flex items-start gap-1">
                                <span>⚠️</span>
                                <span>
                                    Max file size is 1MB. Please compress your PDFs before uploading.{" "}
                                    <a href="https://www.ilovepdf.com/compress_pdf" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Compress PDF ↗</a>
                                </span>
                            </p>
                        </div>

                        {formData.className && (
                            <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-500 font-mono">
                                📁 ias-school/homework/class-{formData.className.replace("Class ", "")}/{formData.subject || "general"}
                            </div>
                        )}

                        <Button
                            onClick={handlePost}
                            disabled={saving || assignedClassNames.length === 0}
                            className={`w-full mt-2 transition-all ${submitted ? "bg-green-600 hover:bg-green-600" : "bg-navy hover:bg-navy-light"} text-white disabled:opacity-70`}
                        >
                            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : submitted ? "✓ Assignment Posted!" : "Post Assignment"}
                        </Button>
                    </CardContent>
                </Card>

                {/* ── Recent Assignments ─────────────────────────────────────── */}
                <div className="space-y-4">
                    <h2 className="text-lg font-bold text-navy">Recent Assignments</h2>
                    {recentAssignments.length === 0 ? (
                        <div className="text-sm border border-dashed border-gray-200 rounded-xl p-6 text-center text-gray-400">
                            No recent assignments found.
                        </div>
                    ) : (
                        recentAssignments.map(a => (
                            <div key={a.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex gap-2 flex-wrap">
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${CLASS_COLORS[a.className] || "bg-gray-100 text-gray-600"}`}>
                                            {a.className}-{a.section}
                                        </span>
                                        <span className="px-2 py-0.5 bg-purple-50 text-purple-600 rounded text-xs font-semibold">
                                            {a.subject}
                                        </span>
                                    </div>
                                    <span className="text-xs text-gray-500">
                                        Due: {new Date(a.dueDate).toLocaleDateString()}
                                    </span>
                                </div>
                                <h3 className="font-bold text-navy">{a.title}</h3>
                                <div className="mt-3 flex items-center justify-between text-xs font-medium text-gray-500">
                                    <div className="flex items-center gap-4">
                                        <span className="flex items-center gap-1">
                                            <BookOpen className="w-3 h-3" /> {a.subject}
                                        </span>
                                        <span className="text-green-600 font-semibold">0 Submitted</span>
                                    </div>
                                    {a.fileUrl && (
                                        <FileViewerTrigger
                                            url={a.fileUrl}
                                            fileName={a.fileName || "attachment"}
                                            label="View"
                                            className="text-xs"
                                        />
                                    )}
                                </div>
                            </div>
                        ))
                    )}

                    {/* Your Assigned Classes Reference */}
                    {!loadingAssigned && assignedClassNames.length > 0 && (
                        <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">Your Assigned Classes</p>
                            <div className="flex flex-wrap gap-2">
                                {assignedClassNames.map(cls => (
                                    <div key={cls} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${CLASS_COLORS[cls] || "bg-gray-100"}`}>
                                        {cls} ({(assignedClassSections[cls] || []).join(", ") || "—"})
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
