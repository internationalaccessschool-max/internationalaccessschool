"use client";

import {
    DollarSign, UserPlus, FileText, BarChart3,
    ArrowUpRight, ArrowDownRight, CreditCard
} from "lucide-react";

const stats = [
    {
        title: "Total Revenue",
        value: "₹18.5L",
        change: "+12%",
        desc: "This month",
        icon: DollarSign,
        iconBg: "bg-emerald-100",
        iconColor: "text-emerald-600",
    },
    {
        title: "Pending Dues",
        value: "₹2.4L",
        change: "-5%",
        desc: "Outstanding",
        icon: AlertCircle,
        iconBg: "bg-rose-100",
        iconColor: "text-rose-600",
    },
    {
        title: "New Admissions",
        value: "45",
        change: "+8",
        desc: "Fees processed",
        icon: UserPlus,
        iconBg: "bg-blue-100",
        iconColor: "text-blue-600",
    },
];

const transactions = [
    { id: "INV-001", student: "Rahul Verma", class: "10-A", amount: "₹15,000", date: "Today, 10:30 AM", status: "Paid" },
    { id: "INV-002", student: "Priya Singh", class: "9-B", amount: "₹15,000", date: "Yesterday, 02:15 PM", status: "Paid" },
    { id: "INV-003", student: "Amit Kumar", class: "11-C", amount: "₹18,000", date: "2 days ago", status: "Pending" },
];

import { AlertCircle } from "lucide-react";

export default function AccountantDashboard() {
    return (
        <div className="space-y-6">
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{
                        backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)`
                    }}
                />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Finance Portal</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">
                        Financial Overview
                    </h1>
                    <p className="text-white/40 text-sm mt-2">
                        Manage fees, track expenses, and generate reports.
                    </p>
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {stats.map((stat, i) => (
                    <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 group hover:shadow-md transition-all">
                        <div className="flex items-center justify-between mb-4">
                            <div className={`w-10 h-10 rounded-xl ${stat.iconBg} flex items-center justify-center`}>
                                <stat.icon className={`w-5 h-5 ${stat.iconColor}`} />
                            </div>
                            <span className={`text-xs font-medium px-2 py-1 rounded-full ${stat.change.startsWith('+') ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{stat.change}</span>
                        </div>
                        <div className="text-2xl font-bold text-navy">{stat.value}</div>
                        <div className="text-xs text-gray-400 mt-1">{stat.title} — {stat.desc}</div>
                    </div>
                ))}
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="font-bold text-navy text-lg">Recent Transactions</h2>
                        <button className="text-xs font-medium text-gold hover:text-gold-light transition-colors">View All</button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-400 uppercase bg-gray-50/50">
                                <tr>
                                    <th className="px-4 py-3 rounded-l-lg">Invoice ID</th>
                                    <th className="px-4 py-3">Student</th>
                                    <th className="px-4 py-3">Amount</th>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3 rounded-r-lg">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transactions.map((t, i) => (
                                    <tr key={i} className="border-b border-gray-100 last:border-0 hover:bg-off-white transition-colors">
                                        <td className="px-4 py-3 font-medium text-navy">{t.id}</td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-navy">{t.student}</div>
                                            <div className="text-xs text-gray-400">{t.class}</div>
                                        </td>
                                        <td className="px-4 py-3 font-bold text-navy">{t.amount}</td>
                                        <td className="px-4 py-3 text-gray-500">{t.date}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${t.status === 'Paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                                {t.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <h2 className="font-bold text-navy text-lg mb-6">Quick Actions</h2>
                    <div className="space-y-3">
                        {[
                            { label: "Generate Invoice", icon: FileText },
                            { label: "Record Payment", icon: CreditCard },
                            { label: "Expense Entry", icon: ArrowDownRight },
                            { label: "Financial Reports", icon: BarChart3 }
                        ].map((action, i) => (
                            <button key={i} className="w-full flex items-center gap-3 p-4 rounded-xl bg-off-white hover:bg-navy hover:text-white transition-all group">
                                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center group-hover:bg-white/10 shrink-0">
                                    <action.icon className="w-5 h-5 text-navy group-hover:text-white" />
                                </div>
                                <span className="font-medium text-sm text-left">{action.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
