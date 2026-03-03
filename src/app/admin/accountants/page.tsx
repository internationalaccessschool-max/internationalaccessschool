"use client";

import { useState, useEffect } from "react";
import { collection, doc, getDocs, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Banknote, Plus, Trash2, Loader2, Mail, User, ShieldCheck } from "lucide-react";

interface AccountantProfile {
    uid: string;
    email: string;
    displayName: string;
    createdAt: number;
}

export default function AdminAccountantsPage() {
    const [accountants, setAccountants] = useState<AccountantProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState<AccountantProfile | null>(null);

    const [newEmail, setNewEmail] = useState("");
    const [newName, setNewName] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState("");

    const fetchAccountants = async () => {
        try {
            const snap = await getDocs(collection(db, "accountants"));
            setAccountants(snap.docs.map(d => ({ ...d.data(), uid: d.id } as AccountantProfile)));
        } catch (err) {
            console.error("Error fetching accountants:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchAccountants(); }, []);

    const handleCreate = async () => {
        setCreateError("");
        if (!newEmail.trim() || !newName.trim() || !newPassword.trim()) {
            setCreateError("Please fill in all fields.");
            return;
        }
        if (newPassword.length < 6) {
            setCreateError("Password must be at least 6 characters.");
            return;
        }

        setIsCreating(true);
        try {
            const res = await fetch("/api/admin/create-accountant", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: newEmail, password: newPassword, displayName: newName }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create accountant");

            const uid = data.uid;

            // Write to users collection (role)
            await setDoc(doc(db, "users", uid), {
                role: "accountant",
                email: newEmail,
                displayName: newName,
                createdAt: Date.now(),
            });

            // Write to accountants collection
            await setDoc(doc(db, "accountants", uid), {
                uid,
                email: newEmail,
                displayName: newName,
                createdAt: Date.now(),
            });

            setIsCreateOpen(false);
            setNewEmail(""); setNewName(""); setNewPassword("");
            fetchAccountants();
        } catch (err: any) {
            setCreateError(err.message || "Something went wrong");
        } finally {
            setIsCreating(false);
        }
    };

    const handleDelete = async () => {
        if (!deleting) return;
        try {
            // Step 1: Remove from Firebase Auth — revokes login immediately
            const res = await fetch("/api/admin/delete-user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ uid: deleting.uid }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(`Could not remove login access: ${data.error}`);
            }

            // Step 2: Remove from Firestore only after Auth is cleared
            await deleteDoc(doc(db, "accountants", deleting.uid));
            await deleteDoc(doc(db, "users", deleting.uid));

            setIsDeleteOpen(false);
            setDeleting(null);
            fetchAccountants();
        } catch (err: any) {
            alert("Error deleting accountant: " + err.message);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gold/20 flex items-center justify-center">
                            <Banknote className="w-6 h-6 text-gold" />
                        </div>
                        <div>
                            <p className="text-white/50 text-sm font-medium">Admin Panel</p>
                            <h1 className="text-2xl md:text-3xl font-bold text-white">Accountant Accounts</h1>
                            <p className="text-white/40 text-sm mt-1">Create and manage accountant login credentials.</p>
                        </div>
                    </div>
                    <button
                        onClick={() => { setCreateError(""); setIsCreateOpen(true); }}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gold text-navy font-semibold text-sm hover:bg-gold/90 transition-all shrink-0 shadow-md"
                    >
                        <Plus className="w-4 h-4" />
                        Add Accountant
                    </button>
                </div>
            </div>

            {/* Accountants Table */}
            <Card className="border-border/50 shadow-sm">
                <CardHeader className="bg-muted/20 border-b pb-4">
                    <CardTitle>All Accountants</CardTitle>
                    <CardDescription>
                        Accountants can manage all fee records, mark payments, and send reminders.
                        Login at <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">/accountant/login</span>
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-14 gap-2 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin" /> Loading...
                        </div>
                    ) : accountants.length === 0 ? (
                        <div className="py-16 text-center text-muted-foreground">
                            <Banknote className="h-12 w-12 mx-auto mb-4 opacity-20" />
                            <p className="font-medium">No accountants yet</p>
                            <p className="text-sm mt-1">Click "Add Accountant" to create the first account.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-muted-foreground uppercase bg-muted/30 border-b">
                                    <tr>
                                        <th className="px-6 py-4 font-medium">Name</th>
                                        <th className="px-6 py-4 font-medium">Email</th>
                                        <th className="px-6 py-4 font-medium">Created</th>
                                        <th className="px-6 py-4 font-medium text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {accountants.map(acc => (
                                        <tr key={acc.uid} className="hover:bg-muted/10 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                                                        <span className="text-amber-700 font-bold text-sm">
                                                            {acc.displayName?.charAt(0).toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <span className="font-semibold text-navy">{acc.displayName}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-muted-foreground">
                                                <div className="flex items-center gap-1.5">
                                                    <Mail className="w-3.5 h-3.5" />
                                                    {acc.email}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-muted-foreground text-xs">
                                                {acc.createdAt ? new Date(acc.createdAt).toLocaleDateString("en-IN") : "—"}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                                                    onClick={() => { setDeleting(acc); setIsDeleteOpen(true); }}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Info Box */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100">
                <ShieldCheck className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <div>
                    <p className="text-sm font-medium text-blue-800">Accountant Access</p>
                    <p className="text-xs text-blue-600 mt-0.5">
                        Accountants can access the Finance Portal at <strong>/accountant</strong>.
                        They can manage fee structure, generate monthly fees, mark payments, and send email reminders to parents.
                        Admin can also view the <strong>Fee Overview</strong> dashboard.
                    </p>
                </div>
            </div>

            {/* Create Dialog */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Accountant Account</DialogTitle>
                        <DialogDescription>
                            This will create a login for the accountant. Share the email and password with them securely.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label>Full Name</Label>
                            <Input
                                placeholder="e.g. Ravi Kumar"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Email Address</Label>
                            <Input
                                type="email"
                                placeholder="accountant@school.com"
                                value={newEmail}
                                onChange={e => setNewEmail(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Password</Label>
                            <Input
                                type="password"
                                placeholder="Minimum 6 characters"
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                            />
                        </div>
                        {createError && (
                            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                                {createError}
                            </p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreate} disabled={isCreating}>
                            {isCreating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</> : "Create Account"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirm Dialog */}
            <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Accountant</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete <strong>{deleting?.displayName}</strong>?
                            This will permanently remove their login access. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDelete}>
                            Yes, Delete Account
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
