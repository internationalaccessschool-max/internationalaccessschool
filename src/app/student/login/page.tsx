"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { Loader2, GraduationCap, ArrowLeft, Calendar } from "lucide-react";
import Link from "next/link";

const studentLoginSchema = z.object({
    admissionNo: z
        .string()
        .min(1, "Admission Number is required")
        .max(8, "Admission Number can be at most 8 digits")
        .regex(/^\d+$/, "Only numbers allowed"),
    dob: z.string().min(1, "Date of Birth is required"),
});

type StudentLoginFormValues = z.infer<typeof studentLoginSchema>;

export default function StudentLoginPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<StudentLoginFormValues>({
        resolver: zodResolver(studentLoginSchema),
    });

    const onSubmit = async (data: StudentLoginFormValues) => {
        setIsLoading(true);
        setError(null);

        try {
            const { admissionNo, dob } = data;
            const email = `${admissionNo.trim()}@ias.edu`;

            // DOB from date picker is YYYY-MM-DD (e.g. "2009-01-01")
            // Admissions flow now stores password as DD-MM-YY
            // CSV import stores password as DD-MM-YYYY
            // Try all formats:
            const [yyyy, mm, dd] = dob.split("-");
            const formatA = dob;                         // "2009-01-01"
            const formatB = `${dd}-${mm}-${yyyy}`;       // "01-01-2009"
            const formatC = `${dd}-${mm}-${yyyy.slice(-2)}`; // "01-01-09"

            let userCredential;
            try {
                userCredential = await signInWithEmailAndPassword(auth, email, formatA);
            } catch {
                try {
                    userCredential = await signInWithEmailAndPassword(auth, email, formatB);
                } catch {
                    userCredential = await signInWithEmailAndPassword(auth, email, formatC);
                }
            }

            const user = userCredential.user;

            document.cookie = "auth=true; path=/; max-age=86400";
            document.cookie = `email=${user.email}; path=/; max-age=86400`;

            // Verify role is actually student
            const userDoc = await getDoc(doc(db, "users", user.uid));

            if (userDoc.exists()) {
                const userData = userDoc.data();
                if (userData.role === "student") {
                    document.cookie = "role=student; path=/; max-age=86400";
                    router.push("/student");
                } else {
                    setError("Access denied. Not a student account.");
                    await auth.signOut();
                }
            } else {
                // If auth passes but users/uid doc is missing, self-heal
                const { serverTimestamp, setDoc } = await import("firebase/firestore");
                await setDoc(doc(db, "users", user.uid), {
                    uid: user.uid,
                    email: email,
                    role: "student",
                    createdAt: serverTimestamp()
                });
                document.cookie = "role=student; path=/; max-age=86400";
                router.push("/student");
            }
        } catch (err: any) {
            console.error(err);
            setError("Invalid Admission Number or Date of Birth.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-off-white p-4">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden">
                <div className="gradient-navy p-8 text-center relative overflow-hidden">
                    <div className="absolute inset-0 opacity-10"
                        style={{
                            backgroundImage: `radial-gradient(circle at 30% 30%, rgba(200,169,81,0.2) 0%, transparent 50%)`
                        }}
                    />
                    <div className="relative z-10 flex flex-col items-center">
                        <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mb-4 backdrop-blur-sm">
                            <GraduationCap className="w-8 h-8 text-gold" />
                        </div>
                        <h1 className="text-2xl font-bold text-white">Student Login</h1>
                        <p className="text-white/60 text-sm mt-1">Access your academic dashboard</p>
                    </div>
                </div>

                <div className="p-8">
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-navy ml-1">Admission Number</label>
                            <input
                                {...register("admissionNo")}
                                type="text"
                                inputMode="numeric"
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-gold focus:ring-1 focus:ring-gold outline-none transition-all placeholder:text-gray-300 bg-gray-50/50 focus:bg-white"
                                placeholder="e.g. 232902"
                            />
                            {errors.admissionNo && (
                                <p className="text-red-500 text-xs ml-1">{errors.admissionNo.message}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-navy ml-1">Date of Birth <span className="text-gray-400 font-normal text-xs">(DD-MM-YYYY)</span></label>
                            <div className="relative">
                                <input
                                    {...register("dob")}
                                    type="date"
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-gold focus:ring-1 focus:ring-gold outline-none transition-all placeholder:text-gray-300 bg-gray-50/50 focus:bg-white uppercase text-sm"
                                />
                                <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                            </div>
                            {errors.dob && (
                                <p className="text-red-500 text-xs ml-1">{errors.dob.message}</p>
                            )}
                        </div>

                        {error && (
                            <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm text-center font-medium">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3 px-4 bg-navy text-white rounded-xl font-semibold hover:bg-navy-light transition-all shadow-lg shadow-navy/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Authenticating...
                                </>
                            ) : (
                                "Access Dashboard"
                            )}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <Link href="/login" className="inline-flex items-center text-sm text-gray-400 hover:text-navy transition-colors font-medium">
                            <ArrowLeft className="w-4 h-4 mr-1" />
                            Back to Role Selection
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
