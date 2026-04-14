"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { Loader2, Briefcase, ArrowLeft, Eye, EyeOff } from "lucide-react";
import Link from "next/link";

const adminLoginSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(1, "Password is required"),
});

type AdminLoginFormValues = z.infer<typeof adminLoginSchema>;

export default function AdminLoginPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const router = useRouter();

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<AdminLoginFormValues>({
        resolver: zodResolver(adminLoginSchema),
    });

    const onSubmit = async (data: AdminLoginFormValues) => {
        setIsLoading(true);
        setError(null);

        try {
            const userCredential = await signInWithEmailAndPassword(auth, data.email, data.password);
            const user = userCredential.user;

            document.cookie = "auth=true; path=/; max-age=86400";

            // Verify role is actually admin in Firestore (allows all admin accounts)
            const userDoc = await getDoc(doc(db, "users", user.uid));

            if (userDoc.exists()) {
                const userData = userDoc.data();
                if (userData.role === "admin") {
                    router.push("/admin");
                } else {
                    setError("Access denied. This account does not have admin privileges.");
                    await auth.signOut();
                    // Clear cookies that might have been set by AuthContext immediately upon signout
                    document.cookie = "auth=; path=/; max-age=0";
                    document.cookie = "email=; path=/; max-age=0";
                    document.cookie = "role=; path=/; max-age=0";
                }
            } else {
                setError("Access denied. User profile not found.");
                await auth.signOut();
                document.cookie = "auth=; path=/; max-age=0";
                document.cookie = "email=; path=/; max-age=0";
                document.cookie = "role=; path=/; max-age=0";
            }
        } catch (err: any) {
            console.error(err);
            setError("Invalid email or password.");
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
                            backgroundImage: `radial-gradient(circle at 70% 30%, rgba(200,169,81,0.2) 0%, transparent 50%)`
                        }}
                    />
                    <div className="relative z-10 flex flex-col items-center">
                        <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mb-4 backdrop-blur-sm">
                            <Briefcase className="w-8 h-8 text-gold" />
                        </div>
                        <h1 className="text-2xl font-bold text-white">Admin Login</h1>
                        <p className="text-white/60 text-sm mt-1">Authorized personnel only</p>
                    </div>
                </div>

                <div className="p-8">
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-navy ml-1">Email Address</label>
                            <input
                                {...register("email")}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-gold focus:ring-1 focus:ring-gold outline-none transition-all placeholder:text-gray-300 bg-gray-50/50 focus:bg-white"
                                placeholder="name@school.edu"
                            />
                            {errors.email && (
                                <p className="text-red-500 text-xs ml-1">{errors.email.message}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-navy ml-1">Password</label>
                            <div className="relative">
                                <input
                                    {...register("password")}
                                    type={showPassword ? "text" : "password"}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-gold focus:ring-1 focus:ring-gold outline-none transition-all placeholder:text-gray-300 bg-gray-50/50 focus:bg-white"
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            {errors.password && (
                                <p className="text-red-500 text-xs ml-1">{errors.password.message}</p>
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
