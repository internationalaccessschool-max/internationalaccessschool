"use client";

import { useState, useEffect } from "react";
import { collection, addDoc, deleteDoc, doc, onSnapshot, serverTimestamp, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CloudinaryUpload } from "@/components/ui/cloudinary-upload";
import { Trash2, Calendar, BookOpen, ChevronDown, X } from "lucide-react";
import { FileViewerTrigger } from "@/components/ui/file-viewer";
import { toast } from "react-hot-toast";

interface Homework {
    id: string;
    title: string;
    description: string;
    fileUrl?: string;
    fileName?: string;
    className: string;
    section: string;
    subject: string;
    dueDate: string;
    createdAt: unknown;
    assignedDate?: string;
    assignedDay?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const CLASSES = ["NUR", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

const SECTIONS = ["A", "B", "C", "D"];

const SUBJECTS = [
    "Mathematics", "Science", "English", "Hindi", "Social Science",
    "Computer Science", "Physics", "Chemistry", "Biology",
    "History", "Geography", "Economics", "Accountancy",
    "Business Studies", "Physical Education", "Art", "Music"
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const CLASS_COLORS: Record<string, string> = {
    "NUR": "bg-rose-50 text-rose-600",
    "LKG": "bg-fuchsia-50 text-fuchsia-600",
    "UKG": "bg-violet-50 text-violet-600",
    "1": "bg-pink-50 text-pink-600",
    "2": "bg-red-50 text-red-600",
    "3": "bg-orange-50 text-orange-600",
    "4": "bg-amber-50 text-amber-700",
    "5": "bg-yellow-50 text-yellow-700",
    "6": "bg-lime-50 text-lime-700",
    "7": "bg-green-50 text-green-700",
    "8": "bg-teal-50 text-teal-700",
    "9": "bg-cyan-50 text-cyan-700",
    "10": "bg-blue-50 text-blue-700",
    "11": "bg-indigo-50 text-indigo-700",
    "12": "bg-purple-50 text-purple-700",
};

export default function HomeworkAdminPage() {
    const [homeworks, setHomeworks] = useState<Homework[]>([]);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [filterClass, setFilterClass] = useState("All");

    // Auto-fetch today's date & day
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0]; // YYYY-MM-DD
    const todayDay = today.toLocaleDateString("en-IN", { weekday: "long" }); // e.g. "Thursday"
    const todayDisplay = today.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }); // e.g. "19 February 2026"

    const [formData, setFormData] = useState({
        title: "",
        description: "",
        className: "",
        section: "A",
        subject: "",
        dueDate: "",
        fileUrl: "",
        fileName: "",
        assignedDate: todayStr,
        assignedDay: todayDay,
    });

    useEffect(() => {
        const q = query(collection(db, "homework"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setHomeworks(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Homework)));
        });
        return () => unsubscribe();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.className) {
            toast.error("Please select a class.");
            return;
        }

        const loadingToast = toast.loading("Creating assignment...");
        try {
            await addDoc(collection(db, "homework"), {
                ...formData,
                createdAt: serverTimestamp()
            });
            setIsFormOpen(false);
            setFormData({
                title: "", description: "", className: "", section: "A", subject: "", dueDate: "", fileUrl: "", fileName: "",
                assignedDate: todayStr, assignedDay: todayDay,
            });
            toast.success("Assignment created successfully!", { id: loadingToast });
        } catch (error) {
            console.error(error);
            toast.error("Failed to create assignment", { id: loadingToast });
        }
    };

    const handleDelete = async (id: string) => {
        toast((t) => (
            <div className="flex flex-col gap-3">
                <span className="font-semibold text-gray-800">Delete this assignment?</span>
                <div className="flex gap-2">
                    <button
                        onClick={async () => {
                            toast.dismiss(t.id);
                            const loadingToast = toast.loading("Deleting...");
                            try {
                                await deleteDoc(doc(db, "homework", id));
                                toast.success("Assignment deleted", { id: loadingToast });
                            } catch (error) {
                                console.error(error);
                                toast.error("Failed to delete", { id: loadingToast });
                            }
                        }}
                        className="px-3 py-1.5 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 transition"
                    >
                        Delete
                    </button>
                    <button
                        onClick={() => toast.dismiss(t.id)}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-200 transition"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        ), { duration: 5000 });
    };

    const filtered = filterClass === "All" ? homeworks : homeworks.filter(h => h.className === filterClass);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-navy">Homework Management</h1>
                    <p className="text-gray-500">Create assignments and upload study materials.</p>
                </div>
                <button
                    onClick={() => setIsFormOpen(true)}
                    className="px-4 py-2 bg-navy text-white rounded-lg hover:bg-navy-light transition-colors"
                >
                    + New Assignment
                </button>
            </div>

            {/* Class Filter Tabs */}
            <div className="flex gap-2 flex-wrap">
                {["All", ...CLASSES].map(cls => (
                    <button
                        key={cls}
                        onClick={() => setFilterClass(cls)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterClass === cls
                            ? "bg-navy text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                    >
                        {cls}
                    </button>
                ))}
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-blue-700">{homeworks.length}</div>
                    <div className="text-xs text-blue-600 font-medium">Total Assignments</div>
                </div>
                <div className="bg-green-50 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-green-700">
                        {new Set(homeworks.map(h => h.className)).size}
                    </div>
                    <div className="text-xs text-green-600 font-medium">Classes Assigned</div>
                </div>
                <div className="bg-purple-50 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-purple-700">
                        {homeworks.filter(h => h.fileUrl).length}
                    </div>
                    <div className="text-xs text-purple-600 font-medium">With Attachments</div>
                </div>
                <div className="bg-orange-50 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-orange-700">
                        {new Set(homeworks.map(h => h.subject)).size}
                    </div>
                    <div className="text-xs text-orange-600 font-medium">Subjects</div>
                </div>
            </div>

            {/* Homework List */}
            <div className="grid gap-4">
                {filtered.length === 0 && (
                    <div className="text-center py-12 text-gray-400">
                        <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p>No assignments for {filterClass === "All" ? "any class" : filterClass} yet.</p>
                    </div>
                )}
                {filtered.map(hw => (
                    <div key={hw.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-start justify-between gap-4">
                        <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${CLASS_COLORS[hw.className] || "bg-gray-50 text-gray-600"}`}>
                                    {hw.className} {hw.section}
                                </span>
                                <span className="px-2 py-0.5 bg-purple-50 text-purple-600 rounded text-xs font-semibold">
                                    {hw.subject}
                                </span>
                            </div>
                            <h3 className="font-bold text-navy text-lg">{hw.title}</h3>
                            <p className="text-gray-600 text-sm">{hw.description}</p>

                            <div className="flex items-center gap-4 pt-1 text-sm text-gray-500 flex-wrap">
                                {hw.assignedDate && (
                                    <div className="flex items-center gap-1 text-gray-400">
                                        <Calendar className="w-3.5 h-3.5" />
                                        Assigned: {hw.assignedDay}, {new Date(hw.assignedDate + 'T00:00:00').toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                                    </div>
                                )}
                                <div className="flex items-center gap-1 text-red-500 font-semibold">
                                    <Calendar className="w-4 h-4" />
                                    Due: {hw.dueDate}
                                </div>
                                {hw.fileUrl && (
                                    <FileViewerTrigger
                                        url={hw.fileUrl}
                                        fileName={hw.fileName || "attachment"}
                                        label={hw.fileName || "View Attachment"}
                                    />
                                )}
                            </div>
                        </div>
                        <button
                            onClick={() => handleDelete(hw.id)}
                            className="text-gray-400 hover:text-red-500 p-2 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    </div>
                ))}
            </div>

            {/* Create Modal */}
            {isFormOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-6 border-b border-gray-100">
                            <h2 className="text-xl font-bold text-navy">Create New Assignment</h2>
                            <button onClick={() => setIsFormOpen(false)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {/* Class + Section */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Class *</label>
                                    <div className="relative">
                                        <select
                                            required
                                            value={formData.className}
                                            onChange={e => setFormData({ ...formData, className: e.target.value })}
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy/20 outline-none appearance-none bg-white pr-8"
                                        >
                                            <option value="">Select Class</option>
                                            {CLASSES.map(cls => (
                                                <option key={cls} value={cls}>{cls}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Section</label>
                                    <div className="flex gap-2">
                                        {SECTIONS.map(sec => (
                                            <button
                                                key={sec}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, section: sec })}
                                                className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors ${formData.section === sec
                                                    ? "bg-navy text-white border-navy"
                                                    : "bg-white text-gray-600 border-gray-200 hover:border-navy/30"
                                                    }`}
                                            >
                                                {sec}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Subject */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Subject *</label>
                                <div className="relative">
                                    <select
                                        required
                                        value={formData.subject}
                                        onChange={e => setFormData({ ...formData, subject: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy/20 outline-none appearance-none bg-white pr-8"
                                    >
                                        <option value="">Select Subject</option>
                                        {SUBJECTS.map(sub => (
                                            <option key={sub} value={sub}>{sub}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                                </div>
                            </div>

                            {/* Title */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Assignment Title *</label>
                                <input
                                    required
                                    type="text"
                                    placeholder="e.g. Chapter 5 Exercise — Quadratic Equations"
                                    value={formData.title}
                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy/20 outline-none"
                                />
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Instructions</label>
                                <textarea
                                    rows={3}
                                    placeholder="Detailed instructions for students..."
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy/20 outline-none resize-none"
                                />
                            </div>

                            {/* Assigned On + Due Date */}
                            <div className="grid grid-cols-2 gap-4">
                                {/* Assigned On — auto filled, read only */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                                        📅 Assigned On
                                    </label>
                                    <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 font-medium">
                                        <div>{todayDay}</div>
                                        <div className="text-xs text-gray-500 font-normal">{todayDisplay}</div>
                                    </div>
                                </div>

                                {/* Due Date — manual */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                                        ⏰ Due Date *
                                    </label>
                                    <input
                                        required
                                        type="date"
                                        value={formData.dueDate}
                                        min={todayStr}
                                        onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy/20 outline-none"
                                    />
                                </div>
                            </div>

                            {/* File Upload */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Attachment <span className="text-gray-400 font-normal">(Optional)</span>
                                </label>
                                <CloudinaryUpload
                                    folder="homework"
                                    subFolder={`class-${formData.className?.replace("Class ", "") || "general"}/${formData.subject || "general"}`}
                                    onUpload={(url, publicId, name) => setFormData({ ...formData, fileUrl: url, fileName: name })}
                                    acceptedFileTypes="all"
                                    maxSizeMB={2}
                                />
                                <p className="text-xs text-amber-600 font-medium mt-2 bg-amber-50 p-2 rounded-lg border border-amber-100 flex items-start gap-1">
                                    <span>⚠️</span>
                                    <span>
                                        Max file size is 2MB. Please compress your PDFs before uploading. <a href="https://www.ilovepdf.com/compress_pdf" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center">Compress PDF <span className="ml-[2px] font-bold">↗</span></a>
                                    </span>
                                </p>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsFormOpen(false)}
                                    className="flex-1 px-4 py-2 border text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2 bg-navy text-white rounded-lg hover:bg-navy-light font-medium transition-colors"
                                >
                                    Create Assignment
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
