"use client";

import { useState, useEffect } from "react";
import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    onSnapshot,
    query,
    orderBy,
    collectionGroup,
    getDocs,
    setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Exam } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    Dialog, DialogContent, DialogDescription, DialogHeader,
    DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ClipboardList, Plus, Edit2, Trash2, Globe, Lock, Loader2, CalendarClock, Clock, FileCheck } from "lucide-react";

// Fixed canonical class list — always show NUR, LKG, UKG, 1-12
const FIXED_CLASSES = ["NUR", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

// Normalise "Class 7" → "7", leave "LKG" / "NUR" as-is
function normaliseClass(raw: string): string {
    return raw.replace(/^class\s*/i, "").trim();
}

function sortClasses(arr: string[]): string[] {
    const order: Record<string, number> = { NUR: -3, LKG: -2, UKG: -1 };
    return arr.sort((a, b) => {
        const na = order[a.toUpperCase()] ?? (parseInt(a) || 99);
        const nb = order[b.toUpperCase()] ?? (parseInt(b) || 99);
        return na - nb;
    });
}

export default function AdminExamsPage() {
    const [exams, setExams] = useState<Exam[]>([]);
    const [allClasses, setAllClasses] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isGenerating, setIsGenerating] = useState<string | null>(null);
    const [generateMsg, setGenerateMsg] = useState("");

    // Form state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [selectedClasses, setSelectedClasses] = useState<string[]>([]);

    // Schedule publish state: examId -> datetime string ("YYYY-MM-DDTHH:mm")
    const [scheduleMap, setScheduleMap] = useState<Record<string, string>>({});

    // Load exams (real-time)
    useEffect(() => {
        const q = query(collection(db, "exams"), orderBy("createdAt", "desc"));
        const unsub = onSnapshot(q, (snap) => {
            setExams(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Exam));
            setIsLoading(false);
        }, () => setIsLoading(false));
        return () => unsub();
    }, []);

    // Load all unique class names from student profiles, normalised and merged with fixed list
    useEffect(() => {
        const fetchClasses = async () => {
            try {
                const snap = await getDocs(collectionGroup(db, "profiles"));
                // Start with canonical list
                const classSet = new Set<string>(FIXED_CLASSES);
                snap.docs.forEach(d => {
                    const data = d.data();
                    // Normalise both className and currentClass
                    [data.className, data.currentClass].forEach(raw => {
                        if (raw) classSet.add(normaliseClass(String(raw)));
                    });
                });
                setAllClasses(sortClasses(Array.from(classSet)));
            } catch {
                setAllClasses(sortClasses([...FIXED_CLASSES]));
            }
        };
        fetchClasses();
    }, []);


    const resetForm = () => {
        setEditingId(null);
        setName("");
        setStartDate("");
        setEndDate("");
        setSelectedClasses([]);
    };

    const openCreateDialog = () => {
        resetForm();
        setIsDialogOpen(true);
    };

    const openEditDialog = (exam: Exam) => {
        setEditingId(exam.id!);
        setName(exam.name);
        setStartDate(exam.startDate);
        setEndDate(exam.endDate);
        setSelectedClasses(exam.classesApplicable ?? []);
        setIsDialogOpen(true);
    };

    const toggleClass = (cls: string) => {
        setSelectedClasses(prev =>
            prev.includes(cls) ? prev.filter(c => c !== cls) : [...prev, cls]
        );
    };

    const handleSave = async () => {
        if (!name.trim() || !startDate || !endDate) {
            alert("Please fill all required fields.");
            return;
        }
        if (selectedClasses.length === 0) {
            alert("Please select at least one class.");
            return;
        }

        setIsSaving(true);
        try {
            const payload = {
                name: name.trim(),
                startDate,
                endDate,
                classesApplicable: selectedClasses,
                updatedAt: Date.now(),
            };

            if (editingId) {
                await updateDoc(doc(db, "exams", editingId), payload);
            } else {
                await addDoc(collection(db, "exams"), {
                    ...payload,
                    status: "Draft",
                    createdAt: Date.now(),
                });
            }
            setIsDialogOpen(false);
            resetForm();
        } catch (err: any) {
            console.error("Save error:", err);
            alert("Failed to save exam: " + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!window.confirm(`Delete exam "${name}"? This cannot be undone.`)) return;
        try {
            await deleteDoc(doc(db, "exams", id));
        } catch (err: any) {
            alert("Failed to delete: " + err.message);
        }
    };

    const handleGenerateAdmitCards = async (exam: Exam) => {
        if (!window.confirm(`Generate admit cards for all students in "${exam.name}"? This will overwrite existing admit cards for this exam.`)) return;
        setIsGenerating(exam.id!);
        setGenerateMsg("");
        try {
            // Fetch all student profiles
            const snap = await getDocs(collectionGroup(db, "profiles"));
            let count = 0;
            const applicable = exam.classesApplicable ?? [];
            for (const d of snap.docs) {
                const data = d.data();
                const cls = normaliseClass(String(data.className || data.currentClass || ""));
                if (!applicable.includes(cls)) continue;
                const uid = d.id;
                const admitCardId = `${exam.id}_${uid}`;
                await setDoc(doc(db, "admitCards", admitCardId), {
                    examId: exam.id,
                    examName: exam.name,
                    startDate: exam.startDate,
                    endDate: exam.endDate,
                    studentId: uid,
                    admissionNumber: data.admissionNumber || "",
                    studentName: data.name || `${data.firstName || ""} ${data.lastName || ""}`.trim(),
                    className: cls,
                    section: data.section || "",
                    dob: data.dob || "",
                    fatherName: data.fatherName || "",
                    generatedAt: Date.now(),
                }, { merge: true });
                count++;
            }
            setGenerateMsg(`✅ ${count} admit card${count !== 1 ? "s" : ""} generated for "${exam.name}"`);
        } catch (err: any) {
            setGenerateMsg(`❌ Failed: ${err.message}`);
        } finally {
            setIsGenerating(null);
        }
    };

    const handleToggleStatus = async (exam: Exam) => {
        const newStatus = exam.status === "Published" ? "Draft" : "Published";
        try {
            await updateDoc(doc(db, "exams", exam.id!), {
                status: newStatus,
                updatedAt: Date.now(),
            });
        } catch (err: any) {
            alert("Failed to update status: " + err.message);
        }
    };

    // Save a scheduled publish datetime for an exam
    const handleSchedulePublish = async (exam: Exam) => {
        const scheduled = scheduleMap[exam.id!];
        if (!scheduled) { alert("Please pick a date and time first."); return; }
        try {
            await updateDoc(doc(db, "exams", exam.id!), {
                resultPublishAt: new Date(scheduled).getTime(),
                updatedAt: Date.now(),
            });
            alert(`Result scheduled to publish on ${new Date(scheduled).toLocaleString("en-IN")}`);
        } catch (err: any) {
            alert("Failed to schedule: " + err.message);
        }
    };

    // Auto-publish any exam whose scheduled time has passed
    useEffect(() => {
        if (exams.length === 0) return;
        const now = Date.now();
        exams.forEach(async (exam) => {
            const e = exam as any;
            if (e.resultPublishAt && e.resultPublishAt <= now && exam.status !== "Published") {
                try {
                    await updateDoc(doc(db, "exams", exam.id!), {
                        status: "Published",
                        updatedAt: now,
                    });
                } catch { /* silent */ }
            }
        });
    }, [exams]);

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <ClipboardList className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Examinations</h1>
                        <p className="text-muted-foreground">Create and manage school examinations</p>
                    </div>
                </div>
                <Button onClick={openCreateDialog}>
                    <Plus className="mr-2 h-4 w-4" /> Create Exam
                </Button>
            </div>

            {/* Exams Table */}
            <Card className="border-border/50 shadow-sm">
                <CardHeader className="bg-muted/20 border-b pb-4">
                    <CardTitle className="text-xl">All Examinations</CardTitle>
                    <CardDescription>Publish exams when all marks are entered by class teachers.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
                            <span className="text-muted-foreground">Loading exams...</span>
                        </div>
                    ) : exams.length === 0 ? (
                        <div className="py-16 text-center text-muted-foreground">
                            <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-20" />
                            <p>No exams created yet. Click "Create Exam" to get started.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-muted-foreground uppercase bg-muted/30 border-b">
                                    <tr>
                                        <th className="px-6 py-4 font-medium">Exam Name</th>
                                        <th className="px-6 py-4 font-medium">Duration</th>
                                        <th className="px-6 py-4 font-medium">Classes</th>
                                        <th className="px-6 py-4 font-medium">Status</th>
                                        <th className="px-6 py-4 font-medium text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {exams.map(exam => (
                                        <tr key={exam.id} className="hover:bg-muted/10 transition-colors">
                                            <td className="px-6 py-4 font-semibold">{exam.name}</td>
                                            <td className="px-6 py-4 text-muted-foreground text-xs">
                                                {exam.startDate} → {exam.endDate}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-wrap gap-1">
                                                    {(exam.classesApplicable ?? []).map(cls => (
                                                        <Badge key={cls} variant="outline" className="text-xs">{cls}</Badge>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <Badge
                                                    variant={exam.status === "Published" ? "default" : "secondary"}
                                                    className={exam.status === "Published" ? "bg-green-100 text-green-700 hover:bg-green-100" : ""}
                                                >
                                                    {exam.status}
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleToggleStatus(exam)}
                                                        className={exam.status === "Published"
                                                            ? "text-orange-600 border-orange-300 hover:bg-orange-50"
                                                            : "text-green-600 border-green-300 hover:bg-green-50"}
                                                    >
                                                        {exam.status === "Published"
                                                            ? <><Lock className="h-3 w-3 mr-1" /> Unpublish</>
                                                            : <><Globe className="h-3 w-3 mr-1" /> Publish</>}
                                                    </Button>
                                                    <Button variant="ghost" size="icon"
                                                        onClick={() => handleGenerateAdmitCards(exam)}
                                                        disabled={isGenerating === exam.id}
                                                        className="h-8 w-8 text-indigo-500 hover:text-indigo-600 hover:bg-indigo-50"
                                                        title="Generate Admit Cards">
                                                        {isGenerating === exam.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
                                                    </Button>
                                                    <Button variant="ghost" size="icon"
                                                        onClick={() => openEditDialog(exam)}
                                                        className="h-8 w-8 text-blue-500 hover:text-blue-600 hover:bg-blue-50"
                                                        title="Edit Exam">
                                                        <Edit2 className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon"
                                                        onClick={() => handleDelete(exam.id!, exam.name)}
                                                        className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50">
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Schedule to Publish Result */}
            <Card className="border-border/50 shadow-sm">
                <CardHeader className="bg-muted/20 border-b pb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 rounded-lg">
                            <CalendarClock className="h-5 w-5 text-amber-600" />
                        </div>
                        <div>
                            <CardTitle className="text-xl">Schedule Result Publishing</CardTitle>
                            <CardDescription>Set a date &amp; time for each exam's result to automatically go live.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {exams.length === 0 ? (
                        <div className="py-10 text-center text-muted-foreground text-sm">
                            No exams found. Create an exam first.
                        </div>
                    ) : (
                        <div className="divide-y">
                            {exams.map(exam => {
                                const e = exam as any;
                                const scheduled = e.resultPublishAt
                                    ? new Date(e.resultPublishAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                                    : null;
                                const isPast = e.resultPublishAt && e.resultPublishAt <= Date.now();
                                return (
                                    <div key={exam.id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-sm">{exam.name}</p>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {exam.startDate} → {exam.endDate} &nbsp;•&nbsp;
                                                <span className={exam.status === "Published" ? "text-green-600 font-medium" : "text-amber-600 font-medium"}>
                                                    {exam.status}
                                                </span>
                                            </p>
                                            {scheduled && (
                                                <p className={`text-xs mt-1 flex items-center gap-1 ${isPast ? "text-green-600" : "text-blue-600"}`}>
                                                    <Clock className="w-3 h-3" />
                                                    {isPast ? "Auto-published at" : "Scheduled:"} {scheduled}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <input
                                                type="datetime-local"
                                                value={scheduleMap[exam.id!] ?? (e.resultPublishAt ? new Date(e.resultPublishAt - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "")}
                                                onChange={ev => setScheduleMap(prev => ({ ...prev, [exam.id!]: ev.target.value }))}
                                                className="text-xs px-3 py-2 border rounded-lg bg-background focus:ring-2 focus:ring-amber-400/50 outline-none"
                                            />
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="text-amber-700 border-amber-300 hover:bg-amber-50 text-xs shrink-0"
                                                onClick={() => handleSchedulePublish(exam)}
                                            >
                                                <CalendarClock className="w-3.5 h-3.5 mr-1" /> Schedule
                                            </Button>
                                            {exam.status !== "Published" && (
                                                <Button
                                                    size="sm"
                                                    className="bg-green-600 hover:bg-green-700 text-white text-xs shrink-0"
                                                    onClick={() => handleToggleStatus(exam)}
                                                >
                                                    <Globe className="w-3.5 h-3.5 mr-1" /> Publish Now
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Create/Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editingId ? "Edit Examination" : "Create New Examination"}</DialogTitle>
                        <DialogDescription>Fill in the details and select which classes will take this exam.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label>Exam Name <span className="text-red-500">*</span></Label>
                            <Input placeholder="e.g. Mid-Term 2025, Annual Exam"
                                value={name} onChange={e => setName(e.target.value)} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Start Date <span className="text-red-500">*</span></Label>
                                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>End Date <span className="text-red-500">*</span></Label>
                                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Applicable Classes <span className="text-red-500">*</span></Label>
                            <p className="text-xs text-muted-foreground">Select all classes that will take this exam.</p>
                            {allClasses.length === 0 ? (
                                <p className="text-sm text-muted-foreground italic">No classes found (add students first).</p>
                            ) : (
                                <div className="flex flex-wrap gap-2 p-3 border rounded-lg bg-muted/10 max-h-40 overflow-y-auto">
                                    {allClasses.map(cls => (
                                        <button
                                            key={cls}
                                            type="button"
                                            onClick={() => toggleClass(cls)}
                                            className={`px-3 py-1 rounded-full text-sm font-medium border transition-all 
                                                ${selectedClasses.includes(cls)
                                                    ? "bg-primary text-primary-foreground border-primary"
                                                    : "bg-background text-foreground border-border hover:border-primary"}`}
                                        >
                                            {cls}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancel</Button>
                        <Button onClick={handleSave} disabled={isSaving}>
                            {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save Exam"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
