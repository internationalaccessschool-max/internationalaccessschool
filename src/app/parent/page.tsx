"use client";

import {
    Activity, GraduationCap, Clock, AlertCircle,
    User, Calendar, CreditCard, ChevronRight
} from "lucide-react";

const children = [
    { name: "Arjun Rao", class: "Class 5-B", roll: "12", avatar: "bg-blue-100 text-blue-600" },
    // { name: "Riya Rao", class: "Class 2-A", roll: "05", avatar: "bg-rose-100 text-rose-600" } (Example for multiple kids)
];

const stats = [
    {
        title: "Attendance",
        value: "92%",
        change: "Good",
        desc: "This month",
        icon: Clock,
        iconBg: "bg-emerald-100",
        iconColor: "text-emerald-600",
    },
    {
        title: "Fee Status",
        value: "Paid",
        change: "Due: ₹0",
        desc: "Term 1 Cleared",
        icon: CreditCard,
        iconBg: "bg-blue-100",
        iconColor: "text-blue-600",
    },
    {
        title: "Last Grade",
        value: "A-",
        change: "+2%",
        desc: "Mathematics Test",
        icon: Activity,
        iconBg: "bg-amber-100",
        iconColor: "text-amber-600",
    },
];

const updates = [
    { title: "Parent-Teacher Meeting", date: "Saturday, 10:00 AM", type: "Event", icon: Calendar, color: "text-purple-500" },
    { title: "English Assignment Due", date: "Tomorrow", type: "Academic", icon: AlertCircle, color: "text-rose-500" },
    { title: "School Trip Consent Form", date: "Due by Friday", type: "Admin", icon: FileText, color: "text-amber-500" },
];

import { FileText } from "lucide-react";

export default function ParentDashboard() {
    return (
        <div className="space-y-6">
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{
                        backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)`
                    }}
                />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <p className="text-white/50 text-sm font-medium">Parent Portal</p>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">
                            Hello, Mr. Rao
                        </h1>
                        <p className="text-white/40 text-sm mt-2">
                            Viewing updates for: <span className="text-gold font-bold">Arjun Rao</span>
                        </p>
                    </div>

                    <div className="flex bg-white/10 backdrop-blur-sm p-1 rounded-xl">
                        {children.map((child, i) => (
                            <button key={i} className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${i === 0 ? 'bg-gold text-navy font-bold shadow-lg' : 'text-white/70 hover:bg-white/5'}`}>
                                <User className="w-4 h-4" />
                                {child.name}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {stats.map((stat, i) => (
                    <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 group hover:shadow-md transition-all">
                        <div className="flex items-center justify-between mb-4">
                            <div className={`w-10 h-10 rounded-xl ${stat.iconBg} flex items-center justify-center`}>
                                <stat.icon className={`w-5 h-5 ${stat.iconColor}`} />
                            </div>
                        </div>
                        <div className="text-2xl font-bold text-navy">{stat.value}</div>
                        <div className="text-xs text-gray-400 mt-1 flex justify-between">
                            <span>{stat.title}</span>
                            <span className="font-medium text-emerald-600">{stat.change}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="font-bold text-navy text-lg">Upcoming Events & Tasks</h2>
                        <Calendar className="w-5 h-5 text-gray-400" />
                    </div>
                    <div className="space-y-4">
                        {updates.map((item, i) => (
                            <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-gray-50 hover:border-gold/30 hover:shadow-sm transition-all group">
                                <div className="w-10 h-10 rounded-full bg-off-white flex items-center justify-center shrink-0 group-hover:bg-gold/10 transition-colors">
                                    <item.icon className={`w-5 h-5 ${item.color}`} />
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-bold text-navy">{item.title}</p>
                                    <p className="text-xs text-gray-500 mt-1">{item.date}</p>
                                </div>
                                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gold transition-colors" />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <h2 className="font-bold text-navy text-lg mb-6">Quick Actions</h2>
                    <div className="grid grid-cols-2 gap-4">
                        {[
                            { label: "Pay Fees Online", icon: CreditCard, color: "text-emerald-600", bg: "bg-emerald-50" },
                            { label: "View Report Card", icon: GraduationCap, color: "text-blue-600", bg: "bg-blue-50" },
                            { label: "Contact Teacher", icon: User, color: "text-amber-600", bg: "bg-amber-50" },
                            { label: "Transport Details", icon: Activity, color: "text-purple-600", bg: "bg-purple-50" },
                        ].map((action, i) => (
                            <button key={i} className="flex flex-col items-center gap-3 p-6 rounded-xl border border-gray-100 hover:border-gold/50 hover:shadow-md transition-all group">
                                <div className={`w-12 h-12 rounded-full ${action.bg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                                    <action.icon className={`w-6 h-6 ${action.color}`} />
                                </div>
                                <span className="font-semibold text-navy text-sm">{action.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
