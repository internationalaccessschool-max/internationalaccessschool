import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/auth-guard";
import { FieldValue } from "firebase-admin/firestore";

interface TeacherPayload {
    id: string;
    name: string;
    designation: string;
    basicSalary: number;
    hra: number;
    da: number;
    otherAllowances: number;
    pfPct: number;
    esicPct: number;
    staffType?: "teacher" | "staff";
}

export async function POST(req: NextRequest) {
    try {
        const authResult = await verifyAuth(req, ["admin"]);
        if (authResult instanceof NextResponse) return authResult;

        const { year, month, workingDays: clientWorkingDays, teachers } = await req.json();

        if (!year || !month || !Array.isArray(teachers) || teachers.length === 0) {
            return NextResponse.json({ error: "Missing year/month/teachers" }, { status: 400 });
        }

        const yearStr = String(year);
        const monthStr = String(month);

        // Fetch attendance for this month to compute working days
        let workingDaysInMonth = 0;
        const holidayDates: Set<string> = new Set();
        const attendanceByDate: Record<string, any> = {};
        try {
            const ymPrefix = `${yearStr}-${String(month).padStart(2, "0")}`;
            const monthColSnap = await adminDb
                .collection(`teacherAttendance/${yearStr}/months/${ymPrefix}/days`).get();

            monthColSnap.docs.forEach((d: any) => {
                const data = d.data() as any;
                const date = data.date || d.id;
                attendanceByDate[date] = data;
                if (data.isHoliday) holidayDates.add(date);
                else workingDaysInMonth++;
            });
        } catch (e) {
            console.warn("Could not load attendance — defaulting to 0 deductions:", e);
        }

        let created = 0, skipped = 0, failed = 0;

        const writes = teachers.map(async (t: TeacherPayload) => {
            try {
                const recordId = `${t.id}_${yearStr}_${String(month).padStart(2, "0")}`;
                const recordRef = adminDb
                    .collection("teacherSalary").doc(yearStr)
                    .collection("months").doc(monthStr)
                    .collection("records").doc(recordId);

                const existing = await recordRef.get();
                if (existing.exists) { skipped++; return; }

                const basic = Number(t.basicSalary) || 0;
                const hra = Number(t.hra) || 0;
                const da = Number(t.da) || 0;
                const other = Number(t.otherAllowances) || 0;
                const gross = basic + hra + da + other;

                const pfPct = Number(t.pfPct) || 0;
                const esicPct = Number(t.esicPct) || 0;
                const pfDeduction = Math.round((gross * pfPct) / 100);
                const esicDeduction = Math.round((gross * esicPct) / 100);

                // Compute attendance summary
                let presentDays = 0, absentDays = 0, leaveDays = 0, lateDays = 0, halfDayDays = 0;
                for (const [, data] of Object.entries(attendanceByDate)) {
                    if ((data as any).isHoliday) continue;
                    const status = (data as any).records?.[t.id];
                    if (status === "present") presentDays++;
                    else if (status === "late") { presentDays++; lateDays++; }
                    else if (status === "absent") absentDays++;
                    else if (status === "leave") leaveDays++;
                    else if (status === "half_day") halfDayDays++;
                }

                // 1 absent = 1 day cut, 3 lates = 1 day cut
                // half_day = 0.5 day deduction
                const effectiveDays = clientWorkingDays || workingDaysInMonth;
                const lateDeductDays = Math.floor(lateDays / 3);
                const absentDeductDays = absentDays;
                const deductibleDays = lateDeductDays + absentDeductDays;
                const perDayRate = effectiveDays > 0 ? gross / effectiveDays : 0;
                const absentDeduction = Math.round(deductibleDays * perDayRate);
                const halfDayDeduction = Math.round(halfDayDays * 0.5 * perDayRate);

                const totalDeductions = pfDeduction + esicDeduction + absentDeduction + halfDayDeduction;
                const netSalary = gross - totalDeductions;

                await recordRef.set({
                    teacherId: t.id,
                    teacherName: t.name,
                    designation: t.designation,
                    staffType: t.staffType || "teacher",
                    year: Number(year),
                    month: Number(month),
                    basicSalary: basic,
                    hra, da, otherAllowances: other,
                    gross,
                    pfPct, esicPct,
                    pfDeduction, esicDeduction, otherDeductions: 0,
                    absentDeduction, halfDayDeduction,
                    deductibleDays, halfDayDays,
                    lateDeductDays,
                    absentDeductDays,
                    // Kept for backward compatibility with old salary slips:
                    lateToAbsent: lateDeductDays,
                    effectiveAbsents: absentDays + lateDeductDays,
                    perDayRate: Math.round(perDayRate),
                    totalDeductions,
                    netSalary,
                    status: "pending",
                    workingDays: effectiveDays,
                    holidayDays: holidayDates.size,
                    presentDays, absentDays, leaveDays, lateDays,
                    createdAt: FieldValue.serverTimestamp(),
                });
                created++;
            } catch (err) {
                console.error(`Failed to generate salary for ${t.id}:`, err);
                failed++;
            }
        });

        await Promise.allSettled(writes);

        return NextResponse.json({ success: true, created, skipped, failed });
    } catch (error: any) {
        console.error("[TeacherSalary/generate] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
