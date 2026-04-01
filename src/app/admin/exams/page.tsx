"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
    collection, doc, onSnapshot, query, orderBy,
    collectionGroup, getDocs, setDoc, updateDoc, writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Exam } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog, DialogContent, DialogDescription, DialogHeader,
    DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
    CheckCircle2, Circle, Globe, Lock, Loader2, CalendarCheck,
    ChevronRight, Settings2, Plus, Eye, BookOpen, FileCheck, Layers, Ticket,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────
const FIXED_CLASSES = ["NUR", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

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

// The 4 fixed exam slots that make up one academic session
const SESSION_EXAM_SLOTS = [
    {
        key: "unit1",
        examType: "Unit Test" as const,
        label: "Unit I Test",
        term: "Term 1",
        marksPerSubject: 20,
        description: "Per Test (10) + Note Book (5) + SEA (5)",
        color: "blue",
    },
    {
        key: "halfYearly",
        examType: "Term Exam" as const,
        label: "Half Yearly Exam",
        term: "Term 1",
        marksPerSubject: 80,
        description: "Written exam — 80 marks per subject",
        color: "indigo",
    },
    {
        key: "unit2",
        examType: "Unit Test" as const,
        label: "Unit II Test",
        term: "Term 2",
        marksPerSubject: 20,
        description: "Per Test (10) + Note Book (5) + SEA (5)",
        color: "orange",
    },
    {
        key: "annual",
        examType: "Annual Exam" as const,
        label: "Annual Exam",
        term: "Term 2",
        marksPerSubject: 80,
        description: "Written exam — 80 marks per subject + Co-Scholastic",
        color: "emerald",
    },
];

type Slot = typeof SESSION_EXAM_SLOTS[number];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function statusBadge(status: string) {
    if (status === "Published") {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                <Globe className="w-3 h-3" /> Published
            </span>
        );
    }
    if (status === "Active") {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                <CheckCircle2 className="w-3 h-3" /> Active
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
            <Circle className="w-3 h-3" /> Inactive
        </span>
    );
}

const colorMap: Record<string, { bg: string; border: string; icon: string; pill: string }> = {
    blue:    { bg: "bg-blue-50",    border: "border-blue-200",    icon: "text-blue-600",    pill: "bg-blue-100 text-blue-700" },
    indigo:  { bg: "bg-indigo-50",  border: "border-indigo-200",  icon: "text-indigo-600",  pill: "bg-indigo-100 text-indigo-700" },
    orange:  { bg: "bg-orange-50",  border: "border-orange-200",  icon: "text-orange-600",  pill: "bg-orange-100 text-orange-700" },
    emerald: { bg: "bg-emerald-50", border: "border-emerald-200", icon: "text-emerald-600", pill: "bg-emerald-100 text-emerald-700" },
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminExamsPage() {
    const [exams, setExams] = useState<Exam[]>([]);
    const [allClasses, setAllClasses] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Session setup dialog
    const [isSessionDialogOpen, setIsSessionDialogOpen] = useState(false);
    const [sessionYear, setSessionYear] = useState("");
    const [isSavingSession, setIsSavingSession] = useState(false);

    // Exam config dialog (dates + classes for one slot)
    const [configExam, setConfigExam] = useState<Exam | null>(null);
    const [cfgStartDate, setCfgStartDate] = useState("");
    const [cfgEndDate, setCfgEndDate] = useState("");
    const [cfgClasses, setCfgClasses] = useState<string[]>([]);
    const [isSavingConfig, setIsSavingConfig] = useState(false);

    // Which session tab is active
    const [activeSession, setActiveSession] = useState<string | null>(null);

    // ── Firestore listeners ──────────────────────────────────────────────────
    useEffect(() => {
        const q = query(collection(db, "exams"), orderBy("createdAt", "desc"));
        const unsub = onSnapshot(q, (snap) => {
            const all = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Exam);
            setExams(all);
            // Default to first session found
            const sessions = Array.from(new Set(all.map(e => e.session || "").filter(Boolean)));
            if (sessions.length && !activeSession) setActiveSession(sessions[0] ?? null);
            setIsLoading(false);
        }, () => setIsLoading(false));
        return () => unsub();
    }, []);

    // ── Load class names ─────────────────────────────────────────────────────
    useEffect(() => {
        const load = async () => {
            try {
                const snap = await getDocs(collectionGroup(db, "profiles"));
                const classSet = new Set<string>(FIXED_CLASSES);
                snap.docs.forEach(d => {
                    const data = d.data();
                    [data.className, data.currentClass].forEach(raw => {
                        if (raw) classSet.add(normaliseClass(String(raw)));
                    });
                });
                setAllClasses(sortClasses(Array.from(classSet)));
            } catch { /* ignore */ }
        };
        load();
    }, []);

    // ── Derived: sessions and grouped exams ──────────────────────────────────
    const sessions = Array.from(new Set(exams.map(e => e.session || "").filter(Boolean))).sort().reverse();
    const ungrouped = exams.filter(e => !e.session); // legacy exams with no session

    function getSessionExam(session: string, slot: Slot): Exam | undefined {
        const sessionExams = exams.filter(e => e.session === session && e.examType === slot.examType);
        if (slot.examType !== "Unit Test") return sessionExams[0];
        // For Unit Tests, distinguish Unit I vs Unit II properly
        if (slot.key === "unit1") {
            // Match "Unit I" but NOT "Unit II" — use regex word boundary
            return sessionExams.find(e => /unit\s+i(?!i)/i.test(e.name || "")) ?? sessionExams[0];
        }
        // unit2
        return sessionExams.find(e => /unit\s+ii/i.test(e.name || "")) ?? (sessionExams.length > 1 ? sessionExams[1] : undefined);
    }

    // ── Create / setup a new session (auto-creates 4 exam docs) ─────────────
    const handleCreateSession = async () => {
        const yr = sessionYear.trim();
        if (!yr || !/^\d{4}-\d{2}$/.test(yr) && !/^\d{4}-\d{4}$/.test(yr)) {
            alert("Enter session in format 2026-27 or 2026-2027");
            return;
        }
        setIsSavingSession(true);
        try {
            const batch = writeBatch(db);
            SESSION_EXAM_SLOTS.forEach(slot => {
                const ref = doc(collection(db, "exams"));
                batch.set(ref, {
                    name: `${slot.label} (${yr})`,
                    examType: slot.examType,
                    session: yr,
                    status: "Inactive",
                    classesApplicable: [],
                    startDate: "",
                    endDate: "",
                    createdAt: Date.now() + SESSION_EXAM_SLOTS.indexOf(slot),
                });
            });
            await batch.commit();
            setActiveSession(yr);
            setIsSessionDialogOpen(false);
            setSessionYear("");
        } catch (err: any) {
            alert("Error creating session: " + err.message);
        } finally {
            setIsSavingSession(false);
        }
    };

    // ── Activate / Publish toggle ────────────────────────────────────────────
    const handleToggleStatus = async (exam: Exam) => {
        const next = exam.status === "Inactive" ? "Active" :
                     exam.status === "Active"   ? "Published" : "Active";
        try {
            await updateDoc(doc(db, "exams", exam.id!), { status: next });
            // Refresh the exams list so UI reflects the change for THIS exam only
            setExams(prev => prev.map(e => e.id === exam.id ? { ...e, status: next } : e));
        } catch (err: any) {
            alert("Error: " + err.message);
        }
    };

    // ── Open config dialog ───────────────────────────────────────────────────
    const openConfig = (exam: Exam) => {
        setConfigExam(exam);
        setCfgStartDate(exam.startDate || "");
        setCfgEndDate(exam.endDate || "");
        setCfgClasses(exam.classesApplicable || []);
    };

    const handleSaveConfig = async () => {
        if (!configExam?.id) return;
        setIsSavingConfig(true);
        try {
            await updateDoc(doc(db, "exams", configExam.id), {
                startDate: cfgStartDate,
                endDate: cfgEndDate,
                classesApplicable: cfgClasses,
            });
            setConfigExam(null);
        } catch (err: any) {
            alert("Error saving: " + err.message);
        } finally {
            setIsSavingConfig(false);
        }
    };

    const toggleCfgClass = (cls: string) => {
        setCfgClasses(prev => prev.includes(cls) ? prev.filter(c => c !== cls) : [...prev, cls]);
    };
    const selectAllClasses = () => setCfgClasses([...allClasses]);
    const clearAllClasses  = () => setCfgClasses([]);

    // ─── Render ──────────────────────────────────────────────────────────────
    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="p-6 space-y-8 max-w-6xl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Layers className="h-8 w-8 text-primary" /> Examinations
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Manage academic sessions and their 4-exam structure (Unit I → Half Yearly → Unit II → Annual)
                    </p>
                </div>
                <Button onClick={() => setIsSessionDialogOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" /> New Session
                </Button>
            </div>

            {/* Session Tabs */}
            {sessions.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                    {sessions.map(s => (
                        <button
                            key={s}
                            onClick={() => setActiveSession(s)}
                            className={`px-4 py-2 rounded-full border text-sm font-semibold transition-all ${
                                activeSession === s
                                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                    : "bg-white text-muted-foreground border-border hover:border-primary/50"
                            }`}
                        >
                            Session {s}
                        </button>
                    ))}
                    {ungrouped.length > 0 && (
                        <button
                            onClick={() => setActiveSession(null)}
                            className={`px-4 py-2 rounded-full border text-sm font-semibold transition-all ${
                                activeSession === null
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-white text-muted-foreground border-border hover:border-primary/50"
                            }`}
                        >
                            Other Exams
                        </button>
                    )}
                </div>
            )}

            {/* Empty state */}
            {sessions.length === 0 && (
                <Card className="border-dashed bg-muted/5">
                    <CardContent className="py-20 text-center space-y-4">
                        <CalendarCheck className="h-16 w-16 text-muted-foreground/30 mx-auto" />
                        <div>
                            <h2 className="text-xl font-semibold">No Sessions Yet</h2>
                            <p className="text-muted-foreground mt-1 max-w-md mx-auto">
                                Create an academic session to automatically set up the 4 standard exams —
                                Unit I Test, Half Yearly, Unit II Test, and Annual Exam.
                            </p>
                        </div>
                        <Button onClick={() => setIsSessionDialogOpen(true)} className="gap-2 mx-auto mt-2">
                            <Plus className="h-4 w-4" /> Create Your First Session
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Session grid — 4 exam cards */}
            {activeSession && (
                <div className="space-y-6">
                    {/* Term 1 */}
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <BookOpen className="h-5 w-5 text-blue-600" />
                            <h2 className="text-lg font-bold text-blue-700">Term 1</h2>
                            <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200">April – September</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {SESSION_EXAM_SLOTS.filter(s => s.term === "Term 1").map(slot => {
                                const exam = getSessionExam(activeSession, slot);
                                return (
                                    <ExamSlotCard
                                        key={slot.key}
                                        slot={slot}
                                        exam={exam}
                                        onToggleStatus={() => exam && handleToggleStatus(exam)}
                                        onConfig={() => exam && openConfig(exam)}
                                    />
                                );
                            })}
                        </div>
                    </div>

                    {/* Term 2 */}
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <BookOpen className="h-5 w-5 text-orange-600" />
                            <h2 className="text-lg font-bold text-orange-700">Term 2</h2>
                            <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200">October – March</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {SESSION_EXAM_SLOTS.filter(s => s.term === "Term 2").map(slot => {
                                const exam = getSessionExam(activeSession, slot);
                                return (
                                    <ExamSlotCard
                                        key={slot.key}
                                        slot={slot}
                                        exam={exam}
                                        onToggleStatus={() => exam && handleToggleStatus(exam)}
                                        onConfig={() => exam && openConfig(exam)}
                                    />
                                );
                            })}
                        </div>
                    </div>

                    {/* Landscape report button for session */}
                    {(() => {
                        const annualExam = exams.find(e => e.session === activeSession && e.examType === "Annual Exam");
                        if (!annualExam) return null;
                        return (
                            <div className="flex justify-end">
                                <Link href={`/admin/exams/${annualExam.id}/results/landscape`}>
                                    <Button variant="outline" className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                                        <FileCheck className="h-4 w-4" />
                                        Generate Annual Report Cards (Landscape)
                                    </Button>
                                </Link>
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* Legacy / Other exams */}
            {activeSession === null && ungrouped.length > 0 && (
                <div className="space-y-3">
                    {ungrouped.map(exam => (
                        <Card key={exam.id} className="flex items-center gap-4 px-5 py-4 border-border/50">
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold truncate">{exam.name}</p>
                                <p className="text-xs text-muted-foreground">{exam.startDate} → {exam.endDate}</p>
                            </div>
                            {statusBadge(exam.status || "Inactive")}
                            <Link href={`/admin/exams/${exam.id}/results/view`}>
                                <Button size="sm" variant="ghost" className="gap-1">
                                    <Eye className="h-4 w-4" /> Results
                                </Button>
                            </Link>
                        </Card>
                    ))}
                </div>
            )}

            {/* ── New Session Dialog ── */}
            <Dialog open={isSessionDialogOpen} onOpenChange={setIsSessionDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Create Academic Session</DialogTitle>
                        <DialogDescription>
                            Entering the session will automatically create all 4 exams:
                            Unit I Test, Half Yearly, Unit II Test, and Annual Exam.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>Academic Session <span className="text-red-500">*</span></Label>
                            <Input
                                placeholder="e.g. 2026-27"
                                value={sessionYear}
                                onChange={e => setSessionYear(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">Format: 2026-27 or 2026-2027</p>
                        </div>
                        <div className="bg-muted/20 rounded-lg p-3 space-y-2 border">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Will auto-create:</p>
                            {SESSION_EXAM_SLOTS.map(slot => (
                                <div key={slot.key} className="flex items-center gap-2 text-sm">
                                    <span className={`w-2 h-2 rounded-full ${
                                        slot.color === "blue" ? "bg-blue-400" :
                                        slot.color === "indigo" ? "bg-indigo-400" :
                                        slot.color === "orange" ? "bg-orange-400" : "bg-emerald-400"
                                    }`} />
                                    <span className="font-medium">{slot.label}</span>
                                    <span className="text-muted-foreground">— {slot.term}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsSessionDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateSession} disabled={isSavingSession}>
                            {isSavingSession ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                            Create Session
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Exam Config Dialog ── */}
            <Dialog open={!!configExam} onOpenChange={v => !v && setConfigExam(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Configure — {configExam?.name}</DialogTitle>
                        <DialogDescription>
                            Set exam dates and which classes this exam applies to.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-2">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Start Date</Label>
                                <Input type="date" value={cfgStartDate} onChange={e => setCfgStartDate(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>End Date</Label>
                                <Input type="date" value={cfgEndDate} onChange={e => setCfgEndDate(e.target.value)} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Applicable Classes</Label>
                                <div className="flex gap-2 text-xs">
                                    <button onClick={selectAllClasses} className="text-primary hover:underline font-medium">All</button>
                                    <span className="text-muted-foreground">|</span>
                                    <button onClick={clearAllClasses} className="text-muted-foreground hover:underline">None</button>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 bg-muted/10 rounded-lg border">
                                {allClasses.map(cls => (
                                    <button
                                        key={cls}
                                        onClick={() => toggleCfgClass(cls)}
                                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
                                            cfgClasses.includes(cls)
                                                ? "bg-primary text-primary-foreground border-primary"
                                                : "bg-white text-muted-foreground border-border hover:border-primary/40"
                                        }`}
                                    >
                                        Class {cls}
                                    </button>
                                ))}
                            </div>
                            {cfgClasses.length > 0 && (
                                <p className="text-xs text-muted-foreground">{cfgClasses.length} class(es) selected</p>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfigExam(null)}>Cancel</Button>
                        <Button onClick={handleSaveConfig} disabled={isSavingConfig}>
                            {isSavingConfig ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Save Configuration
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ─── Exam Slot Card (sub-component) ──────────────────────────────────────────
function ExamSlotCard({
    slot, exam,
    onToggleStatus, onConfig,
}: {
    slot: Slot;
    exam: Exam | undefined;
    onToggleStatus: () => void;
    onConfig: () => void;
}) {
    const c = colorMap[slot.color];
    const status = exam?.status || "Inactive";

    return (
        <Card className={`border ${exam ? c.border : "border-dashed border-gray-200"} ${exam ? c.bg : "bg-gray-50/40"} transition-all`}>
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg ${c.bg} border ${c.border}`}>
                            <CalendarCheck className={`h-4 w-4 ${c.icon}`} />
                        </div>
                        <div>
                            <CardTitle className="text-base leading-tight">{slot.label}</CardTitle>
                            <p className="text-xs text-muted-foreground mt-0.5">{slot.description}</p>
                        </div>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.pill}`}>
                        /{slot.marksPerSubject}
                    </span>
                </div>
            </CardHeader>

            <CardContent className="space-y-3 pt-0">
                {exam ? (
                    <>
                        {/* Status */}
                        <div className="flex items-center justify-between">
                            {statusBadge(status)}
                            <span className="text-xs text-muted-foreground">
                                {exam.classesApplicable?.length
                                    ? `${exam.classesApplicable.length} class(es)`
                                    : <span className="text-amber-600 font-medium">No classes set</span>}
                            </span>
                        </div>

                        {/* Dates */}
                        {(exam.startDate || exam.endDate) && (
                            <div className="text-xs text-muted-foreground flex gap-1 items-center">
                                <CalendarCheck className="h-3 w-3" />
                                {exam.startDate && new Date(exam.startDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                                {exam.startDate && exam.endDate && " → "}
                                {exam.endDate && new Date(exam.endDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                            </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex gap-2 pt-1">
                            <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 gap-1 text-xs"
                                onClick={onConfig}
                            >
                                <Settings2 className="h-3.5 w-3.5" /> Configure
                            </Button>

                            {status === "Inactive" && (
                                <Button size="sm" className="flex-1 gap-1 text-xs bg-blue-600 hover:bg-blue-700" onClick={onToggleStatus}>
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Activate
                                </Button>
                            )}
                            {status === "Active" && (
                                <>
                                    <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={onToggleStatus}>
                                        <Globe className="h-3.5 w-3.5" /> Publish
                                    </Button>
                                    <Link href={`/admin/exams/${exam.id}/results/view`} className="flex-1">
                                        <Button size="sm" variant="outline" className="w-full gap-1 text-xs">
                                            <Eye className="h-3.5 w-3.5" /> Results
                                        </Button>
                                    </Link>
                                </>
                            )}
                            {status === "Published" && (
                                <>
                                    <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs border-gray-300 text-gray-500 hover:bg-gray-50" onClick={onToggleStatus}>
                                        <Lock className="h-3.5 w-3.5" /> Unpublish
                                    </Button>
                                    <Link href={`/admin/exams/${exam.id}/results/view`} className="flex-1">
                                        <Button size="sm" className="w-full gap-1 text-xs bg-emerald-600 hover:bg-emerald-700">
                                            <Eye className="h-3.5 w-3.5" /> View Results
                                        </Button>
                                    </Link>
                                </>
                            )}
                        </div>

                        {/* Admit Card buttons — visible when Active or Published */}
                        {(status === "Active" || status === "Published") && (
                            <div className="flex gap-2">
                                <Link href={`/admin/exams/${exam.id}/admit-cards`} className="flex-1">
                                    <Button size="sm" variant="outline" className="w-full gap-1 text-xs border-amber-300 text-amber-700 hover:bg-amber-50">
                                        <Ticket className="h-3.5 w-3.5" /> Admit Cards
                                    </Button>
                                </Link>
                                <Link href={`/admin/exams/${exam.id}/admit-cards/view`} className="flex-1">
                                    <Button size="sm" variant="outline" className="w-full gap-1 text-xs">
                                        <Eye className="h-3.5 w-3.5" /> View Cards
                                    </Button>
                                </Link>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="py-4 text-center">
                        <p className="text-xs text-muted-foreground">Not configured yet</p>
                        <p className="text-xs text-muted-foreground">Create a session to auto-generate</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
