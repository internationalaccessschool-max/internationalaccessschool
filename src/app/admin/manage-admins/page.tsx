"use client";

import { useState, useEffect } from "react";
import { collection, doc, getDocs, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { UserCog, Plus, Trash2, KeyRound, Loader2, Mail, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import toast from "react-hot-toast";

interface AdminProfile {
    uid: string;
    email: string;
    displayName: string;
    createdAt: number;
}

export default function ManageAdminsPage() {
    const [admins, setAdmins] = useState<AdminProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Create dialog
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newName, setNewName] = useState("");
    const [newEmail, setNewEmail] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [showNewPass, setShowNewPass] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState("");

    // Password change dialog
    const [isPassOpen, setIsPassOpen] = useState(false);
    const [passTarget, setPassTarget] = useState<AdminProfile | null>(null);
    const [newPassValue, setNewPassValue] = useState("");
    const [showPass, setShowPass] = useState(false);
    const [isSavingPass, setIsSavingPass] = useState(false);

    // Delete dialog
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<AdminProfile | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const fetchAdmins = async () => {
        try {
            const snap = await getDocs(collection(db, "admins"));
            setAdmins(snap.docs.map(d => ({ ...d.data(), uid: d.id }) as AdminProfile));
        } catch (err) {
            console.error("Error fetching admins:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchAdmins(); }, []);

    const handleCreate = async () => {
        setCreateError("");
        if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) {
            setCreateError("Please fill in all fields.");
            return;
        }
        if (newPassword.length < 6) {
            setCreateError("Password must be at least 6 characters.");
            return;
        }
        setIsCreating(true);
        try {
            const res = await authFetch("/api/admin/create-admin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: newEmail, password: newPassword, displayName: newName }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create admin");

            // Firestore docs are now created atomically in the API route.
            toast.success(`Admin "${newName}" created successfully!`);
            setIsCreateOpen(false);
            setNewName(""); setNewEmail(""); setNewPassword("");
            fetchAdmins();
        } catch (err: any) {
            setCreateError(err.message || "Something went wrong");
        } finally {
            setIsCreating(false);
        }
    };

    const handleChangePassword = async () => {
        if (!passTarget) return;
        if (newPassValue.length < 6) {
            toast.error("Password must be at least 6 characters.");
            return;
        }
        setIsSavingPass(true);
        try {
            const res = await authFetch("/api/admin/update-user-credentials", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ uid: passTarget.uid, newPassword: newPassValue }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to update password");
            toast.success(`Password updated for ${passTarget.displayName}`);
            setIsPassOpen(false);
            setPassTarget(null);
            setNewPassValue("");
        } catch (err: any) {
            toast.error(err.message || "Failed to update password");
        } finally {
            setIsSavingPass(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        try {
            // Step 1: Remove from Firebase Auth — revokes login immediately
            const res = await authFetch("/api/admin/delete-user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ uid: deleteTarget.uid }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to remove login access");

            // Step 2: Remove Firestore docs
            await deleteDoc(doc(db, "admins", deleteTarget.uid));
            await deleteDoc(doc(db, "users", deleteTarget.uid));

            toast.success(`Admin "${deleteTarget.displayName}" deleted`);
            setIsDeleteOpen(false);
            setDeleteTarget(null);
            fetchAdmins();
        } catch (err: any) {
            toast.error(err.message || "Failed to delete admin");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10 flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gold/20 flex items-center justify-center">
                            <UserCog className="w-6 h-6 text-gold" />
                        </div>
                        <div>
                            <p className="text-white/50 text-sm font-medium">Admin Panel</p>
                            <h1 className="text-2xl md:text-3xl font-bold text-white">Manage Admins</h1>
                            <p className="text-white/40 text-sm mt-1">Create and manage secondary admin accounts</p>
                        </div>
                    </div>
                    <button
                        onClick={() => { setCreateError(""); setIsCreateOpen(true); }}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gold text-navy font-semibold text-sm hover:bg-gold/90 transition-all shrink-0 shadow-md"
                    >
                        <Plus className="w-4 h-4" /> Add Admin
                    </button>
                </div>
            </div>

            {/* Info Box */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                    <p className="text-sm font-semibold text-amber-800">Full Admin Access</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                        Secondary admins created here will have <strong>full access</strong> to the admin panel — all pages, all data.
                        Only create accounts for trusted staff members.
                    </p>
                </div>
            </div>

            {/* Admins Table */}
            <Card className="border-border/50 shadow-sm">
                <CardHeader className="bg-muted/20 border-b pb-4">
                    <CardTitle>All Admins</CardTitle>
                    <CardDescription>
                        These accounts have full access to the admin panel at <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">/admin/login</span>
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-14 gap-2 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin" /> Loading...
                        </div>
                    ) : admins.length === 0 ? (
                        <div className="py-16 text-center text-muted-foreground">
                            <UserCog className="h-12 w-12 mx-auto mb-4 opacity-20" />
                            <p className="font-medium">No secondary admins yet</p>
                            <p className="text-sm mt-1">Click "Add Admin" to create the first secondary admin account.</p>
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
                                    {admins.map(admin => (
                                        <tr key={admin.uid} className="hover:bg-muted/10 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-full bg-navy/10 flex items-center justify-center shrink-0">
                                                        <span className="text-navy font-bold text-sm">
                                                            {admin.displayName?.charAt(0).toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <span className="font-semibold text-navy">{admin.displayName}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-muted-foreground">
                                                <div className="flex items-center gap-1.5">
                                                    <Mail className="w-3.5 h-3.5" />
                                                    {admin.email}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-muted-foreground text-xs">
                                                {admin.createdAt ? new Date(admin.createdAt).toLocaleDateString("en-IN") : "—"}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => { setPassTarget(admin); setNewPassValue(""); setShowPass(false); setIsPassOpen(true); }}
                                                        className="text-blue-600 border-blue-200 hover:bg-blue-50 text-xs"
                                                    >
                                                        <KeyRound className="h-3 w-3 mr-1" /> Change Password
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                                                        onClick={() => { setDeleteTarget(admin); setIsDeleteOpen(true); }}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Create Admin Dialog */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Admin Account</DialogTitle>
                        <DialogDescription>
                            This admin will have full access to the admin panel. Share credentials securely.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label>Full Name</Label>
                            <Input placeholder="e.g. Ravi Kumar" value={newName} onChange={e => setNewName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Email Address</Label>
                            <Input type="email" placeholder="admin@school.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Password</Label>
                            <div className="relative">
                                <Input
                                    type={showNewPass ? "text" : "password"}
                                    placeholder="Minimum 6 characters"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    className="pr-10"
                                />
                                <button type="button" onClick={() => setShowNewPass(p => !p)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                        {createError && (
                            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{createError}</p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreate} disabled={isCreating}>
                            {isCreating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</> : "Create Admin"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Change Password Dialog */}
            <Dialog open={isPassOpen} onOpenChange={setIsPassOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Change Password — {passTarget?.displayName}</DialogTitle>
                        <DialogDescription>
                            Set a new password for this admin account. They will need to use the new password next time they log in.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-2">
                        <Label>New Password</Label>
                        <div className="relative">
                            <Input
                                type={showPass ? "text" : "password"}
                                placeholder="Minimum 6 characters"
                                value={newPassValue}
                                onChange={e => setNewPassValue(e.target.value)}
                                className="pr-10"
                            />
                            <button type="button" onClick={() => setShowPass(p => !p)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPassOpen(false)}>Cancel</Button>
                        <Button onClick={handleChangePassword} disabled={isSavingPass}>
                            {isSavingPass ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : "Save Password"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Dialog */}
            <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Admin Account</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete <strong>{deleteTarget?.displayName}</strong>?
                            This will permanently remove their login access. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                            {isDeleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</> : "Yes, Delete Admin"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
