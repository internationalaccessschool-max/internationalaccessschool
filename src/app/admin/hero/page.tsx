"use client";

import { useState, useEffect } from "react";
import {
    collection, addDoc, deleteDoc, doc, onSnapshot,
    serverTimestamp, query, orderBy, updateDoc, writeBatch
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CloudinaryUploadWidget } from "@/components/ui/cloudinary-upload-widget";
import {
    Trash2, ChevronUp, ChevronDown, Plus, Save,
    ImageIcon, Eye, Pencil, X, CheckCircle2, Loader2
} from "lucide-react";
import Image from "next/image";

interface HeroSlide {
    id: string;
    imageUrl: string;
    title: string;
    subtitle: string;
    cta: string;
    ctaLink: string;
    order: number;
    createdAt: any;
}

const LINK_OPTIONS = [
    { label: "Admissions", value: "/admissions" },
    { label: "Academics", value: "/academics" },
    { label: "About Us", value: "/about" },
    { label: "Contact", value: "/contact" },
    { label: "Gallery", value: "/gallery" },
    { label: "Career", value: "/career" },
    { label: "Fees", value: "/fees" },
];

export default function HeroAdminPage() {
    const [slides, setSlides] = useState<HeroSlide[]>([]);
    const [loading, setLoading] = useState(true);

    // New slide form
    const [form, setForm] = useState({ title: "", subtitle: "", cta: "Apply Now", ctaLink: "/admissions", imageUrl: "" });
    const [adding, setAdding] = useState(false);
    const [addSaving, setAddSaving] = useState(false);

    // Inline edit state per slide
    const [editing, setEditing] = useState<{ [id: string]: Partial<HeroSlide> }>({});
    const [savingId, setSavingId] = useState<string | null>(null);
    const [savedId, setSavedId] = useState<string | null>(null);

    useEffect(() => {
        const q = query(collection(db, "hero-slides"), orderBy("order", "asc"));
        const unsub = onSnapshot(q, (snap) => {
            setSlides(snap.docs.map(d => ({ id: d.id, ...d.data() } as HeroSlide)));
            setLoading(false);
        });
        return () => unsub();
    }, []);

    /* ── Add Slide ── */
    const handleAdd = async () => {
        if (!form.imageUrl) return alert("Please upload an image first.");
        setAddSaving(true);
        try {
            await addDoc(collection(db, "hero-slides"), {
                ...form,
                title: form.title || "New Slide",
                subtitle: form.subtitle || "Welcome to International Access School",
                order: slides.length + 1,
                createdAt: serverTimestamp(),
            });
            setForm({ title: "", subtitle: "", cta: "Apply Now", ctaLink: "/admissions", imageUrl: "" });
            setAdding(false);
        } catch (e) {
            console.error(e);
            alert("Failed to add slide.");
        }
        setAddSaving(false);
    };

    /* ── Delete Slide ── */
    const handleDelete = async (id: string) => {
        if (!confirm("Delete this slide permanently?")) return;
        await deleteDoc(doc(db, "hero-slides", id));
    };

    /* ── Inline Edit ── */
    const startEdit = (slide: HeroSlide) => {
        setEditing(prev => ({
            ...prev,
            [slide.id]: { title: slide.title, subtitle: slide.subtitle, cta: slide.cta, ctaLink: slide.ctaLink, imageUrl: slide.imageUrl }
        }));
    };

    const cancelEdit = (id: string) => {
        setEditing(prev => { const n = { ...prev }; delete n[id]; return n; });
    };

    const saveEdit = async (id: string) => {
        setSavingId(id);
        try {
            await updateDoc(doc(db, "hero-slides", id), editing[id] as any);
            setSavedId(id);
            setTimeout(() => setSavedId(null), 2000);
            cancelEdit(id);
        } catch (e) {
            alert("Failed to save.");
        }
        setSavingId(null);
    };

    /* ── Reorder (swap order field) ── */
    const move = async (idx: number, dir: -1 | 1) => {
        const target = slides[idx];
        const swap = slides[idx + dir];
        if (!swap) return;
        const batch = writeBatch(db);
        batch.update(doc(db, "hero-slides", target.id), { order: swap.order });
        batch.update(doc(db, "hero-slides", swap.id), { order: target.order });
        await batch.commit();
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10 flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <p className="text-white/50 text-sm font-medium">Admin Console</p>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Hero Slider</h1>
                        <p className="text-white/40 text-sm mt-1">
                            {slides.length} slide{slides.length !== 1 ? "s" : ""} active on homepage
                        </p>
                    </div>
                    <button
                        onClick={() => setAdding(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gold hover:bg-gold/90 text-navy rounded-xl font-semibold text-sm transition-all shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Add Slide
                    </button>
                </div>
            </div>

            {/* Add Slide Panel */}
            {adding && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                        <h2 className="font-bold text-navy text-lg">New Slide</h2>
                        <button onClick={() => setAdding(false)} className="p-2 rounded-lg hover:bg-gray-50 text-gray-400">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="p-4 sm:p-6 grid md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <FormInput label="Title" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="e.g. Shaping Leaders of Tomorrow" />
                            <FormInput label="Subtitle" value={form.subtitle} onChange={v => setForm(f => ({ ...f, subtitle: v }))} placeholder="e.g. World-class education..." textarea />
                            <FormInput label="Button Text (CTA)" value={form.cta} onChange={v => setForm(f => ({ ...f, cta: v }))} placeholder="e.g. Apply Now" />
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Button Link</label>
                                <select
                                    value={form.ctaLink}
                                    onChange={e => setForm(f => ({ ...f, ctaLink: e.target.value }))}
                                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
                                >
                                    {LINK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Image</label>
                                <CloudinaryUploadWidget onUpload={url => setForm(f => ({ ...f, imageUrl: url }))} />
                                {form.imageUrl && <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Image uploaded and ready</p>}
                            </div>
                        </div>

                        {/* Preview */}
                        <div className="aspect-video bg-gray-100 rounded-xl overflow-hidden relative border-2 border-dashed border-gray-200 flex items-center justify-center">
                            {form.imageUrl ? (
                                <>
                                    <Image src={form.imageUrl} alt="Preview" fill className="object-cover" />
                                    <div className="absolute inset-0 bg-black/50" />
                                    <div className="absolute z-10 text-center px-4">
                                        <h3 className="text-white font-bold text-lg">{form.title || "Slide Title"}</h3>
                                        <p className="text-white/70 text-sm mt-1">{form.subtitle || "Subtitle text"}</p>
                                        <span className="mt-2 inline-block px-4 py-1.5 bg-gold text-navy text-xs font-bold rounded-full">{form.cta}</span>
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col items-center gap-2 text-gray-300">
                                    <ImageIcon className="w-10 h-10" />
                                    <span className="text-sm">Preview will appear here</span>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="px-6 pb-6 flex justify-end gap-3">
                        <button onClick={() => setAdding(false)} className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors">Cancel</button>
                        <button
                            onClick={handleAdd}
                            disabled={!form.imageUrl || addSaving}
                            className="flex items-center gap-2 px-6 py-2.5 bg-navy text-white text-sm font-semibold rounded-xl hover:bg-navy/90 disabled:opacity-50 transition-all"
                        >
                            {addSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {addSaving ? "Saving..." : "Save Slide"}
                        </button>
                    </div>
                </div>
            )}

            {/* Slides List */}
            <div className="space-y-4">
                {loading ? (
                    <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-navy" /></div>
                ) : slides.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-16 flex flex-col items-center text-center">
                        <ImageIcon className="w-10 h-10 text-gray-200 mb-3" />
                        <p className="text-sm font-semibold text-gray-400">No slides yet</p>
                        <p className="text-xs text-gray-300 mt-1">Click "Add Slide" to create your first hero slide</p>
                    </div>
                ) : (
                    slides.map((slide, idx) => {
                        const isEditing = !!editing[slide.id];
                        const ed = editing[slide.id] || {};

                        return (
                            <div key={slide.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                {/* Slide Row */}
                                <div className="flex flex-col sm:flex-row items-stretch gap-0">
                                    {/* Order Controls */}
                                    <div className="flex sm:flex-col flex-row items-center justify-center gap-2 sm:gap-1 px-3 py-2 sm:py-4 border-b sm:border-b-0 sm:border-r border-gray-100 bg-gray-50/50">
                                        <button
                                            onClick={() => move(idx, -1)}
                                            disabled={idx === 0}
                                            className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-20 transition-colors"
                                        >
                                            <ChevronUp className="w-4 h-4 text-navy sm:rotate-0 -rotate-90" />
                                        </button>
                                        <span className="text-xs font-bold text-gray-400">{idx + 1}</span>
                                        <button
                                            onClick={() => move(idx, 1)}
                                            disabled={idx === slides.length - 1}
                                            className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-20 transition-colors"
                                        >
                                            <ChevronDown className="w-4 h-4 text-navy sm:rotate-0 -rotate-90" />
                                        </button>
                                    </div>

                                    {/* Thumbnail */}
                                    <div className="w-full sm:w-40 aspect-video relative shrink-0 bg-gray-100">
                                        <Image src={slide.imageUrl} alt={slide.title} fill className="object-cover" />
                                        <div className="absolute inset-0 bg-black/20" />
                                    </div>

                                    {/* Info / Edit */}
                                    <div className="flex-1 p-4">
                                        {isEditing ? (
                                            <div className="grid sm:grid-cols-2 gap-3">
                                                <FormInput
                                                    label="Title" value={ed.title || ""} compact
                                                    onChange={v => setEditing(e => ({ ...e, [slide.id]: { ...e[slide.id], title: v } }))}
                                                />
                                                <FormInput
                                                    label="Subtitle" value={ed.subtitle || ""} compact
                                                    onChange={v => setEditing(e => ({ ...e, [slide.id]: { ...e[slide.id], subtitle: v } }))}
                                                />
                                                <FormInput
                                                    label="Button Text" value={ed.cta || ""} compact
                                                    onChange={v => setEditing(e => ({ ...e, [slide.id]: { ...e[slide.id], cta: v } }))}
                                                />
                                                <div>
                                                    <label className="block text-[10px] font-semibold text-gray-400 mb-1 uppercase tracking-wide">Button Link</label>
                                                    <select
                                                        value={ed.ctaLink || ""}
                                                        onChange={ev => setEditing(e => ({ ...e, [slide.id]: { ...e[slide.id], ctaLink: ev.target.value } }))}
                                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-navy"
                                                    >
                                                        {LINK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                    </select>
                                                </div>
                                                <div className="sm:col-span-2">
                                                    <label className="block text-[10px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Change Image</label>
                                                    <div className="flex items-center gap-3">
                                                        <CloudinaryUploadWidget onUpload={url => setEditing(e => ({ ...e, [slide.id]: { ...e[slide.id], imageUrl: url } }))} />
                                                        {ed.imageUrl !== slide.imageUrl && <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> New image ready</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="h-full flex flex-col justify-center">
                                                <h3 className="font-bold text-navy text-base leading-tight">{slide.title}</h3>
                                                <p className="text-sm text-gray-400 mt-1 line-clamp-2">{slide.subtitle}</p>
                                                <div className="flex items-center gap-2 mt-2">
                                                    <span className="text-xs bg-navy/5 text-navy px-2.5 py-1 rounded-full font-medium">{slide.cta || "Apply Now"}</span>
                                                    <span className="text-xs text-gray-300">→ {slide.ctaLink || "/admissions"}</span>
                                                    {savedId === slide.id && (
                                                        <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Saved</span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex sm:flex-col flex-row items-center justify-center gap-2 px-3 py-2 sm:py-0 border-t sm:border-t-0 sm:border-l border-gray-100 bg-gray-50 sm:bg-transparent">
                                        {isEditing ? (
                                            <>
                                                <button
                                                    onClick={() => saveEdit(slide.id)}
                                                    disabled={savingId === slide.id}
                                                    className="p-2 rounded-lg bg-navy text-white hover:bg-navy/90 transition-colors"
                                                    title="Save changes"
                                                >
                                                    {savingId === slide.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                </button>
                                                <button onClick={() => cancelEdit(slide.id)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-50 transition-colors" title="Cancel">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <a href="/" target="_blank" className="p-2 rounded-lg text-gray-400 hover:text-navy hover:bg-gray-50 transition-colors" title="Preview on homepage">
                                                    <Eye className="w-4 h-4" />
                                                </a>
                                                <button onClick={() => startEdit(slide)} className="p-2 rounded-lg text-gray-400 hover:text-navy hover:bg-blue-50 transition-colors" title="Edit slide">
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleDelete(slide.id)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete slide">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Tips */}
            {slides.length > 0 && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 text-sm text-blue-700">
                    <strong>Tips:</strong> Use the ↑↓ arrows to reorder slides. Click ✏️ to edit text or swap the image. Changes are reflected on the homepage instantly.
                </div>
            )}
        </div>
    );
}

/* ── Helper Components ── */
function FormInput({ label, value, onChange, placeholder, textarea, compact }: {
    label: string; value: string; onChange: (v: string) => void;
    placeholder?: string; textarea?: boolean; compact?: boolean;
}) {
    const labelClass = compact
        ? "block text-[10px] font-semibold text-gray-400 mb-1 uppercase tracking-wide"
        : "block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide";
    const inputClass = compact
        ? "w-full px-3 py-2 rounded-lg border border-gray-200 text-xs text-navy focus:outline-none focus:border-navy focus:ring-1 focus:ring-navy/10"
        : "w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-navy focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/10 transition-all";

    return (
        <div>
            <label className={labelClass}>{label}</label>
            {textarea ? (
                <textarea rows={2} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={`${inputClass} resize-none`} />
            ) : (
                <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={inputClass} />
            )}
        </div>
    );
}
