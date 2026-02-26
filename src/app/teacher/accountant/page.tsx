"use client";

import { useState } from "react";
import {
    FileText, Search, Filter, Download,
    TrendingUp, AlertCircle, CheckCircle2, DollarSign
} from "lucide-react";

const stats = [
    {
        title: "Total Collections",
        value: "₹45,23,189",
        change: "+20.1%",
        desc: "This month",
        icon: DollarSign,
        iconBg: "bg-emerald-100",
        iconColor: "text-emerald-600",
    },
    {
        title: "Pending Payments",
        value: "₹12,23,400",
        change: "45 Students",
        desc: "Due > 30 days",
        icon: AlertCircle,
        iconBg: "bg-amber-100",
        iconColor: "text-amber-600",
    },
    {
        title: "Overdue",
        value: "₹3,40,000",
        change: "12 Students",
        desc: "Due > 90 days",
        icon: FileText,
        iconBg: "bg-rose-100",
        iconColor: "text-rose-600",
    },
];

const mockFees = [
    { id: "1", student: "Emily Davis", class: "10-A", amount: 15000, status: "Paid", date: "2024-01-15" },
    { id: "2", student: "Michael Wilson", class: "9-B", amount: 20000, status: "Pending", date: "2024-01-10" },
    { id: "3", student: "Sarah Connor", class: "10-B", amount: 15000, status: "Overdue", date: "2023-12-15" },
    { id: "4", student: "Rahul Verma", class: "8-A", amount: 18000, status: "Paid", date: "2024-01-14" },
    { id: "5", student: "Priya Singh", class: "7-C", amount: 15000, status: "Paid", date: "2024-01-12" },
];

export default function AccountantDashboard() {
    const [searchTerm, setSearchTerm] = useState("");

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-navy">Accountant Dashboard</h1>
                    <p className="text-gray-500 text-sm">Manage fees, generate reports, and track collections.</p>
                </div>
                <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-navy text-white font-medium text-sm hover:bg-navy-light transition-colors shadow-sm">
                    <Download className="w-4 h-4" />
                    Export Report
                </button>
            </div>

            {/* Stats */}
            <div className="grid gap-4 sm:grid-cols-3">
                {stats.map((stat) => (
                    <div key={stat.title} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 card-hover">
                        <div className="flex items-start justify-between mb-4">
                            <div className={`w-10 h-10 rounded-xl ${stat.iconBg} flex items-center justify-center`}>
                                <stat.icon className={`w-5 h-5 ${stat.iconColor}`} />
                            </div>
                            <span className="text-xs font-medium bg-gray-50 px-2 py-1 rounded-full text-gray-500">
                                {stat.change}
                            </span>
                        </div>
                        <div className="text-2xl font-bold text-navy">{stat.value}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{stat.title} — {stat.desc}</div>
                    </div>
                ))}
            </div>

            {/* Fee Records Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h2 className="font-bold text-navy text-lg">Fee Records</h2>
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search student..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold transition-all"
                        />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-medium">
                            <tr>
                                <th className="px-5 py-3">Student</th>
                                <th className="px-5 py-3">Class</th>
                                <th className="px-5 py-3">Amount</th>
                                <th className="px-5 py-3">Status</th>
                                <th className="px-5 py-3">Date</th>
                                <th className="px-5 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {mockFees.map((record) => (
                                <tr key={record.id} className="hover:bg-off-white transition-colors">
                                    <td className="px-5 py-3 font-medium text-navy">{record.student}</td>
                                    <td className="px-5 py-3 text-gray-500">{record.class}</td>
                                    <td className="px-5 py-3 text-navy font-medium">₹{record.amount.toLocaleString()}</td>
                                    <td className="px-5 py-3">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border
                                            ${record.status === "Paid" ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                                                record.status === "Pending" ? "bg-amber-50 text-amber-700 border-amber-100" :
                                                    "bg-rose-50 text-rose-700 border-rose-100"}`}>
                                            {record.status === "Paid" && <CheckCircle2 className="w-3 h-3" />}
                                            {record.status}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-gray-500">{record.date}</td>
                                    <td className="px-5 py-3 text-right">
                                        <button className="text-xs font-medium text-navy hover:text-gold transition-colors">
                                            View Details
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="p-4 border-t border-gray-100 text-center">
                    <button className="text-sm font-medium text-navy hover:text-gold transition-colors">
                        View All Records
                    </button>
                </div>
            </div>
        </div>
    );
}
