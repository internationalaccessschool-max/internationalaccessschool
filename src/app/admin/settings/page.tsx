"use client";

import toast from "react-hot-toast";
import { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Save, Loader2, Globe, Share2, Mail, Phone, MapPin, Facebook, Twitter, Instagram, Youtube, Banknote, MessageCircle, QrCode } from "lucide-react";

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
    /** Online fee payment — shown to parents on the student "My Fees" page. */
    payment: {
        upiId: string;
        payeeName: string;
        whatsapp: string;   // digits with country code, e.g. 919347776670
        note: string;
    };
}

const DEFAULT_SETTINGS: GlobalSettings = {
    contact: {
        email: "info@iaschool.edu.in",
        phone: "+91 84060 00830",
        address: "Atarsua, Siwan, Bihar, India, 841227",
        adminEmail: "internationalaccessschool@gmail.com"
    },
    social: {
        facebook: "https://facebook.com",
        twitter: "https://twitter.com",
        instagram: "https://instagram.com",
        youtube: "https://youtube.com"
    },
    payment: {
        upiId: "INTERNATIONALACCESS974@icici",
        payeeName: "International Access School",
        whatsapp: "",
        note: "Payment ke baad screenshot ya UTR number WhatsApp par bhejein taki status jaldi update ho sake."
    }
};

type TabNode = "contact" | "social" | "payment";

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
                    // Merge over the defaults — a doc saved before a section existed
                    // would otherwise leave that section undefined and crash the form.
                    const saved = docSnap.data() as Partial<GlobalSettings>;
                    setSettings({
                        contact: { ...DEFAULT_SETTINGS.contact, ...(saved.contact || {}) },
                        social: { ...DEFAULT_SETTINGS.social, ...(saved.social || {}) },
                        payment: { ...DEFAULT_SETTINGS.payment, ...(saved.payment || {}) },
                    });
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

    const handleChange = (section: TabNode, field: string, value: string) => {
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
            toast.success("Settings saved successfully!");
        } catch (error) {
            console.error("Error saving settings:", error);
            toast.error("Failed to save settings.");
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
                    <button
                        onClick={() => setActiveTab("payment")}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === "payment" ? "bg-navy text-white shadow-md" : "text-gray-600 hover:bg-gray-100"}`}
                    >
                        <Banknote className="w-4 h-4 opacity-70" />
                        Fee Payment
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

                    {activeTab === "payment" && (
                        <div className="space-y-6">
                            <div className="border-b border-gray-100 pb-4">
                                <h2 className="text-lg font-bold text-navy">Online Fee Payment</h2>
                                <p className="text-xs text-gray-500 mt-1">
                                    Ye details parents ko student portal ke <strong>My Fees</strong> page par dikhengi —
                                    UPI ID, uska QR code, aur payment proof bhejne ka WhatsApp number.
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-1.5">
                                        <QrCode className="w-4 h-4 text-gray-400" /> UPI ID
                                    </label>
                                    <p className="text-xs text-gray-500 mb-2">
                                        QR code isi se automatically banta hai — ID badlo, QR khud badal jayega. Khali chhodne par
                                        parents ko online payment ka option nahi dikhega.
                                    </p>
                                    <input
                                        type="text"
                                        value={settings.payment.upiId}
                                        onChange={(e) => handleChange("payment", "upiId", e.target.value.trim())}
                                        placeholder="school@bank"
                                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-navy/10 focus:border-navy transition-all font-mono"
                                    />
                                    {settings.payment.upiId && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(settings.payment.upiId) && (
                                        <p className="text-xs text-amber-600 mt-1.5">
                                            ⚠️ Ye UPI ID jaisi nahi lag rahi. Format hona chahiye: <code>name@bank</code>
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-1.5">
                                        <Banknote className="w-4 h-4 text-gray-400" /> Payee Name
                                    </label>
                                    <p className="text-xs text-gray-500 mb-2">Parent ke UPI app me yahi naam dikhega.</p>
                                    <input
                                        type="text"
                                        value={settings.payment.payeeName}
                                        onChange={(e) => handleChange("payment", "payeeName", e.target.value)}
                                        placeholder="International Access School"
                                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-navy/10 focus:border-navy transition-all"
                                    />
                                </div>

                                <div className="pt-4 border-t border-gray-100">
                                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-1.5">
                                        <MessageCircle className="w-4 h-4 text-[#25D366]" /> WhatsApp Number (payment proof)
                                    </label>
                                    <p className="text-xs text-gray-500 mb-2">
                                        Country code ke saath, bina + ya space ke — jaise <code>919347776670</code>.
                                        Parents isi number par screenshot / UTR bhejenge.
                                    </p>
                                    <input
                                        type="tel"
                                        inputMode="numeric"
                                        value={settings.payment.whatsapp}
                                        onChange={(e) => handleChange("payment", "whatsapp", e.target.value.replace(/\D/g, ""))}
                                        placeholder="919347776670"
                                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-navy/10 focus:border-navy transition-all font-mono"
                                    />
                                    {settings.payment.whatsapp && settings.payment.whatsapp.length < 11 && (
                                        <p className="text-xs text-amber-600 mt-1.5">
                                            ⚠️ Country code lagana mat bhoolna — India ke liye <code>91</code> se shuru karo.
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-1.5">
                                        <Mail className="w-4 h-4 text-gray-400" /> Instruction Note (optional)
                                    </label>
                                    <textarea
                                        rows={3}
                                        value={settings.payment.note}
                                        onChange={(e) => handleChange("payment", "note", e.target.value)}
                                        placeholder="Parents ko kya karna hai — chhota sa message"
                                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-navy/10 focus:border-navy transition-all resize-none"
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
