"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Plus, Trash2, Edit, Save, Loader2, FileText,
    Link as LinkIcon, X, CheckCircle, ChevronDown, ChevronUp,
    Receipt, Building2, BookText, Palette, Users, MessageCircle,
    Bus, Medal, GraduationCap, Settings, Scale, UserCheck, BookOpen
} from "lucide-react";
import {
    collection, query, orderBy, onSnapshot, addDoc,
    updateDoc, deleteDoc, doc, serverTimestamp, getDocs, QueryDocumentSnapshot
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CloudinaryUpload } from "@/components/ui/cloudinary-upload";

// ── Types ─────────────────────────────────────────────────────────────────────
interface AcademicProgram {
    id: string;
    title: string;
    grades: string;
    desc: string;
    subjects: string;
}

interface AcademicInfo {
    id: string;
    label: string;
    type: "file" | "link" | "text";
    url: string;
    desc?: string;
    order?: number;
}

// ── 13 Default Sections ───────────────────────────────────────────────────────
const DEFAULT_SECTIONS = [
    { label: "Fee Structure", type: "file", url: "", desc: "Download the complete fee structure for the current academic year.", icon: Receipt, order: 1 },

    { label: "Curriculum", type: "file", url: "", desc: "Detailed breakdown of our academic curriculum and learning outcomes.", icon: BookText, order: 3 },
    { label: "Co-curricular Activities", type: "link", url: "", desc: "Discover the wide range of activities beyond the classroom.", icon: Palette, order: 4 },
    { label: "SMC Member Details", type: "file", url: "", desc: "List of School Management Committee members.", icon: Users, order: 5 },
    { label: "Grievance Officer", type: "link", url: "", desc: "Contact details for the grievance redressal officer.", icon: MessageCircle, order: 6 },
    { label: "Transport Facility", type: "link", url: "", desc: "Information about bus routes, safe transport policy, and charges.", icon: Bus, order: 7 },
    { label: "Affiliation Information", type: "file", url: "", desc: "Official affiliation certificates and status documents.", icon: Medal, order: 8 },
    { label: "Faculty Details", type: "file", url: "", desc: "Meet our experienced and qualified teaching staff.", icon: GraduationCap, order: 9 },
    { label: "Academic System", type: "link", url: "", desc: "Overview of our grading system, assessment patterns, and academic policies.", icon: Settings, order: 10 },
    { label: "Admission Procedure", type: "file", url: "", desc: "Step-by-step guide to the admission process and requirements.", icon: FileText, order: 11 },
    { label: "Rules & Regulation's", type: "file", url: "", desc: "Code of conduct and school policies for students and parents.", icon: Scale, order: 12 },
    { label: "Student / Parents Corner", type: "text", url: "", desc: `STUDENTS/PARENTS CORNER\n\nStudent's Rights\n- A quality education.\n- Education without undue interruption, disruption, fear or inhibition.\n- Receive respect from school personnel and other students.\n\nStudent's Responsibilities\n- To understand what the assignments are and when they are due.\n- To turn assignments in by the specific due date.\n- Put forth best effort to meet classroom expectations.\n\nParent's Responsibilities\n- To provide an environment conducive to uninterrupted study time.\n- To make school the number one priority during the academic year.\n- To contact the classroom teacher in the event of questions or concerns.`, icon: UserCheck, order: 13 },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────
export default function AdminAcademicsPage() {
    const [programs, setPrograms] = useState<AcademicProgram[]>([]);
    const [infos, setInfos] = useState<AcademicInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [seeding, setSeeding] = useState(false);
    const [activeTab, setActiveTab] = useState("sections");
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [savedId, setSavedId] = useState<string | null>(null);

    // Program form
    const [progId, setProgId] = useState<string | null>(null);
    const [progTitle, setProgTitle] = useState("");
    const [progGrades, setProgGrades] = useState("");
    const [progDesc, setProgDesc] = useState("");
    const [progSubjects, setProgSubjects] = useState("");

    // ── Firestore listeners ───────────────────────────────────────────────────
    useEffect(() => {
        const unsubPrograms = onSnapshot(
            query(collection(db, "academic_programs"), orderBy("createdAt", "asc")),
            (snap) => setPrograms(snap.docs.map((d: QueryDocumentSnapshot) => ({ id: d.id, ...d.data() } as AcademicProgram)))
        );

        const unsubInfos = onSnapshot(
            // Do NOT use orderBy("order") — Firestore excludes docs missing that field
            collection(db, "academic_info"),
            async snap => {
                if (snap.empty) {
                    // Auto-seed 13 defaults on first load
                    await seedDefaults();
                } else {
                    const sorted = snap.docs
                        .map((d: QueryDocumentSnapshot) => ({ id: d.id, ...d.data() } as AcademicInfo))
                        .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
                    setInfos(sorted);
                    setLoading(false);
                }
            }
        );

        return () => { unsubPrograms(); unsubInfos(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const seedDefaults = async () => {
        setSeeding(true);
        // Check again to avoid duplicates
        const snap = await getDocs(collection(db, "academic_info"));
        if (snap.empty) {
            for (const item of DEFAULT_SECTIONS) {
                await addDoc(collection(db, "academic_info"), {
                    label: item.label,
                    type: item.type,
                    url: item.url,
                    desc: item.desc,
                    order: item.order,
                    createdAt: serverTimestamp(),
                });
            }
        }
        setSeeding(false);
        setLoading(false);
    };

    // ── Section (info) save ───────────────────────────────────────────────────
    const handleSaveSection = async (info: AcademicInfo, newDesc: string, newUrl: string, newType: "file" | "link" | "text") => {
        await updateDoc(doc(db, "academic_info", info.id), {
            desc: newDesc,
            url: newUrl,
            type: newType,
            updatedAt: serverTimestamp(),
        });
        setSavedId(info.id);
        setTimeout(() => setSavedId(null), 2000);
        setExpandedId(null);
    };

    const handleDeleteSection = async (id: string) => {
        if (confirm("Delete this section? It will no longer appear on the public page.")) {
            await deleteDoc(doc(db, "academic_info", id));
        }
    };

    // ── Program handlers ──────────────────────────────────────────────────────
    const handleSaveProgram = async () => {
        if (!progTitle) return;
        const data = { title: progTitle, grades: progGrades, desc: progDesc, subjects: progSubjects, updatedAt: serverTimestamp() };
        if (progId) {
            await updateDoc(doc(db, "academic_programs", progId), data);
        } else {
            await addDoc(collection(db, "academic_programs"), { ...data, createdAt: serverTimestamp() });
        }
        resetProgForm();
    };
    const handleDeleteProgram = async (id: string) => {
        if (confirm("Delete this program?")) await deleteDoc(doc(db, "academic_programs", id));
    };
    const resetProgForm = () => { setProgId(null); setProgTitle(""); setProgGrades(""); setProgDesc(""); setProgSubjects(""); };

    const getDefaultIcon = (label: string) => {
        const l = label.toLowerCase();
        if (l.includes("fee")) return Receipt;
        if (l.includes("infra")) return Building2;
        if (l.includes("curriculum")) return BookText;
        if (l.includes("activity")) return Palette;
        if (l.includes("smc") || l.includes("member")) return Users;
        if (l.includes("grievance")) return MessageCircle;
        if (l.includes("transport")) return Bus;
        if (l.includes("affiliation")) return Medal;
        if (l.includes("faculty")) return GraduationCap;
        if (l.includes("academic sys")) return Settings;
        if (l.includes("admission")) return FileText;
        if (l.includes("rule")) return Scale;
        if (l.includes("parent") || l.includes("student")) return UserCheck;
        return FileText;
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-navy">Academics Page Manager</h1>
                    <p className="text-sm text-gray-500 mt-0.5">Manage all 13 academic sections visible on the public Academics page</p>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
                    <TabsTrigger value="sections">13 Sections</TabsTrigger>
                    <TabsTrigger value="programs">Programs</TabsTrigger>
                </TabsList>

                {/* ── 13 SECTIONS TAB ──────────────────────────────────────── */}
                <TabsContent value="sections" className="space-y-4 mt-6">
                    {(loading || seeding) && (
                        <div className="flex items-center gap-3 text-gray-400 py-10 justify-center">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span className="text-sm">{seeding ? "Setting up default sections..." : "Loading..."}</span>
                        </div>
                    )}

                    {!loading && !seeding && infos.map((info) => {
                        const Icon = getDefaultIcon(info.label);
                        const isExpanded = expandedId === info.id;
                        const isSaved = savedId === info.id;
                        const hasContent = !!info.url || (info.type === "text" && !!info.desc);

                        return (
                            <SectionCard
                                key={info.id}
                                info={info}
                                Icon={Icon}
                                isExpanded={isExpanded}
                                isSaved={isSaved}
                                hasContent={hasContent}
                                onToggle={() => setExpandedId(isExpanded ? null : info.id)}
                                onSave={handleSaveSection}
                                onDelete={handleDeleteSection}
                            />
                        );
                    })}
                </TabsContent>

                {/* ── PROGRAMS TAB ─────────────────────────────────────────── */}
                <TabsContent value="programs" className="space-y-6 mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>{progId ? "Edit Program" : "Add New Program"}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Program Title</Label>
                                    <Input placeholder="e.g. Primary School" value={progTitle} onChange={e => setProgTitle(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Grades / Age Group</Label>
                                    <Input placeholder="e.g. Grades 1–5" value={progGrades} onChange={e => setProgGrades(e.target.value)} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Description</Label>
                                <textarea
                                    rows={3}
                                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    placeholder="Brief description of the program..."
                                    value={progDesc}
                                    onChange={e => setProgDesc(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Subjects (comma separated)</Label>
                                <Input placeholder="e.g. Math, Science, English" value={progSubjects} onChange={e => setProgSubjects(e.target.value)} />
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={handleSaveProgram} className="bg-navy hover:bg-navy-light text-white">
                                    {progId ? <Save className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                                    {progId ? "Update Program" : "Add Program"}
                                </Button>
                                {progId && <Button variant="outline" onClick={resetProgForm}>Cancel</Button>}
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid gap-4">
                        {programs.map(prog => (
                            <Card key={prog.id} className={`relative ${progId === prog.id ? "border-gold ring-1 ring-gold" : ""}`}>
                                <CardContent className="p-6">
                                    <div className="flex justify-between items-start gap-4">
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="text-lg font-bold text-navy">{prog.title}</h3>
                                                <span className="text-xs font-semibold bg-gold/10 text-gold px-2 py-0.5 rounded">{prog.grades}</span>
                                            </div>
                                            <p className="text-gray-600 text-sm mt-2">{prog.desc}</p>
                                            <div className="flex flex-wrap gap-2 mt-3">
                                                {prog.subjects.split(",").map((s, i) => (
                                                    <span key={i} className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700 border">{s.trim()}</span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex gap-1 shrink-0">
                                            <Button variant="ghost" size="icon" onClick={() => { setProgId(prog.id); setProgTitle(prog.title); setProgGrades(prog.grades); setProgDesc(prog.desc); setProgSubjects(prog.subjects); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                                                <Edit className="w-4 h-4 text-gray-500" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleDeleteProgram(prog.id)} className="text-red-500 hover:bg-red-50">
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                        {programs.length === 0 && (
                            <div className="text-center py-12 text-gray-400 text-sm border rounded-xl border-dashed">
                                No programs added yet. Add one above.
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}

// ── Section Card (Inline Editor) ──────────────────────────────────────────────
interface SectionCardProps {
    info: AcademicInfo;
    Icon: React.ElementType;
    isExpanded: boolean;
    isSaved: boolean;
    hasContent: boolean;
    onToggle: () => void;
    onSave: (info: AcademicInfo, desc: string, url: string, type: "file" | "link" | "text") => Promise<void>;
    onDelete: (id: string) => void;
}

function SectionCard({ info, Icon, isExpanded, isSaved, hasContent, onToggle, onSave, onDelete }: SectionCardProps) {
    const [desc, setDesc] = useState(info.desc || "");
    const [url, setUrl] = useState(info.url || "");
    const [type, setType] = useState<"file" | "link" | "text">(info.type || "file");
    const [saving, setSaving] = useState(false);

    // Sync when info changes (e.g. Firestore update)
    useEffect(() => {
        setDesc(info.desc || "");
        setUrl(info.url || "");
        setType(info.type || "file");
    }, [info]);

    const handleSave = async () => {
        setSaving(true);
        await onSave(info, desc, url, type);
        setSaving(false);
    };

    return (
        <Card className={`overflow-hidden transition-all ${isExpanded ? "ring-2 ring-navy/30 shadow-md" : ""} ${!hasContent ? "border-amber-200 bg-amber-50/30" : ""}`}>
            {/* Header row */}
            <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer select-none hover:bg-gray-50 transition-colors"
                onClick={onToggle}
            >
                <div className="flex items-center gap-3 min-w-0">
                    {/* Status dot */}
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${hasContent ? "bg-green-400" : "bg-amber-400"}`} />
                    <div className="w-9 h-9 rounded-lg bg-navy/5 flex items-center justify-center shrink-0">
                        <Icon className="w-4.5 h-4.5 text-navy w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="font-semibold text-navy text-sm">{info.label}</p>
                        <p className="text-xs text-gray-400 truncate max-w-xs">
                            {hasContent
                                ? (type === "text" ? "Text content set" : url)
                                : "⚠️ No content yet — click to add"}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {isSaved && <CheckCircle className="w-4 h-4 text-green-500" />}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${type === "file" ? "bg-blue-100 text-blue-700" :
                        type === "link" ? "bg-purple-100 text-purple-700" :
                            "bg-gray-100 text-gray-600"
                        }`}>
                        {type === "file" ? "PDF/Doc" : type === "link" ? "Link" : "Text"}
                    </span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
            </div>

            {/* Expanded editor */}
            {isExpanded && (
                <div className="border-t border-gray-100 px-5 py-5 space-y-4 bg-white">
                    {/* Description */}
                    <div className="space-y-1.5">
                        <Label className="text-xs text-gray-600">Description / Content</Label>
                        <textarea
                            rows={type === "text" ? 8 : 3}
                            className="flex w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy/20 resize-y"
                            placeholder={type === "text" ? "Write full content here..." : "Brief description for this section..."}
                            value={desc}
                            onChange={e => setDesc(e.target.value)}
                        />
                    </div>

                    {/* Content type toggle */}
                    <div className="space-y-1.5">
                        <Label className="text-xs text-gray-600">Content Type</Label>
                        <div className="flex gap-2 flex-wrap">
                            {(["file", "link", "text"] as const).map(t => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => { setType(t); setUrl(""); }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${type === t
                                        ? "bg-navy text-white border-navy"
                                        : "bg-white text-gray-500 border-gray-200 hover:border-navy/30"
                                        }`}
                                >
                                    {t === "file" ? "📄 File Upload" : t === "link" ? "🔗 External Link" : "📝 Text Content"}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* File upload */}
                    {type === "file" && (
                        <div className="space-y-2">
                            <Label className="text-xs text-gray-600">Upload Document (PDF / DOC)</Label>
                            <CloudinaryUpload
                                folder="admin-docs"
                                subFolder={`academics/${info.label.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`}
                                acceptedFileTypes="all"
                                maxSizeMB={15}
                                label={`Upload ${info.label}`}
                                onUpload={(fileUrl) => setUrl(fileUrl)}
                            />
                            {url && (
                                <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-100 rounded-lg">
                                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                                    <a href={url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline truncate flex-1">{url}</a>
                                    <button onClick={() => setUrl("")} className="text-gray-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Link input */}
                    {type === "link" && (
                        <div className="space-y-1.5">
                            <Label className="text-xs text-gray-600">External URL</Label>
                            <div className="flex items-center gap-2">
                                <LinkIcon className="w-4 h-4 text-gray-400 shrink-0" />
                                <Input
                                    placeholder="https://..."
                                    value={url}
                                    onChange={e => setUrl(e.target.value)}
                                    className="text-sm"
                                />
                            </div>
                        </div>
                    )}

                    {/* Text content note */}
                    {type === "text" && (
                        <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                            📝 The description above will be displayed as the full content on the public Academics page — no file or link needed.
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center justify-between pt-2">
                        <Button
                            onClick={handleSave}
                            disabled={saving}
                            className="bg-navy hover:bg-navy-light text-white text-sm"
                        >
                            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                            Save Changes
                        </Button>
                        <button
                            onClick={() => onDelete(info.id)}
                            className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 transition-colors"
                        >
                            <Trash2 className="w-3.5 h-3.5" /> Remove section
                        </button>
                    </div>
                </div>
            )}
        </Card>
    );
}
