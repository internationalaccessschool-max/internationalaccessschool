"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { BarChart3, TrendingUp, AlertCircle, CheckCircle2, Users, Loader2 } from "lucide-react";

interface FeeRecord {
    id: string;
    studentName: string;
    class: string;
    amount: number;
    status: "pending" | "paid" | "overdue";
    month: number;
    year: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function AdminFeeDashboard() {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    const [records, setRecords] = useState<FeeRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterMonth, setFilterMonth] = useState(currentMonth);
    const [filterYear, setFilterYear] = useState(currentYear);
    const [monthlyData, setMonthlyData] = useState<{ month: string, year: number, value: number }[]>([]);

    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            try {
                const q = query(
                    collection(db, "feeRecords"),
                    where("month", "==", filterMonth),
                    where("year", "==", filterYear),
                );
                const snap = await getDocs(q);
                setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() } as FeeRecord)));

                // Fetch monthly trend (last 6 months)
                const last6Queries = await Promise.all(
                    Array.from({ length: 6 }, (_, i) => {
                        const d = new Date(filterYear, filterMonth - 1 - i, 1);
                        return getDocs(query(
                            collection(db, "feeRecords"),
                            where("month", "==", d.getMonth() + 1),
                            where("year", "==", d.getFullYear()),
                            where("status", "==", "paid")
                        ));
                    })
                );

                const mData = last6Queries.map((qSnap, i) => {
                    const d = new Date(filterYear, filterMonth - 1 - i, 1);
                    const total = qSnap.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
                    return { month: MONTHS[d.getMonth()], year: d.getFullYear(), value: total };
                }).reverse();
                setMonthlyData(mData);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [filterMonth, filterYear]);

    const totalCollected = records.filter(r => r.status === "paid").reduce((s, r) => s + r.amount, 0);
    const totalPending = records.filter(r => r.status !== "paid").reduce((s, r) => s + r.amount, 0);
    const totalExpected = records.reduce((s, r) => s + r.amount, 0);
    const collectionRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;

    // Class-wise stats
    const classMap: Record<string, { paid: number; pending: number; overdue: number; total: number; amount: number }> = {};
    records.forEach(r => {
        const cls = `Class ${r.class}`;
        if (!classMap[cls]) classMap[cls] = { paid: 0, pending: 0, overdue: 0, total: 0, amount: 0 };
        classMap[cls].total++;
        classMap[cls].amount += r.amount;
        if (r.status === "paid") classMap[cls].paid++;
        else if (r.status === "overdue") classMap[cls].overdue++;
        else classMap[cls].pending++;
    });
    const classStats = Object.entries(classMap).sort((a, b) => a[0].localeCompare(b[0]));

    // Top defaulters
    const defaulters = records
        .filter(r => r.status !== "paid")
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);

    const maxVal = monthlyData.length > 0 ? Math.max(...monthlyData.map(m => m.value)) : 0;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gold/20 flex items-center justify-center">
                        <BarChart3 className="w-6 h-6 text-gold" />
                    </div>
                    <div>
                        <p className="text-white/50 text-sm font-medium">Admin Panel</p>
                        <h1 className="text-2xl md:text-3xl font-bold text-white">Fee Analytics</h1>
                        <p className="text-white/40 text-sm mt-1">Overview of fee collection across all classes.</p>
                    </div>
                </div>
            </div>

            {/* Month/Year Filter */}
            <div className="flex gap-3">
                <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))}
                    className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-gold outline-none bg-white">
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
                    className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-gold outline-none bg-white">
                    {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-navy" />
                </div>
            ) : (
                <>
                    {/* Summary Stats */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            { label: "Total Collected", value: `₹${totalCollected.toLocaleString()}`, icon: CheckCircle2, bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
                            { label: "Pending / Overdue", value: `₹${totalPending.toLocaleString()}`, icon: AlertCircle, bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
                            { label: "Collection Rate", value: `${collectionRate}%`, icon: TrendingUp, bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
                            { label: "Total Students", value: records.length.toString(), icon: Users, bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200" },
                        ].map(s => (
                            <div key={s.label} className={`${s.bg} border ${s.border} rounded-2xl p-5`}>
                                <s.icon className={`w-5 h-5 ${s.text} mb-2`} />
                                <div className={`text-2xl font-bold ${s.text}`}>{s.value}</div>
                                <div className={`text-xs ${s.text} opacity-70 mt-0.5`}>{s.label}</div>
                            </div>
                        ))}
                    </div>

                    <div className="grid lg:grid-cols-2 gap-6">
                        {/* Class-wise Collection */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                            <h2 className="font-semibold text-navy mb-4">Class-wise Collection</h2>
                            {classStats.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-8">No data for this period</p>
                            ) : (
                                <div className="space-y-4">
                                    {classStats.map(([cls, data]) => {
                                        const rate = data.total > 0 ? Math.round((data.paid / data.total) * 100) : 0;
                                        return (
                                            <div key={cls}>
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <span className="text-sm font-medium text-navy">{cls}</span>
                                                    <div className="flex items-center gap-3 text-xs text-gray-500">
                                                        <span className="text-emerald-600 font-medium">{data.paid} paid</span>
                                                        <span className="text-amber-600">{data.pending} pending</span>
                                                        {data.overdue > 0 && <span className="text-rose-600">{data.overdue} overdue</span>}
                                                        <span className="font-bold text-navy">{rate}%</span>
                                                    </div>
                                                </div>
                                                <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-700"
                                                        style={{ width: `${rate}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Top Defaulters */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                            <h2 className="font-semibold text-navy mb-4">Top Defaulters</h2>
                            {defaulters.length === 0 ? (
                                <div className="text-center py-8">
                                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                                    <p className="text-sm text-gray-400">All fees collected! 🎉</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {defaulters.map((r, i) => (
                                        <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i < 3 ? "bg-rose-100 text-rose-600" : "bg-gray-100 text-gray-500"}`}>
                                                {i + 1}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-navy truncate">{r.studentName}</p>
                                                <p className="text-xs text-gray-400">Class {r.class}</p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-sm font-bold text-navy">₹{r.amount?.toLocaleString()}</p>
                                                <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${r.status === "overdue" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"}`}>
                                                    {r.status}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Projected vs Actual */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="font-semibold text-navy">Projected vs Actual — {MONTHS[filterMonth - 1]} {filterYear}</h2>
                        </div>
                        <div className="grid grid-cols-2 gap-6">
                            <div className="p-5 rounded-xl bg-gray-50 border border-gray-100">
                                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Projected Revenue</p>
                                <p className="text-3xl font-bold text-navy">₹{totalExpected.toLocaleString()}</p>
                                <p className="text-xs text-gray-400 mt-1">Based on fee structure × total students</p>
                            </div>
                            <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-100">
                                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-500 mb-2">Actual Collected</p>
                                <p className="text-3xl font-bold text-emerald-700">₹{totalCollected.toLocaleString()}</p>
                                <p className="text-xs text-emerald-500 mt-1">{collectionRate}% of projected revenue</p>
                            </div>
                        </div>
                        {/* Progress bar */}
                        <div className="mt-4">
                            <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                                <span>Collection Progress</span>
                                <span>{collectionRate}%</span>
                            </div>
                            <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-700"
                                    style={{ width: `${collectionRate}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
