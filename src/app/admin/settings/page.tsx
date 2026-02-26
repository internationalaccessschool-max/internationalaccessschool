"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Save, Loader2, Globe, Share2, Mail, Phone, MapPin, Facebook, Twitter, Instagram, Youtube } from "lucide-react";

interface GlobalSettings {
    contact: {
        email: string;
        phone: string;
        address: string;
        adminEmail: string;
    };
    social: {
        facebook: string;
        twitter: string;
        instagram: string;
        youtube: string;
    };
}

const DEFAULT_SETTINGS: GlobalSettings = {
    contact: {
        email: "info@iaschool.edu",
        phone: "+91 98765 43210",
        address: "123 Education Lane, Knowledge City, India",
        adminEmail: "internationalaccessschool@gmail.com"
    },
    social: {
        facebook: "https://facebook.com",
        twitter: "https://twitter.com",
        instagram: "https://instagram.com",
        youtube: "https://youtube.com"
    }
};

type TabNode = "contact" | "social";

export default function AdminSettingsPage() {
    const [settings, setSettings] = useState<GlobalSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<TabNode>("contact");

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const docRef = doc(db, "settings", "global");
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setSettings(docSnap.data() as GlobalSettings);
                } else {
                    // Create default if it doesn't exist
                    await setDoc(docRef, DEFAULT_SETTINGS);
                }
            } catch (error) {
                console.error("Error fetching settings:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchSettings();
    }, []);

    const handleChange = (section: "contact" | "social", field: string, value: string) => {
        setSettings(prev => ({
            ...prev,
            [section]: {
                ...prev[section],
                [field]: value
            }
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await setDoc(doc(db, "settings", "global"), settings);
            alert("Settings saved successfully!");
        } catch (error) {
            console.error("Error saving settings:", error);
            alert("Failed to save settings.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-navy" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-navy">Global Settings</h1>
                    <p className="text-gray-500 text-sm mt-1">Manage school contact details and social media links appearing across the site.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-navy text-white rounded-xl font-semibold hover:bg-navy/90 transition-all disabled:opacity-70"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? "Saving..." : "Save Changes"}
                </button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col md:flex-row">
                {/* Tabs Sidebar */}
                <div className="w-full md:w-64 bg-gray-50 border-r border-gray-100 p-4 space-y-2 shrink-0">
                    <button
                        onClick={() => setActiveTab("contact")}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === "contact" ? "bg-navy text-white shadow-md" : "text-gray-600 hover:bg-gray-100"}`}
                    >
                        <Globe className="w-4 h-4 opacity-70" />
                        Contact Info
                    </button>
                    <button
                        onClick={() => setActiveTab("social")}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === "social" ? "bg-navy text-white shadow-md" : "text-gray-600 hover:bg-gray-100"}`}
                    >
                        <Share2 className="w-4 h-4 opacity-70" />
                        Social Media
                    </button>
                </div>

                {/* Tab Content */}
                <div className="flex-1 p-6 md:p-8">
                    {activeTab === "contact" && (
                        <div className="space-y-6">
                            <h2 className="text-lg font-bold text-navy border-b border-gray-100 pb-4">Contact Information</h2>

                            <div className="space-y-4">
                                <div>
                                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-1.5"><Mail className="w-4 h-4 text-gray-400" /> Public Email (Footer)</label>
                                    <input
                                        type="email"
                                        value={settings.contact.email}
                                        onChange={(e) => handleChange("contact", "email", e.target.value)}
                                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-navy/10 focus:border-navy transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-1.5"><Phone className="w-4 h-4 text-gray-400" /> Phone Number</label>
                                    <input
                                        type="text"
                                        value={settings.contact.phone}
                                        onChange={(e) => handleChange("contact", "phone", e.target.value)}
                                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-navy/10 focus:border-navy transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-1.5"><MapPin className="w-4 h-4 text-gray-400" /> School Address</label>
                                    <textarea
                                        rows={3}
                                        value={settings.contact.address}
                                        onChange={(e) => handleChange("contact", "address", e.target.value)}
                                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-navy/10 focus:border-navy transition-all resize-none"
                                    />
                                </div>

                                <div className="pt-4 border-t border-gray-100">
                                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-1.5 text-red-600"><Mail className="w-4 h-4" /> Admin Notification Email</label>
                                    <p className="text-xs text-gray-500 mb-2">This email receives job applications and contact form submissions.</p>
                                    <input
                                        type="email"
                                        value={settings.contact.adminEmail}
                                        onChange={(e) => handleChange("contact", "adminEmail", e.target.value)}
                                        className="w-full px-4 py-2.5 rounded-xl border border-red-200 focus:outline-none focus:ring-2 focus:ring-red-500/10 focus:border-red-500 transition-all bg-red-50/50"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "social" && (
                        <div className="space-y-6">
                            <h2 className="text-lg font-bold text-navy border-b border-gray-100 pb-4">Social Media Links</h2>

                            <div className="space-y-4">
                                <div>
                                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-1.5"><Facebook className="w-4 h-4 text-[#1877F2]" /> Facebook URL</label>
                                    <input
                                        type="url"
                                        value={settings.social.facebook}
                                        onChange={(e) => handleChange("social", "facebook", e.target.value)}
                                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-navy/10 focus:border-navy transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-1.5"><Twitter className="w-4 h-4 text-[#1DA1F2]" /> Twitter URL</label>
                                    <input
                                        type="url"
                                        value={settings.social.twitter}
                                        onChange={(e) => handleChange("social", "twitter", e.target.value)}
                                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-navy/10 focus:border-navy transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-1.5"><Instagram className="w-4 h-4 text-[#E4405F]" /> Instagram URL</label>
                                    <input
                                        type="url"
                                        value={settings.social.instagram}
                                        onChange={(e) => handleChange("social", "instagram", e.target.value)}
                                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-navy/10 focus:border-navy transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-1.5"><Youtube className="w-4 h-4 text-[#FF0000]" /> YouTube URL</label>
                                    <input
                                        type="url"
                                        value={settings.social.youtube}
                                        onChange={(e) => handleChange("social", "youtube", e.target.value)}
                                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-navy/10 focus:border-navy transition-all"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
