"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Loader2, Printer, Download } from "lucide-react";
import { SalarySlip } from "@/components/salary-slip";

function SlipContent() {
    const params = useSearchParams();
    const year = params.get("year");
    const month = params.get("month");
    const recordId = params.get("recordId");

    const [loading, setLoading] = useState(true);
    const [record, setRecord] = useState<any>(null);
    const [teacherData, setTeacherData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!year || !month || !recordId) {
            setError("Missing parameters");
            setLoading(false);
            return;
        }
        const fetchData = async () => {
            try {
                const recRef = doc(db, "teacherSalary", year, "months", month, "records", recordId);
                const snap = await getDoc(recRef);
                if (!snap.exists()) {
                    setError("Salary record not found");
                    return;
                }
                const data = snap.data();
                setRecord({ id: snap.id, ...data });

                // Fetch staff profile — check correct collection based on staffType
                if (data.teacherId) {
                    const profileCollection = data.staffType === "staff" ? "nonTeachingStaff" : "teachers";
                    const tSnap = await getDoc(doc(db, profileCollection, data.teacherId));
                    if (tSnap.exists()) setTeacherData(tSnap.data());
                }
            } catch (err: any) {
                console.error(err);
                setError(err.message || "Failed to load");
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [year, month, recordId]);

    if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-navy" /></div>;
    if (error) return <div className="p-10 text-center text-red-600">{error}</div>;
    if (!record) return null;

    return (
        <div className="min-h-screen bg-gray-100 py-6 px-4">
            <div className="max-w-3xl mx-auto">
                <div className="flex justify-end gap-2 mb-4 print:hidden">
                    <button onClick={() => window.print()}
                        className="flex items-center gap-2 px-4 py-2 bg-navy text-white rounded-xl text-sm font-semibold hover:bg-navy-light transition-colors">
                        <Printer className="w-4 h-4" />
                        Print / Save as PDF
                    </button>
                </div>
                <SalarySlip record={record} teacher={teacherData} />
            </div>
        </div>
    );
}

export default function SalarySlipPage() {
    return (
        <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-navy" /></div>}>
            <SlipContent />
        </Suspense>
    );
}
