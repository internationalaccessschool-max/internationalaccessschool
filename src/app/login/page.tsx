"use client";

import { useRouter } from "next/navigation";
import { GraduationCap, User, BookOpen, Briefcase, Banknote, ShieldCheck } from "lucide-react";

type LoginRole = "student" | "teacher" | "admin" | "accountant" | "supervisor";

interface RoleOption {
    id: LoginRole;
    label: string;
    description: string;
    icon: any;
    color: string;
    path: string;
}

const roles: RoleOption[] = [
    { id: "admin", label: "Admin", description: "Oversee operations", icon: Briefcase, color: "bg-purple-500 text-white", path: "/admin/login" },
    { id: "teacher", label: "Teacher", description: "Manage academics", icon: BookOpen, color: "bg-green-500 text-white", path: "/teacher/login" },
    { id: "student", label: "Student", description: "Access learning portal", icon: User, color: "bg-blue-500 text-white", path: "/student/login" },
    { id: "accountant", label: "Accountant", description: "Handle finances", icon: Banknote, color: "bg-yellow-500 text-white", path: "/accountant/login" },
    { id: "supervisor", label: "Supervisor", description: "Monitor & supervise", icon: ShieldCheck, color: "bg-emerald-500 text-white", path: "/supervisor/login" },
];

export default function LoginPage() {
    const router = useRouter();

    const handleRoleSelect = (path: string) => {
        router.push(path);
    };

    return (
        <div className="min-h-screen flex bg-white font-sans">
            {/* Left Side — Branding Premium Redesign */}
            <div className="hidden lg:flex lg:w-[45%] bg-[#050B14] relative overflow-hidden items-center justify-center p-12 shadow-2xl z-10">
                {/* Dynamic Background Effects */}
                <div className="absolute inset-0 z-0 pointer-events-none">
                    <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-[radial-gradient(circle,_rgba(200,169,81,0.15)_0%,_transparent_60%)] animate-pulse duration-[10s]" />
                    <div className="absolute bottom-[-20%] right-[-10%] w-[70%] h-[70%] bg-[radial-gradient(circle,_rgba(43,89,255,0.12)_0%,_transparent_60%)] animate-pulse duration-[7s]" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.02)_0%,_transparent_100%)] rounded-full border border-white/5 animate-[spin_60s_linear_infinite]" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.02)_0%,_transparent_100%)] rounded-full border border-white/5 animate-[spin_40s_linear_infinite_reverse]" />
                </div>

                {/* Dot Grid Pattern Overlay */}
                <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='1' fill-rule='evenodd'%3E%3Ccircle cx='2' cy='2' r='1.5'/%3E%3C/g%3E%3C/svg%3E")` }}
                />

                <div className="relative z-10 w-full max-w-md">
                    {/* Glassmorphic Panel */}
                    <div className="backdrop-blur-2xl bg-white/[0.03] border border-white/10 rounded-[2rem] p-10 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] relative overflow-hidden group">

                        {/* Interactive Shine Effect */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none transform translate-x-[-100%] group-hover:translate-x-[100%] ease-in-out" />

                        <div className="flex flex-col items-center text-center space-y-8">
                            {/* Logo Icon with Glow */}
                            <div className="relative">
                                <div className="absolute inset-0 bg-gold blur-2xl opacity-20 rounded-full animate-pulse" />
                                <div className="relative w-24 h-24 rounded-2xl bg-gradient-to-b from-white/10 to-transparent flex items-center justify-center border border-white/20 shadow-inner">
                                    <GraduationCap className="w-12 h-12 text-gold drop-shadow-[0_0_15px_rgba(200,169,81,0.5)]" />
                                </div>
                            </div>

                            {/* Text Header */}
                            <div className="space-y-4">
                                <h1 className="text-4xl sm:text-[2.75rem] font-extrabold text-transparent bg-clip-text bg-gradient-to-b from-white to-white/70 tracking-tight leading-tight drop-shadow-sm">
                                    International<br />Access School
                                </h1>
                                <p className="text-white/60 text-sm leading-relaxed font-medium px-2">
                                    Welcome to the central portal. Select your account type to sign in and seamlessly access your personalized dashboard.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Side — Content Redesign */}
            <div className="w-full lg:w-[55%] flex items-center justify-center p-8 sm:p-12 lg:p-24 bg-[#FAFAFA] relative overflow-hidden">
                {/* Subtle right side background pattern */}
                <div className="absolute inset-0 z-0 opacity-[0.04] pointer-events-none"
                    style={{ backgroundImage: `radial-gradient(circle at 2px 2px, black 1px, transparent 0)`, backgroundSize: "32px 32px" }}
                />

                <div className="w-full max-w-md space-y-8 relative z-10">
                    <div className="space-y-6 animate-fade-in-up">
                        <div className="text-center lg:text-left mb-10">
                            <h2 className="text-[2rem] font-extrabold text-[#050B14] mb-2 tracking-tight">Welcome Back</h2>
                            <p className="text-gray-500 font-medium text-sm">Please select your portal to continue securely.</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            {roles.map((role) => (
                                <button
                                    key={role.id}
                                    onClick={() => handleRoleSelect(role.path)}
                                    className="flex flex-col items-start p-6 rounded-3xl border border-gray-200/60 bg-white hover:bg-gray-50/50 hover:border-gold/40 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:-translate-y-1 transition-all duration-300 group text-left relative overflow-hidden"
                                >
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-gray-100/50 to-transparent rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                                    <div className={`w-12 h-12 rounded-2xl ${role.color} flex items-center justify-center mb-5 group-hover:scale-110 group-hover:-rotate-3 transition-transform shadow-sm`}>
                                        <role.icon className="w-6 h-6" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <h3 className="font-bold text-[#050B14] text-lg tracking-tight group-hover:text-gold transition-colors">{role.label}</h3>
                                        <p className="text-[13px] text-gray-500 font-medium leading-snug">{role.description}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
