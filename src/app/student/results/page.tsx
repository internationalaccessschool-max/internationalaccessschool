"use client";

import { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Award, FileText, ChevronRight, Download } from "lucide-react";
import {
    REPORT_LABEL, REPORT_ORDER,
    buildReportCardPage, buildReportCardDocument, loadLogoDataUrl, openPrintWindow,
    type ReportType, type PublishedReportCard,
} from "@/lib/reportCard";

const TYPE_COLOR: Record<ReportType, string> = {
    unit1:      "bg-violet-50 text-violet-700 border-violet-200",
    halfYearly: "bg-blue-50 text-blue-700 border-blue-200",
    unit2:      "bg-orange-50 text-orange-700 border-orange-200",
    annual:     "bg-emerald-50 text-emerald-700 border-emerald-200",
};

// Report cards are published by the school from the admin generator. Each card is
// one ready-made snapshot (marks, attendance, position, signatures), so this page
// reads only the student's own published cards — the same ones the office prints.
export default function StudentResultsPage() {
    const { user } = useAuth();
    const [cards, setCards] = useState<PublishedReportCard[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [selected, setSelected] = useState<PublishedReportCard | null>(null);
    const [logoSrc, setLogoSrc] = useState("/LOGO.png");

    useEffect(() => { loadLogoDataUrl().then(setLogoSrc); }, []);

    useEffect(() => {
        if (!user) return;

        const fetchCards = async () => {
            try {
                const snap = await getDocs(collection(db, "reportCards", user.uid, "cards"));
                const list = snap.docs.map(d => d.data() as PublishedReportCard);
                // Latest session first; within a session the latest report type first
                list.sort((a, b) =>
                    (b.session || "").localeCompare(a.session || "") ||
                    REPORT_ORDER.indexOf(b.reportType) - REPORT_ORDER.indexOf(a.reportType)
                );
                setCards(list);
            } catch (err) {
                console.error("Error fetching report cards:", err);
                setLoadError(true);
            } finally {
                setIsLoading(false);
            }
        };

        fetchCards();
    }, [user]);

    const cardDocument = (c: PublishedReportCard) =>
        buildReportCardDocument(
            buildReportCardPage(c.student, c.ctx, logoSrc),
            `Report Card - ${c.student.name}`
        );

    if (isLoading) {
        return (<div className="flex h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>);
    }

    if (cards.length === 0) {
        return (
            <div className="p-6">
                <Card className="border-dashed bg-muted/10">
                    <CardContent className="flex flex-col items-center justify-center py-24 text-center">
                        <Award className="h-16 w-16 text-muted-foreground/30 mb-4" />
                        <h2 className="text-2xl font-bold tracking-tight text-foreground">No Results Available</h2>
                        <p className="text-muted-foreground mt-2 max-w-sm">
                            {loadError
                                ? "Your report cards could not be loaded right now. Please try again later or contact the school office."
                                : "No report cards have been published for you yet. Please check back later or contact your class teacher."}
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // ── Detail View — the published card itself ──
    if (selected) {
        return (
            <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <Button variant="outline" onClick={() => setSelected(null)}>&larr; Back to all results</Button>
                    <Button onClick={() => openPrintWindow(cardDocument(selected))} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
                        <Download className="h-4 w-4" />
                        Download / Print
                    </Button>
                </div>
                <div className="overflow-x-auto rounded-xl border bg-[#f4f4f4]">
                    <iframe
                        title={`Report Card - ${selected.student.name}`}
                        srcDoc={cardDocument(selected)}
                        className="block border-0"
                        style={{ width: 1100, height: 820 }}
                    />
                </div>
            </div>
        );
    }

    // ── List View — Grouped by Session ──
    const groupedBySession = cards.reduce((acc, c) => {
        const session = c.session || "Other";
        if (!acc[session]) acc[session] = [];
        acc[session].push(c);
        return acc;
    }, {} as Record<string, PublishedReportCard[]>);

    return (
        <div className="p-6 md:p-10 space-y-8 max-w-6xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Academic Results</h1>
                <p className="text-muted-foreground mt-1">View and download your examination report cards.</p>
            </div>

            {Object.entries(groupedBySession).map(([session, list]) => (
                <div key={session} className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-sm font-semibold">
                            {session === "Other" ? "General" : `Session ${session}`}
                        </Badge>
                        <div className="flex-1 h-px bg-border" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {list.map(c => {
                            const failed = c.summary.percentage < 33;
                            return (
                                <Card
                                    key={c.cardKey}
                                    className="overflow-hidden hover:shadow-lg transition-all duration-300 border-border group cursor-pointer"
                                    onClick={() => setSelected(c)}
                                >
                                    <div className="h-2 bg-gradient-to-r from-[#1a2e4c] to-[#d4af37]" />
                                    <CardHeader className="pb-4">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                                <FileText className="h-6 w-6" />
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <Badge variant="secondary" className={`font-semibold border-none ${failed ? "bg-red-50 text-red-700" : "bg-[#1a2e4c]/5 text-[#1a2e4c]"}`}>
                                                    {c.summary.percentage.toFixed(1)}%
                                                </Badge>
                                                <Badge variant="outline" className={`text-xs ${TYPE_COLOR[c.reportType]}`}>{REPORT_LABEL[c.reportType]}</Badge>
                                            </div>
                                        </div>
                                        <CardTitle className="text-xl line-clamp-1">{REPORT_LABEL[c.reportType]} Report Card</CardTitle>
                                        <CardDescription>
                                            {c.summary.grade} Grade
                                            {c.summary.rank ? ` • Position ${c.summary.rank}` : ""}
                                            {` • Class ${c.className}-${c.section}`}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex items-center justify-between text-sm pt-4 border-t border-dashed border-gray-200">
                                            <span className="text-muted-foreground">
                                                {c.summary.total} / {c.summary.max}
                                            </span>
                                            <span className="text-primary font-medium flex items-center group-hover:translate-x-1 transition-transform">
                                                View Report <ChevronRight className="ml-1 h-4 w-4" />
                                            </span>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
