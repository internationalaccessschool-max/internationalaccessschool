"use client";

import { useState } from "react";
import { collectionGroup, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Search, FileText, Download, AlertCircle, GraduationCap, Loader2 } from "lucide-react";

interface TCStudent {
    admissionNumber: string;
    firstName?: string;
    lastName?: string;
    dob?: string;
    lastClass?: string;
    leftYear?: string;
    lastDate?: string;
    tcUrl: string;
    fatherName?: string;
    branch?: string;
}

export default function TCLookupPage() {
    const [admissionNo, setAdmissionNo] = useState("");
    const [studentName, setStudentName] = useState("");
    const [dob, setDob] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [result, setResult] = useState<TCStudent | null>(null);
    const [notFound, setNotFound] = useState(false);
    const [searched, setSearched] = useState(false);

    const handleSearch = async () => {
        const filledCount = [admissionNo.trim(), studentName.trim(), dob.trim()].filter(Boolean).length;
        if (filledCount < 2) {
            alert("Please fill in at least 2 of the 3 fields to search.");
            return;
        }
        setIsSearching(true);
        setResult(null);
        setNotFound(false);
        setSearched(true);

        try {
            const snap = await getDocs(collectionGroup(db, "profiles"));
            const nameLower = studentName.trim().toLowerCase();

            const match = snap.docs.find(d => {
                const data = d.data();
                const docAdmNo = (data.admissionNumber || "").toString().trim().toLowerCase();
                const docFirst = (data.firstName || "").toLowerCase();
                const docLast = (data.lastName || "").toLowerCase();
                const docFullName = `${docFirst} ${docLast}`.trim();
                const docDob = (data.dob || "").trim();
                const docStatus = (data.status || "").toUpperCase();
                const hasTc = !!data.tcUrl;

                if (docStatus !== "LEFT" || !hasTc) return false;

                // Check only the fields that were filled in — at least 2 must match
                let matchCount = 0;
                if (admissionNo.trim()) {
                    if (docAdmNo === admissionNo.trim().toLowerCase()) matchCount++;
                    else return false; // if provided, must match
                }
                if (studentName.trim()) {
                    const nameLower = studentName.trim().toLowerCase();
                    if (docFullName.includes(nameLower) || docFirst.includes(nameLower) || docLast.includes(nameLower)) matchCount++;
                    else return false;
                }
                if (dob.trim()) {
                    if (docDob === dob.trim()) matchCount++;
                    else return false;
                }

                return matchCount >= 2;
            });

            if (match) {
                const data = match.data();
                setResult({
                    admissionNumber: data.admissionNumber,
                    firstName: data.firstName,
                    lastName: data.lastName,
                    dob: data.dob,
                    lastClass: data.lastClass,
                    leftYear: data.leftYear,
                    lastDate: data.lastDate,
                    tcUrl: data.tcUrl,
                    fatherName: data.fatherName,
                    branch: data.branch,
                });
            } else {
                setNotFound(true);
            }
        } catch (err) {
            console.error("TC search error:", err);
            setNotFound(true);
        } finally {
            setIsSearching(false);
        }
    };

    const isPdf = result?.tcUrl?.toLowerCase().includes(".pdf") ||
        result?.tcUrl?.toLowerCase().includes("/raw/");

    return (
        <div className="flex flex-col min-h-screen bg-off-white">
            <Navbar />
            <main className="flex-1 py-16 px-4">
                <div className="max-w-2xl mx-auto">
                    {/* Header */}
                    <div className="text-center mb-10">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-navy/10 mb-4">
                            <GraduationCap className="w-8 h-8 text-navy" />
                        </div>
                        <h1 className="text-3xl font-bold text-navy">Transfer Certificate</h1>
                        <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                            Enter any <strong>2 out of 3</strong> fields below to retrieve the Transfer Certificate.
                            All provided details must exactly match school records.
                        </p>
                    </div>

                    {/* Search Card */}
                    <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-slate-200/60 p-8 space-y-5">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                Admission / Enrollment Number
                                <span className="text-[9px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full font-normal normal-case">optional if 2 others filled</span>
                            </label>
                            <input
                                value={admissionNo}
                                onChange={e => setAdmissionNo(e.target.value)}
                                placeholder="e.g. IAS-2023-001"
                                className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:border-navy focus:ring-4 focus:ring-navy/5 font-mono transition-all"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                Student's Full Name
                                <span className="text-[9px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full font-normal normal-case">optional if 2 others filled</span>
                            </label>
                            <input
                                value={studentName}
                                onChange={e => setStudentName(e.target.value)}
                                placeholder="Enter first and last name"
                                className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:border-navy focus:ring-4 focus:ring-navy/5 transition-all"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                Date of Birth
                                <span className="text-[9px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full font-normal normal-case">optional if 2 others filled</span>
                            </label>
                            <input
                                type="date"
                                value={dob}
                                onChange={e => setDob(e.target.value)}
                                className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:border-navy focus:ring-4 focus:ring-navy/5 transition-all"
                            />
                        </div>
                        <button
                            onClick={handleSearch}
                            disabled={isSearching}
                            className="w-full py-3.5 rounded-2xl bg-navy text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-navy/90 transition-all disabled:opacity-60 shadow-sm"
                        >
                            {isSearching
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Searching...</>
                                : <><Search className="w-4 h-4" /> Find Transfer Certificate</>
                            }
                        </button>
                    </div>

                    {/* Not Found */}
                    {searched && notFound && (
                        <div className="mt-6 p-5 rounded-2xl bg-red-50 border border-red-100 flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-semibold text-red-800 text-sm">No Transfer Certificate Found</p>
                                <p className="text-red-600 text-xs mt-1">
                                    Please check the details entered. The provided fields must exactly match school records.
                                    If the issue persists, contact the school office.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Found */}
                    {result && (
                        <div className="mt-6 space-y-4">
                            {/* Student Info Card */}
                            <div className="bg-white rounded-3xl border border-slate-200/60 shadow-[0_4px_20px_rgb(0,0,0,0.04)] p-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center">
                                        <GraduationCap className="w-6 h-6 text-emerald-600" />
                                    </div>
                                    <div>
                                        <h2 className="font-bold text-navy text-lg">
                                            {result.firstName} {result.lastName}
                                        </h2>
                                        <p className="text-sm text-slate-500 font-mono">{result.admissionNumber}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    {result.fatherName && (
                                        <div className="bg-slate-50 rounded-xl p-3">
                                            <p className="text-xs text-slate-400 font-semibold mb-0.5">Father's Name</p>
                                            <p className="font-semibold text-slate-800">{result.fatherName}</p>
                                        </div>
                                    )}
                                    {result.lastClass && (
                                        <div className="bg-slate-50 rounded-xl p-3">
                                            <p className="text-xs text-slate-400 font-semibold mb-0.5">Last Class</p>
                                            <p className="font-semibold text-slate-800">Class {result.lastClass}</p>
                                        </div>
                                    )}
                                    {result.leftYear && (
                                        <div className="bg-slate-50 rounded-xl p-3">
                                            <p className="text-xs text-slate-400 font-semibold mb-0.5">Left Year</p>
                                            <p className="font-semibold text-slate-800">{result.leftYear}</p>
                                        </div>
                                    )}
                                    {result.lastDate && (
                                        <div className="bg-slate-50 rounded-xl p-3">
                                            <p className="text-xs text-slate-400 font-semibold mb-0.5">Last Date</p>
                                            <p className="font-semibold text-slate-800">{result.lastDate}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* TC Viewer */}
                            <div className="bg-white rounded-3xl border border-slate-200/60 shadow-[0_4px_20px_rgb(0,0,0,0.04)] overflow-hidden">
                                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <FileText className="w-5 h-5 text-navy" />
                                        <span className="font-bold text-navy">Transfer Certificate</span>
                                    </div>
                                    <a
                                        href={result.tcUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        download
                                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-navy text-white text-xs font-semibold hover:bg-navy/90 transition-all"
                                    >
                                        <Download className="w-3.5 h-3.5" /> Download
                                    </a>
                                </div>
                                <div className="p-4">
                                    {isPdf ? (
                                        <iframe
                                            src={result.tcUrl}
                                            className="w-full rounded-2xl border border-slate-100"
                                            style={{ height: "600px" }}
                                            title="Transfer Certificate"
                                        />
                                    ) : (
                                        <img
                                            src={result.tcUrl}
                                            alt="Transfer Certificate"
                                            className="w-full rounded-2xl border border-slate-100 object-contain max-h-[600px]"
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
            <Footer />
        </div>
    );
}
