"use client";

import { useEffect, useState } from "react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import {
    Heart, BookOpen, GraduationCap, Award, Palette, Code,
    FlaskConical, Globe, Music, Dumbbell, Receipt, Building2,
    BookText, Users, MessageCircle, Bus, Medal, Settings,
    FileText, Scale, UserCheck, Link as LinkIcon, Download, ExternalLink, ChevronRight
} from "lucide-react";
import { collection, query, orderBy, getDocs } from "firebase/firestore";
import { FileViewerTrigger } from "@/components/ui/file-viewer";
import { db } from "@/lib/firebase";

// Fallback static data if DB is empty
const STATIC_PROGRAMS = [
    {
        icon: Heart,
        title: "Preschool",
        grades: "Ages 3–5",
        desc: "Nurturing curiosity through play-based learning and creative exploration in a safe, caring environment.",
        subjects: "Creative Play, Early Literacy, Numeracy, Music & Art, Motor Skills",
        color: "from-pink-50 to-rose-50",
    },
    {
        icon: BookOpen,
        title: "Primary School",
        grades: "Grades 1–5",
        desc: "Building strong foundations in literacy, numeracy, and critical thinking through engaging, hands-on learning.",
        subjects: "English Language Arts, Mathematics, General Science, Social Studies, Arts & PE",
        color: "from-blue-50 to-indigo-50",
    },
    {
        icon: GraduationCap,
        title: "Secondary School",
        grades: "Grades 6–10",
        desc: "Transitioning to specialized subjects with a focus on analytical thinking and collaborative projects.",
        subjects: "Advanced Mathematics, Physics & Chemistry, History & Geography, Computer Science, Third Language",
        color: "from-emerald-50 to-teal-50",
    },
    {
        icon: Award,
        title: "Senior Secondary",
        grades: "Grades 11–12",
        desc: "Preparing future leaders with AP courses, career counseling, and university-readiness programs.",
        subjects: "Science / Commerce / Humanities, Advanced Placement (AP), Career Counseling, Leadership, Research Projects",
        color: "from-amber-50 to-orange-50",
    },
];

export default function AcademicsPage() {
    const [programs, setPrograms] = useState<any[]>([]);
    const [infos, setInfos] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch Programs
                const progSnap = await getDocs(query(collection(db, "academic_programs"), orderBy("createdAt", "asc")));
                if (!progSnap.empty) {
                    setPrograms(progSnap.docs.map(doc => doc.data()));
                } else {
                    setPrograms(STATIC_PROGRAMS); // Use fallback if empty
                }

                // Fetch Info/Downloads
                const infoSnap = await getDocs(query(collection(db, "academic_info"), orderBy("createdAt", "asc")));
                if (!infoSnap.empty) {
                    setInfos(infoSnap.docs.map(doc => doc.data()));
                } else {
                    // Fallback
                    setInfos([
                        { icon: Receipt, label: "Fee Structure", type: 'link', url: '', desc: "Download the complete fee structure for the current academic year." },
                        { icon: BookText, label: "Curriculum", type: 'link', url: '', desc: "Detailed breakdown of our academic curriculum and learning outcomes." },
                        { icon: Palette, label: "Co-curricular Activities", type: 'link', url: '', desc: "Discover the wide range of activities beyond the classroom." },
                        { icon: Users, label: "SMC Member Details", type: 'link', url: '', desc: "List of School Management Committee members." },
                        { icon: MessageCircle, label: "Grievance Officer", type: 'link', url: '', desc: "Contact details for the grievance redressal officer." },
                        { icon: Bus, label: "Transport Facility", type: 'link', url: '', desc: "Information about bus routes, safe transport policy, and charges." },
                        { icon: Medal, label: "Affiliation Information", type: 'link', url: '', desc: "Official affiliation certificates and status documents." },
                        { icon: GraduationCap, label: "Faculty Details", type: 'link', url: '', desc: "Meet our experienced and qualified teaching staff." },
                        { icon: Settings, label: "Academic System", type: 'link', url: '', desc: "Overview of our grading system, assessment patterns, and academic policies." },
                        { icon: FileText, label: "Admission Procedure", type: 'link', url: '', desc: "Step-by-step guide to the admission process and requirements." },
                        { icon: Scale, label: "Rules & Regulation's", type: 'link', url: '', desc: "Code of conduct and school policies for students and parents." },
                        { icon: UserCheck, label: "Student / Parents Corner", type: 'link', url: '', desc: "Quick links to student outcomes, parent portal, and resources." },
                    ]);
                }
            } catch (e) {
                console.error("Failed to fetch academics data", e);
                setPrograms(STATIC_PROGRAMS);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const getIconForTitle = (title: string) => {
        const t = title.toLowerCase();
        if (t.includes("preschool") || t.includes("kindergarten")) return Heart;
        if (t.includes("primary")) return BookOpen;
        if (t.includes("secondary")) return GraduationCap;
        if (t.includes("senior") || t.includes("high")) return Award;
        return BookOpen;
    };

    const getIconForInfo = (label: string) => {
        const l = label.toLowerCase();
        if (l.includes("fee")) return Receipt;
        if (l.includes("infra")) return Building2;
        if (l.includes("curriculum") || l.includes("book")) return BookText;
        if (l.includes("activity") || l.includes("art")) return Palette;
        if (l.includes("member") || l.includes("staff") || l.includes("faculty")) return Users;
        if (l.includes("grievance") || l.includes("contact")) return MessageCircle;
        if (l.includes("transport") || l.includes("bus")) return Bus;
        if (l.includes("affiliation") || l.includes("award")) return Medal;
        if (l.includes("admission") || l.includes("form")) return FileText;
        if (l.includes("rule") || l.includes("law")) return Scale;
        if (l.includes("parent") || l.includes("student")) return UserCheck;
        return FileText;
    };

    const getColor = (index: number) => {
        const colors = [
            "from-pink-50 to-rose-50",
            "from-blue-50 to-indigo-50",
            "from-emerald-50 to-teal-50",
            "from-amber-50 to-orange-50"
        ];
        return colors[index % colors.length];
    };

    return (
        <div className="flex flex-col min-h-screen">
            <Navbar />

            {/* Hero */}
            <section className="relative pt-[72px]">
                <div className="gradient-navy py-16 md:py-24">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                        <span className="text-sm font-semibold uppercase tracking-wider text-gold">Programs</span>
                        <h1 className="text-4xl md:text-5xl font-bold text-white mt-3">
                            Academic <span className="text-gold">Excellence</span>
                        </h1>
                        <p className="text-white/60 text-lg mt-4 max-w-xl mx-auto">
                            A comprehensive curriculum designed to challenge and inspire students at every stage.
                        </p>
                    </div>
                </div>
            </section>

            <main className="flex-1">
                {/* Programs Grid */}
                <section className="section-padding bg-white">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="space-y-8">
                            {programs.map((program, i) => {
                                const Icon = program.icon || getIconForTitle(program.title);
                                const color = program.color || getColor(i);
                                const subjectsList = typeof program.subjects === 'string'
                                    ? program.subjects.split(',')
                                    : (Array.isArray(program.subjects) ? program.subjects : []);

                                return (
                                    <div
                                        key={program.title || i}
                                        className={`rounded-2xl p-8 border border-gray-100 bg-gradient-to-r ${color}`}
                                    >
                                        <div className="flex flex-col md:flex-row md:items-start gap-6">
                                            <div className="w-14 h-14 rounded-2xl gradient-navy flex items-center justify-center shrink-0 shadow-md">
                                                <Icon className="w-7 h-7 text-white" />
                                            </div>
                                            <div className="flex-1 space-y-4">
                                                <div>
                                                    <div className="flex items-center gap-3 mb-1">
                                                        <h3 className="font-bold text-xl text-navy">{program.title}</h3>
                                                        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-gold/10 text-gold">
                                                            {program.grades}
                                                        </span>
                                                    </div>
                                                    <p className="text-gray-500 text-sm leading-relaxed max-w-2xl">
                                                        {program.desc}
                                                    </p>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {subjectsList.map((s: string, idx: number) => (
                                                        <span key={idx} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white/80 text-navy border border-gray-200">
                                                            {s.trim()}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </section>

                {/* Detailed Academic Sections */}
                <div className="bg-off-white">
                    {infos.map((item: any, idx: number) => {
                        const Icon = item.icon || getIconForInfo(item.label);
                        const slug = item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                        const isEven = idx % 2 === 0;

                        return (
                            <section
                                key={idx}
                                id={slug}
                                className={`py-16 md:py-24 border-t border-gray-200 scroll-mt-[72px] ${isEven ? 'bg-white' : 'bg-gray-50'}`}
                            >
                                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                                    <div className="flex flex-col md:flex-row gap-8 md:gap-16 items-start">
                                        {/* Icon/Sidebar Area */}
                                        <div className="w-full md:w-1/3 md:sticky md:top-28">
                                            <div className="w-16 h-16 rounded-2xl bg-navy/5 flex items-center justify-center mb-6 text-navy">
                                                {item.type === 'file' ? <FileText className="w-8 h-8" /> : (Icon ? <Icon className="w-8 h-8" /> : <LinkIcon className="w-8 h-8" />)}
                                            </div>
                                            <h2 className="text-3xl font-bold text-navy mb-4">{item.label}</h2>
                                            <div className="h-1 w-20 bg-gold rounded-full mb-6"></div>
                                        </div>

                                        {/* Content Area */}
                                        <div className="w-full md:w-2/3">
                                            <div className="prose prose-lg text-gray-600 mb-8 space-y-3">
                                                {(item.desc || "Information regarding this section is available in the downloadable document or link below.")
                                                    .split("\n")
                                                    .map((line: string, i: number) => {
                                                        // Section headings (all caps lines or lines ending with ":")
                                                        if (line.trim() === "") return <br key={i} />;
                                                        if (/^[A-Z][A-Z\s/]+$/.test(line.trim()) || line.trim().endsWith(":")) {
                                                            return <h4 key={i} className="font-bold text-navy text-base mt-4 mb-1">{line.trim()}</h4>;
                                                        }
                                                        // Bullet items starting with "- "
                                                        if (line.trim().startsWith("- ")) {
                                                            return (
                                                                <div key={i} className="flex items-start gap-2">
                                                                    <span className="text-gold font-bold mt-1 shrink-0">•</span>
                                                                    <span className="text-sm leading-relaxed">{line.trim().slice(2)}</span>
                                                                </div>
                                                            );
                                                        }
                                                        return <p key={i} className="leading-relaxed text-sm">{line}</p>;
                                                    })
                                                }
                                            </div>

                                            {/* Action Button */}
                                            {item.type === 'file' && item.url ? (
                                                <FileViewerTrigger
                                                    url={item.url}
                                                    fileName={`${item.label}.pdf`}
                                                    label="View / Download Document"
                                                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold bg-navy text-white hover:bg-navy-light shadow-md hover:shadow-lg transform hover:-translate-y-1 transition-all text-sm"
                                                />
                                            ) : item.type === 'link' && item.url ? (
                                                <a
                                                    href={item.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold bg-navy text-white hover:bg-navy-light shadow-md hover:shadow-lg transform hover:-translate-y-1 transition-all text-sm"
                                                >
                                                    <ExternalLink className="w-5 h-5" />
                                                    Visit Link
                                                </a>
                                            ) : item.type !== 'text' ? (
                                                <span className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold bg-gray-200 text-gray-400 cursor-not-allowed text-sm">
                                                    Coming Soon
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            </section>
                        );
                    })}
                </div>
            </main>

            <Footer />
        </div>
    );
}
