"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Settings2, Save, Loader2, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";

interface ClassInfo {
    id: string;
    name: string;
}

interface FeeStructure {
    monthly: number;
    dueDay: number;
}

export default function FeeStructurePage() {
    const [classes, setClasses] = useState<ClassInfo[]>([]);
    const [structure, setStructure] = useState<Record<string, FeeStructure>>({});
    const [saving, setSaving] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch all classes
                const classSnap = await getDocs(collection(db, "classes"));
                const classList: ClassInfo[] = classSnap.docs.map(d => ({
                    id: d.id,
                    name: d.data().name || `Class ${d.id}`,
                }));
                setClasses(classList.sort((a, b) => a.name.localeCompare(b.name)));

                // Fetch existing fee structures
                const structureMap: Record<string, FeeStructure> = {};
                for (const cls of classList) {
                    const feeDoc = await getDoc(doc(db, "fees", "structure", "classes", cls.id));
                    if (feeDoc.exists()) {
                        structureMap[cls.id] = feeDoc.data() as FeeStructure;
                    } else {
                        structureMap[cls.id] = { monthly: 0, dueDay: 10 };
                    }
                }
                setStructure(structureMap);
            } catch (err) {
                console.error(err);
                toast.error("Failed to load data");
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleSave = async (classId: string) => {
        setSaving(classId);
        try {
            await setDoc(doc(db, "fees", "structure", "classes", classId), {
                monthly: structure[classId]?.monthly || 0,
                dueDay: structure[classId]?.dueDay || 10,
                updatedAt: new Date(),
            });
            toast.success("Fee structure saved!");
        } catch (err) {
            toast.error("Failed to save");
        } finally {
            setSaving(null);
        }
    };

    const updateField = (classId: string, field: keyof FeeStructure, value: number) => {
        setStructure(prev => ({
            ...prev,
            [classId]: { ...prev[classId], [field]: value },
        }));
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-navy" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }}
                />
                <div className="relative z-10 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gold/20 flex items-center justify-center">
                        <Settings2 className="w-6 h-6 text-gold" />
                    </div>
                    <div>
                        <p className="text-white/50 text-sm font-medium">Finance Portal</p>
                        <h1 className="text-2xl md:text-3xl font-bold text-white">Fee Structure</h1>
                        <p className="text-white/40 text-sm mt-1">Set monthly fee amounts and due dates per class.</p>
                    </div>
                </div>
            </div>

            {/* Fee Structure Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                    <h2 className="font-semibold text-navy">Class-wise Fee Configuration</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Set the monthly fee and due day for each class.</p>
                </div>

                {classes.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                        <Settings2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">No classes found. Add classes first from Admin panel.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {/* Column Headers */}
                        <div className="grid grid-cols-4 gap-4 px-6 py-3 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-400">
                            <span>Class</span>
                            <span>Monthly Fee (₹)</span>
                            <span>Due Day (of month)</span>
                            <span>Action</span>
                        </div>

                        {classes.map(cls => (
                            <div key={cls.id} className="grid grid-cols-4 gap-4 items-center px-6 py-4 hover:bg-gray-50/50 transition-colors">
                                <div className="font-semibold text-navy">{cls.name}</div>

                                <div>
                                    <input
                                        type="number"
                                        min={0}
                                        value={structure[cls.id]?.monthly || ""}
                                        onChange={e => updateField(cls.id, "monthly", Number(e.target.value))}
                                        placeholder="e.g. 5000"
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-gold focus:ring-1 focus:ring-gold outline-none transition-all"
                                    />
                                </div>

                                <div>
                                    <input
                                        type="number"
                                        min={1}
                                        max={28}
                                        value={structure[cls.id]?.dueDay || 10}
                                        onChange={e => updateField(cls.id, "dueDay", Number(e.target.value))}
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-gold focus:ring-1 focus:ring-gold outline-none transition-all"
                                    />
                                </div>

                                <button
                                    onClick={() => handleSave(cls.id)}
                                    disabled={saving === cls.id}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy text-white text-sm font-medium hover:bg-navy-light transition-all disabled:opacity-50"
                                >
                                    {saving === cls.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Save className="w-4 h-4" />
                                    )}
                                    Save
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Info Box */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100">
                <CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <div>
                    <p className="text-sm font-medium text-blue-800">How it works</p>
                    <p className="text-xs text-blue-600 mt-0.5">
                        Set the monthly fee for each class. The <strong>due day</strong> means fees are due on that day every month (e.g., 10 = 10th of each month).
                        After saving, go to <strong>Generate Monthly Fees</strong> to create fee records for all students.
                    </p>
                </div>
            </div>
        </div>
    );
}
