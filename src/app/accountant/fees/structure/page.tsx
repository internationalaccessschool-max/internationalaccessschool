"use client";

import { useState, useEffect } from "react";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Settings2, Save, Loader2, CheckCircle2, Info } from "lucide-react";
import toast from "react-hot-toast";

// These IDs MUST match the className stored on student profiles (e.g. "7", "10")
const CLASS_LIST = [
    { id: "1", name: "Class 1" },
    { id: "2", name: "Class 2" },
    { id: "3", name: "Class 3" },
    { id: "4", name: "Class 4" },
    { id: "5", name: "Class 5" },
    { id: "6", name: "Class 6" },
    { id: "7", name: "Class 7" },
    { id: "8", name: "Class 8" },
    { id: "9", name: "Class 9" },
    { id: "10", name: "Class 10" },
    { id: "11", name: "Class 11" },
    { id: "12", name: "Class 12" },
];

interface FeeStructure {
    monthly: number;
    tuitionFee: number;
    examFee: number;
    computerFee: number;
    transportFee: number;
    libraryFee: number;
    sportsFee: number;
    miscFee: number;
    dueDay: number;
}

export default function FeeStructurePage() {
    const [structure, setStructure] = useState<Record<string, FeeStructure>>({});
    const [saving, setSaving] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const structureMap: Record<string, FeeStructure> = {};
                for (const cls of CLASS_LIST) {
                    const feeDoc = await getDoc(doc(db, "fees", "structure", "classes", cls.id));
                    structureMap[cls.id] = feeDoc.exists()
                        ? (feeDoc.data() as FeeStructure)
                        : { monthly: 0, tuitionFee: 0, examFee: 0, computerFee: 0, transportFee: 0, libraryFee: 0, sportsFee: 0, miscFee: 0, dueDay: 10 };
                }
                setStructure(structureMap);
            } catch (err) {
                console.error(err);
                toast.error("Failed to load fee structure");
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
                tuitionFee: structure[classId]?.tuitionFee || 0,
                examFee: structure[classId]?.examFee || 0,
                computerFee: structure[classId]?.computerFee || 0,
                transportFee: structure[classId]?.transportFee || 0,
                libraryFee: structure[classId]?.libraryFee || 0,
                sportsFee: structure[classId]?.sportsFee || 0,
                miscFee: structure[classId]?.miscFee || 0,
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
        setStructure(prev => {
            const classStructure = { ...prev[classId], [field]: value };

            // Auto calculate monthly total if a fee component changes
            if (field !== "dueDay" && field !== "monthly") {
                classStructure.monthly =
                    (classStructure.tuitionFee || 0) +
                    (classStructure.examFee || 0) +
                    (classStructure.computerFee || 0) +
                    (classStructure.transportFee || 0) +
                    (classStructure.libraryFee || 0) +
                    (classStructure.sportsFee || 0) +
                    (classStructure.miscFee || 0);
            }

            return {
                ...prev,
                [classId]: classStructure,
            };
        });
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

            {/* Info Box */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100">
                <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <div>
                    <p className="text-sm font-medium text-blue-800">How it works</p>
                    <p className="text-xs text-blue-600 mt-0.5">
                        Set the monthly fee for each class. The <strong>due day</strong> means fees are due on that day every month (e.g., 10 = 10th of each month).
                        After saving, go to <strong>Generate Monthly Fees</strong> to create fee records for all students.
                        Students with <strong>monthly fee = 0</strong> will be skipped during generation.
                    </p>
                </div>
            </div>

            {/* Fee Structure Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                    <h2 className="font-semibold text-navy">Class-wise Fee Configuration</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Set the monthly fee and due day for each class. Leave monthly fee as 0 to skip that class.</p>
                </div>

                <div className="overflow-x-auto">
                    <div className="min-w-[1000px] divide-y divide-gray-50">
                        {/* Column Headers */}
                        <div className="grid grid-cols-[100px_repeat(7,1fr)_100px_80px_100px] gap-2 px-6 py-3 bg-gray-50 text-[10px] font-bold uppercase tracking-wider text-gray-500 items-center text-center">
                            <div className="text-left">Class</div>
                            <div>Tuition</div>
                            <div>Exam</div>
                            <div>Computer</div>
                            <div>Transport</div>
                            <div>Library</div>
                            <div>Sports</div>
                            <div>Misc</div>
                            <div className="text-navy">Total (₹)</div>
                            <div>Due Day</div>
                            <div className="text-right">Action</div>
                        </div>

                        {CLASS_LIST.map(cls => (
                            <div key={cls.id} className="grid grid-cols-[100px_repeat(7,1fr)_100px_80px_100px] gap-2 items-center px-6 py-3 hover:bg-gray-50/50 transition-colors">
                                <div className="font-semibold text-navy text-sm">{cls.name}</div>

                                {['tuitionFee', 'examFee', 'computerFee', 'transportFee', 'libraryFee', 'sportsFee', 'miscFee'].map(feeKey => (
                                    <div key={feeKey}>
                                        <input
                                            type="number"
                                            min={0}
                                            value={structure[cls.id]?.[feeKey as keyof FeeStructure] || ""}
                                            onChange={e => updateField(cls.id, feeKey as keyof FeeStructure, Number(e.target.value))}
                                            placeholder="0"
                                            className="w-full px-2 py-1.5 rounded border border-gray-200 text-sm focus:border-gold focus:ring-1 focus:ring-gold outline-none transition-all text-center"
                                        />
                                    </div>
                                ))}

                                <div className="text-center font-bold text-navy bg-gold/10 py-1.5 rounded border border-gold/20 text-sm">
                                    ₹{structure[cls.id]?.monthly || 0}
                                </div>

                                <div>
                                    <input
                                        type="number"
                                        min={1}
                                        max={28}
                                        value={structure[cls.id]?.dueDay || 10}
                                        onChange={e => updateField(cls.id, "dueDay", Number(e.target.value))}
                                        className="w-full px-2 py-1.5 rounded border border-gray-200 text-sm focus:border-gold focus:ring-1 focus:ring-gold outline-none transition-all text-center"
                                    />
                                </div>

                                <div className="text-right">
                                    <button
                                        onClick={() => handleSave(cls.id)}
                                        disabled={saving === cls.id}
                                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy text-white text-xs font-medium hover:bg-navy-light transition-all disabled:opacity-50 w-full"
                                    >
                                        {saving === cls.id ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <Save className="w-3.5 h-3.5" />
                                        )}
                                        Save
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Workflow steps */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-100">
                <CheckCircle2 className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                    <p className="text-sm font-medium text-amber-800">Step-by-Step</p>
                    <ol className="text-xs text-amber-700 mt-1 space-y-0.5 list-decimal list-inside">
                        <li>Set monthly fee &amp; due day for each class here → <strong>Save</strong></li>
                        <li>Go to <strong>Generate Monthly Fees</strong> → select month/year → Generate</li>
                        <li>Go to <strong>Manage Fees</strong> → mark payments as Paid / Overdue / send reminders</li>
                    </ol>
                </div>
            </div>
        </div>
    );
}
