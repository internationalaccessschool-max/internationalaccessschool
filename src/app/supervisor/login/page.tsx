"use client";

import { useState, useEffect } from "react";
import { signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";

export default function SupervisorLoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);
        try {
            const result = await signInWithEmailAndPassword(auth, email, password);
            const uid = result.user.uid;

            // Verify the role in Firestore BEFORE redirecting
            const userDoc = await getDoc(doc(db, "users", uid));
            if (!userDoc.exists() || userDoc.data().role !== "supervisor") {
                await auth.signOut();
                setError("This account does not have supervisor access. Please contact admin.");
                setIsLoading(false);
                return;
            }

            // Set cookies manually so middleware can read them immediately
            document.cookie = `auth=true; path=/; max-age=86400`;
            document.cookie = `role=supervisor; path=/; max-age=86400`;
            document.cookie = `email=${result.user.email}; path=/; max-age=86400`;

            router.push("/supervisor");
        } catch (err: any) {
            if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
                setError("Invalid email or password. Please try again.");
            } else {
                setError(err.message || "Login failed. Please try again.");
            }
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
            <div className="w-full max-w-md">
                {/* Card */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
                    {/* Logo */}
                    <div className="flex flex-col items-center mb-8">
                        <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mb-4">
                            <ShieldCheck className="h-8 w-8 text-emerald-400" />
                        </div>
                        <h1 className="text-2xl font-bold text-white">Supervisor Portal</h1>
                        <p className="text-white/50 text-sm mt-1">International Access School</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-white/70 text-sm font-medium">Email Address</label>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="supervisor@school.com"
                                required
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-white/70 text-sm font-medium">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all"
                            />
                        </div>

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
                        >
                            {isLoading ? (
                                <><Loader2 className="h-4 w-4 animate-spin" /> Verifying...</>
                            ) : "Sign In"}
                        </button>
                    </form>
                </div>

                <p className="text-center text-white/30 text-xs mt-6">
                    © 2025 International Access School
                </p>
            </div>
        </div>
    );
}
