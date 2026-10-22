"use client";

import { useState, useEffect, useMemo, use } from "react";
import { collectionGroup, getDocs, doc, getDoc, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Exam } from "@/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, Printer, FileText, LayoutTemplate, Ticket } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
    REPORT_LABEL, REPORT_ORDER, reportCardKey, detectReportType,
    buildReportCardPage, buildReportCardDocument, loadLogoDataUrl, openPrintWindow,
    type ReportType, type PublishedReportCard,
} from "@/lib/reportCard";

// Shows the report cards PUBLISHED from the landscape generator — the same
// snapshot the student portal reads, so both always print the identical card.
export default function AdminViewResultsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: examId } = use(params);

    const [exam, setExam] = useState<Exam | null>(null);
    const [reportType, setReportType] = useState<ReportType | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [cards, setCards] = useState<PublishedReportCard[]>([]);

    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedClass, setSelectedClass] = useState("all");
    const [selectedSection, setSelectedSection] = useState("all");

    // 1. Exam details → default report type
    useEffect(() => {
        if (!examId) return;
        const load = async () => {
            try {
                const snap = await getDoc(doc(db, "exams", examId));
                if (!snap.exists()) { setIsLoading(false); return; }
                const e = { id: snap.id, ...snap.data() } as Exam;
                setExam(e);
                setReportType(detectReportType(e));
            } catch (err) {
                console.error("Error fetching exam:", err);
                setIsLoading(false);
            }
        };
        load();
    }, [examId]);

    // 2. Published cards for this session + report type — one query, no per-student lookups
    useEffect(() => {
        if (!exam || !reportType) return;
        const load = async () => {
            setIsLoading(true);
            setLoadError("");
            try {
                const snap = await getDocs(query(
                    collectionGroup(db, "cards"),
                    where("cardKey", "==", reportCardKey(exam.session, reportType))
                ));
                const list = snap.docs.map(d => d.data() as PublishedReportCard);
                list.sort((a, b) =>
                    (a.className || "").localeCompare(b.className || "", undefined, { numeric: true }) ||
                    (a.section || "").localeCompare(b.section || "") ||
                    String(a.student?.admissionNumber || "").localeCompare(String(b.student?.admissionNumber || ""), undefined, { numeric: true })
                );
                setCards(list);
            } catch (err) {
                console.error("Error fetching report cards:", err);
                setCards([]);
                setLoadError("Could not load report cards. Make sure the latest firestore.rules and firestore.indexes.json are deployed.");
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [exam, reportType]);

    const availableClasses = useMemo(
        () => Array.from(new Set(cards.map(c => c.className).filter(Boolean))),
        [cards]
    );
    const availableSections = useMemo(
        () => Array.from(new Set(
            cards.filter(c => selectedClass === "all" || c.className === selectedClass).map(c => c.section).filter(Boolean)
        )),
        [cards, selectedClass]
    );

    const filteredCards = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return cards.filter(c =>
            (selectedClass === "all" || c.className === selectedClass) &&
            (selectedSection === "all" || c.section === selectedSection) &&
            (!q ||
                (c.student?.name || "").toLowerCase().includes(q) ||
                String(c.student?.admissionNumber || "").toLowerCase().includes(q))
        );
    }, [cards, searchQuery, selectedClass, selectedSection]);

    const handlePrint = async (list: PublishedReportCard[]) => {
        if (list.length === 0) return;
        const logoSrc = await loadLogoDataUrl();
        const pages = list.map(c => buildReportCardPage(c.student, c.ctx, logoSrc)).join("");
        const title = list.length === 1
            ? `Report Card — ${list[0].student.name}`
            : `Report Cards — ${exam?.name ?? ""} | ${reportType ? REPORT_LABEL[reportType] : ""}`;
        openPrintWindow(buildReportCardDocument(pages, title));
    };

    if (isLoading && !exam) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <Link href="/admin/exams">
                        <Button variant="ghost" size="icon" className="h-8 w-8">&larr;</Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">View Published Report Cards</h1>
                        <p className="text-muted-foreground">
                            {exam?.name} — View and print published report cards
                            {exam?.session && (
                                <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Session {exam.session}</span>
                            )}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Link href={`/admin/exams/${examId}/admit-cards`}>
                        <Button variant="outline" className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50">
                            <Ticket className="h-4 w-4" />
                            Admit Cards
                        </Button>
                    </Link>
                    <Link href={`/admin/exams/${examId}/results/landscape`}>
                        <Button variant="outline" className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                            <LayoutTemplate className="h-4 w-4" />
                            Landscape Report Cards
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-center bg-muted/20 p-4 rounded-xl border">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search student name or admission number..."
                        className="pl-9 bg-background"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                {reportType && (
                    <Select value={reportType} onValueChange={(val) => {
                        setReportType(val as ReportType);
                        setSelectedClass("all");
                        setSelectedSection("all");
                    }}>
                        <SelectTrigger className="w-full sm:w-[170px] bg-background">
                            <SelectValue placeholder="Report type" />
                        </SelectTrigger>
                        <SelectContent>
                            {REPORT_ORDER.map(rt => (
                                <SelectItem key={rt} value={rt}>{REPORT_LABEL[rt]}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
                {availableClasses.length > 0 && (
                    <Select value={selectedClass} onValueChange={(val) => {
                        setSelectedClass(val);
                        setSelectedSection("all"); // Reset section when class changes
                    }}>
                        <SelectTrigger className="w-full sm:w-[150px] bg-background">
                            <SelectValue placeholder="Filter by class" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Classes</SelectItem>
                            {availableClasses.map(cls => (
                                <SelectItem key={cls} value={cls}>Class {cls}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                {availableSections.length > 0 && (
                    <Select value={selectedSection} onValueChange={setSelectedSection}>
                        <SelectTrigger className="w-full sm:w-[150px] bg-background">
                            <SelectValue placeholder="Filter by section" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Sections</SelectItem>
                            {availableSections.map(sec => (
                                <SelectItem key={sec} value={sec}>{sec}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>

            <div className="flex justify-between items-center gap-3 flex-wrap text-sm text-muted-foreground px-1">
                <span>
                    Published: <strong className="text-foreground">{cards.length}</strong>
                    <span className="mx-2">·</span>
                    Showing: <strong className="text-foreground">{filteredCards.length}</strong>
                </span>
                {filteredCards.length > 0 && (
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => handlePrint(filteredCards)}>
                        <Printer className="h-4 w-4 text-emerald-600" />
                        Print All {filteredCards.length}
                    </Button>
                )}
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center p-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : loadError ? (
                <div className="py-10 px-4 text-center text-sm text-red-700 border border-red-200 rounded-xl bg-red-50">
                    {loadError}
                </div>
            ) : filteredCards.length === 0 ? (
                <div className="py-20 text-center text-muted-foreground border rounded-xl bg-muted/10">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    {cards.length === 0 ? (
                        <p>
                            No {reportType ? REPORT_LABEL[reportType] : ""} report cards published yet.<br />
                            Open <Link href={`/admin/exams/${examId}/results/landscape`} className="text-primary underline">Landscape Report Cards</Link>, generate them and click &quot;Publish to Students&quot;.
                        </p>
                    ) : (
                        <p>No report cards found for the selected filters.</p>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredCards.map(c => (
                        <div key={`${c.uid}_${c.cardKey}`} className="border rounded-xl p-4 flex flex-col gap-4 bg-card hover:shadow-md transition-shadow">
                            <div className="flex justify-between items-start gap-2">
                                <div className="min-w-0">
                                    <h3 className="font-semibold text-lg line-clamp-1">{c.student.name}</h3>
                                    <p className="text-sm text-muted-foreground">Adm No: {c.student.admissionNumber}</p>
                                </div>
                                <Badge variant="outline" className="bg-muted shrink-0">Class {c.className}-{c.section}</Badge>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-sm pt-2 border-t border-dashed">
                                <div>
                                    <span className="text-muted-foreground block text-xs">Total Score</span>
                                    <span className="font-medium text-blue-600">{c.summary.total} / {c.summary.max}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-xs">Percentage</span>
                                    <span className={`font-medium ${c.summary.percentage < 33 ? "text-red-600" : ""}`}>{c.summary.percentage.toFixed(1)}%</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-xs">Grade</span>
                                    <span className={`font-bold whitespace-nowrap ${c.summary.percentage < 33 ? "text-red-600" : ""}`}>{c.summary.grade}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-xs">Class Position</span>
                                    <span className="font-bold">{c.summary.rank ?? "—"}</span>
                                </div>
                            </div>

                            <Button variant="outline" className="w-full gap-2 mt-2" onClick={() => handlePrint([c])}>
                                <Printer className="h-4 w-4 text-emerald-600" />
                                <span>Print Report Card</span>
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
