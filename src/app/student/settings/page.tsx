"use client";

import { Bell, Lock, Palette, Save, Shield, User } from "lucide-react";
import { useState } from "react";

const sections = [
    { id: "profile", label: "Profile", icon: User },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "security", label: "Security", icon: Lock },
    { id: "privacy", label: "Privacy", icon: Shield },
    { id: "appearance", label: "Appearance", icon: Palette },
];

export default function StudentSettingsPage() {
    const [active, setActive] = useState("profile");
    const [saved, setSaved] = useState(false);

    const handleSave = () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div
                    className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }}
                />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Student Portal</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Settings</h1>
                    <p className="text-white/40 text-sm mt-2">Manage your account preferences and settings.</p>
                </div>
            </div>

            <div className="grid md:grid-cols-4 gap-6">
                {/* Settings Nav */}
                <div className="md:col-span-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-3 h-fit">
                    <nav className="space-y-0.5">
                        {sections.map((s) => (
                            <button
                                key={s.id}
                                onClick={() => setActive(s.id)}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${active === s.id
                                        ? "bg-navy text-white"
                                        : "text-gray-500 hover:bg-gray-50 hover:text-navy"
                                    }`}
                            >
                                <s.icon className={`w-4 h-4 ${active === s.id ? "text-gold" : "text-gray-400"}`} />
                                {s.label}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Settings Panel */}
                <div className="md:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    {active === "profile" && (
                        <div className="space-y-6">
                            <h2 className="font-bold text-navy text-lg">Profile Information</h2>
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 rounded-2xl bg-navy/10 flex items-center justify-center">
                                    <User className="w-7 h-7 text-navy/40" />
                                </div>
                                <button className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-navy hover:bg-gray-50 transition-colors">
                                    Change Photo
                                </button>
                            </div>
                            <div className="grid sm:grid-cols-2 gap-4">
                                {[
                                    { label: "First Name", placeholder: "Enter first name" },
                                    { label: "Last Name", placeholder: "Enter last name" },
                                    { label: "Email", placeholder: "Enter email" },
                                    { label: "Phone", placeholder: "Enter phone number" },
                                ].map((f) => (
                                    <div key={f.label}>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">{f.label}</label>
                                        <input
                                            type="text"
                                            placeholder={f.placeholder}
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-navy focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/10 transition-all"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {active === "notifications" && (
                        <div className="space-y-6">
                            <h2 className="font-bold text-navy text-lg">Notification Preferences</h2>
                            <div className="space-y-4">
                                {[
                                    { label: "Assignment Due Reminders", desc: "Get notified before assignments are due" },
                                    { label: "Exam Alerts", desc: "Receive alerts about upcoming exams" },
                                    { label: "Attendance Updates", desc: "Be informed of attendance records" },
                                    { label: "Grade Published", desc: "Know when new marks are posted" },
                                    { label: "School Notices", desc: "Receive general school announcements" },
                                ].map((item) => (
                                    <div key={item.label} className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
                                        <div>
                                            <div className="text-sm font-semibold text-navy">{item.label}</div>
                                            <div className="text-xs text-gray-400 mt-0.5">{item.desc}</div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" defaultChecked className="sr-only peer" />
                                            <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-navy after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
                                        </label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {active === "security" && (
                        <div className="space-y-6">
                            <h2 className="font-bold text-navy text-lg">Security Settings</h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Current Password</label>
                                    <input type="password" placeholder="Enter current password" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/10" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">New Password</label>
                                    <input type="password" placeholder="Enter new password" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/10" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Confirm New Password</label>
                                    <input type="password" placeholder="Confirm new password" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/10" />
                                </div>
                            </div>
                        </div>
                    )}

                    {(active === "privacy" || active === "appearance") && (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
                                {active === "privacy" ? <Shield className="w-7 h-7 text-gray-300" /> : <Palette className="w-7 h-7 text-gray-300" />}
                            </div>
                            <p className="text-sm font-semibold text-gray-400">Coming Soon</p>
                            <p className="text-xs text-gray-300 mt-1">{active === "privacy" ? "Privacy" : "Appearance"} settings will be available soon.</p>
                        </div>
                    )}

                    {/* Save Button */}
                    <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end">
                        <button
                            onClick={handleSave}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${saved
                                    ? "bg-emerald-500 text-white"
                                    : "bg-navy text-white hover:bg-navy/90"
                                }`}
                        >
                            <Save className="w-4 h-4" />
                            {saved ? "Saved!" : "Save Changes"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
