"use client";

import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, LayoutDashboard } from "lucide-react";

export default function SupervisorDashboard() {
    const { user } = useAuth();
    const [allowedCount, setAllowedCount] = useState(0);
    const [displayName, setDisplayName] = useState("");

    useEffect(() => {
        if (!user) return;
        const fetch = async () => {
            const supDoc = await getDoc(doc(db, "supervisors", user.uid));
            if (supDoc.exists()) {
                setAllowedCount((supDoc.data().allowedPages || []).length);
                setDisplayName(supDoc.data().displayName || "");
            }
        };
        fetch();
    }, [user]);

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <LayoutDashboard className="h-6 w-6 text-emerald-600" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Welcome, {displayName || user?.displayName || "Supervisor"}
                    </h1>
                    <p className="text-muted-foreground">Supervisor Dashboard — International Access School</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="border-emerald-200 bg-emerald-50/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-emerald-700">Pages Accessible</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-emerald-700">{allowedCount}</div>
                        <p className="text-xs text-emerald-600 mt-1">Granted by admin</p>
                    </CardContent>
                </Card>
                <Card className="border-slate-200">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Your Role</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="h-6 w-6 text-emerald-600" />
                            <span className="text-2xl font-bold">Supervisor</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{user?.email}</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                    <ShieldCheck className="h-10 w-10 mx-auto mb-3 text-emerald-500/40" />
                    <p className="text-sm">Use the sidebar to navigate to your assigned sections.</p>
                    <p className="text-xs mt-1 opacity-60">You can only access pages the admin has granted you.</p>
                </CardContent>
            </Card>
        </div>
    );
}
