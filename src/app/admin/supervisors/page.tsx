"use client";

import toast from "react-hot-toast";
import { useState, useEffect } from "react";
import {
    collection, doc, getDocs, setDoc, deleteDoc, updateDoc, getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { SupervisorProfile } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { ShieldCheck, Plus, Trash2, Settings2, Loader2, CheckSquare, Square } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

// All pages a supervisor can potentially access — sections match /supervisor sidebar exactly
const ALL_PAGES: { label: string; path: string; section: string }[] = [
    // ── Overview ─────────────────────────────────────────────────
    { label: "Dashboard", path: "/supervisor", section: "Overview" },

    // ── Management ───────────────────────────────────────────────
    { label: "Students", path: "/supervisor/students", section: "Management" },
    { label: "Promote / Transfer", path: "/supervisor/promote", section: "Management" },
    { label: "Teachers", path: "/supervisor/teachers", section: "Management" },
    { label: "Manage Subjects", path: "/supervisor/subjects", section: "Management" },
    { label: "Class Teachers", path: "/supervisor/class-teacher", section: "Management" },
    { label: "Classes", path: "/supervisor/classes", section: "Management" },
    { label: "Timetable", path: "/supervisor/timetable", section: "Management" },
    { label: "Attendance", path: "/supervisor/attendance", section: "Management" },
    { label: "Teacher Attendance", path: "/supervisor/teacher-attendance", section: "Management" },
    { label: "Applications", path: "/supervisor/applications", section: "Management" },
    { label: "Admissions", path: "/supervisor/admissions", section: "Management" },

    // ── Finance ───────────────────────────────────────────────────
    { label: "Fee Overview", path: "/supervisor/fees", section: "Finance" },
    { label: "Transport", path: "/supervisor/transport", section: "Finance" },
    { label: "Teacher Salary", path: "/supervisor/teacher-salary", section: "Finance" },

    // ── Content ──────────────────────────────────────────────────
    { label: "Hero Slider", path: "/supervisor/hero", section: "Content" },
    { label: "Academics Page", path: "/supervisor/academics", section: "Content" },
    { label: "Homework", path: "/supervisor/homework", section: "Content" },
    { label: "Notices", path: "/supervisor/notices", section: "Content" },
    { label: "Gallery", path: "/supervisor/gallery", section: "Content" },

    // ── Examinations ─────────────────────────────────────────────
    { label: "Exams", path: "/supervisor/exams", section: "Examinations" },
    { label: "Class Subjects", path: "/supervisor/class-subjects", section: "Examinations" },
    { label: "Marks Entry", path: "/supervisor/results/entry", section: "Examinations" },
];

const SECTIONS = ["Overview", "Management", "Finance", "Content", "Examinations"];


export default function AdminSupervisorsPage() {
    const [supervisors, setSupervisors] = useState<SupervisorProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Create dialog
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newEmail, setNewEmail] = useState("");
    const [newName, setNewName] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    // Permissions dialog
    const [isPermOpen, setIsPermOpen] = useState(false);
    const [editingSupervisor, setEditingSupervisor] = useState<SupervisorProfile | null>(null);
    const [selectedPages, setSelectedPages] = useState<string[]>([]);
    const [isSavingPerm, setIsSavingPerm] = useState(false);

    const fetchSupervisors = async () => {
        try {
            const snap = await getDocs(collection(db, "supervisors"));
            setSupervisors(snap.docs.map(d => ({ ...d.data(), uid: d.id }) as SupervisorProfile));
        } catch (err) {
            console.error("Error fetching supervisors:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchSupervisors(); }, []);

    const handleCreate = async () => {
        if (!newEmail.trim() || !newName.trim() || !newPassword.trim()) {
            toast.error("Please fill all fields.");
            return;
        }
        if (newPassword.length < 6) {
            toast.error("Password must be at least 6 characters.");
            return;
        }
        setIsCreating(true);
        try {
            // Call admin API to create user in Firebase Auth
            const res = await authFetch("/api/admin/create-supervisor", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: newEmail, password: newPassword, displayName: newName }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create supervisor");

            const uid = data.uid;
            // Create users doc
            await setDoc(doc(db, "users", uid), {
                role: "supervisor",
                email: newEmail,
                displayName: newName,
                createdAt: Date.now(),
            });
            // Create supervisors doc with empty permissions
            await setDoc(doc(db, "supervisors", uid), {
                uid,
                email: newEmail,
                displayName: newName,
                allowedPages: ["/supervisor"], // Dashboard always allowed
                createdAt: Date.now(),
            });

            toast.success(`Supervisor "${newName}" created! You can now assign permissions.`);
            setIsCreateOpen(false);
            setNewEmail(""); setNewName(""); setNewPassword("");
            fetchSupervisors();
        } catch (err: any) {
            console.error("Create error:", err);
            toast.error("Error: " + err.message);
        } finally {
            setIsCreating(false);
        }
    };

    const openPermissions = (sup: SupervisorProfile) => {
        setEditingSupervisor(sup);
        setSelectedPages(sup.allowedPages || ["/supervisor"]);
        setIsPermOpen(true);
    };

    const togglePage = (path: string) => {
        if (path === "/supervisor") return; // Dashboard always granted
        setSelectedPages(prev =>
            prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
        );
    };

    const toggleSection = (section: string) => {
        const sectionPaths = ALL_PAGES.filter(p => p.section === section && p.path !== "/supervisor").map(p => p.path);
        const allSelected = sectionPaths.every(p => selectedPages.includes(p));
        if (allSelected) {
            setSelectedPages(prev => prev.filter(p => !sectionPaths.includes(p)));
        } else {
            setSelectedPages(prev => [...new Set([...prev, ...sectionPaths])]);
        }
    };

    const handleSavePermissions = async () => {
        if (!editingSupervisor) return;
        setIsSavingPerm(true);
        try {
            await updateDoc(doc(db, "supervisors", editingSupervisor.uid), {
                allowedPages: selectedPages,
                updatedAt: Date.now(),
            });
            toast.success("Permissions saved!");
            setIsPermOpen(false);
            fetchSupervisors();
        } catch (err: any) {
            toast.error("Error: " + err.message);
        } finally {
            setIsSavingPerm(false);
        }
    };

    const handleDelete = async (sup: SupervisorProfile) => {
        if (!window.confirm(`Delete supervisor "${sup.displayName}"?\n\nThis will permanently remove their login access.`)) return;
        try {
            // Step 1: Remove from Firebase Auth first
            const res = await authFetch("/api/admin/delete-user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ uid: sup.uid }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(`Could not remove login access: ${data.error}`);
            }
            // Step 2: Remove Firestore docs only after Auth is cleared
            await deleteDoc(doc(db, "supervisors", sup.uid));
            await deleteDoc(doc(db, "users", sup.uid));
            fetchSupervisors();
        } catch (err: any) {
            toast.error("Error deleting supervisor: " + err.message);
        }
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <ShieldCheck className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Supervisors</h1>
                        <p className="text-muted-foreground">Create supervisor accounts and manage their page access</p>
                    </div>
                </div>
                <Button onClick={() => setIsCreateOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Add Supervisor
                </Button>
            </div>

            <Card className="border-border/50 shadow-sm">
                <CardHeader className="bg-muted/20 border-b pb-4">
                    <CardTitle>All Supervisors</CardTitle>
                    <CardDescription>Click "Permissions" to control which pages each supervisor can access.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin" /> Loading...
                        </div>
                    ) : supervisors.length === 0 ? (
                        <div className="py-16 text-center text-muted-foreground">
                            <ShieldCheck className="h-12 w-12 mx-auto mb-4 opacity-20" />
                            <p>No supervisors yet. Add one to get started.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left min-w-[600px]">
                                <thead className="text-xs text-muted-foreground uppercase bg-muted/30 border-b">
                                    <tr>
                                        <th className="px-6 py-4 font-medium">Name</th>
                                        <th className="px-6 py-4 font-medium">Email</th>
                                        <th className="px-6 py-4 font-medium">Pages Allowed</th>
                                        <th className="px-6 py-4 font-medium text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {supervisors.map(sup => (
                                        <tr key={sup.uid} className="hover:bg-muted/10 transition-colors">
                                            <td className="px-6 py-4 font-semibold">{sup.displayName}</td>
                                            <td className="px-6 py-4 text-muted-foreground">{sup.email}</td>
                                            <td className="px-6 py-4">
                                                <Badge variant="secondary">{(sup.allowedPages || []).length} pages</Badge>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button variant="outline" size="sm" onClick={() => openPermissions(sup)}
                                                        className="text-blue-600 border-blue-300 hover:bg-blue-50">
                                                        <Settings2 className="h-3 w-3 mr-1" /> Permissions
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(sup)}
                                                        className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50">
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

            {/* Create Supervisor Dialog */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create New Supervisor</DialogTitle>
                        <DialogDescription>This will create a login account for the supervisor.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label>Full Name</Label>
                            <Input placeholder="e.g. Ravi Kumar" value={newName} onChange={e => setNewName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Email</Label>
                            <Input type="email" placeholder="supervisor@school.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Password</Label>
                            <Input type="password" placeholder="Min 6 characters" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreate} disabled={isCreating}>
                            {isCreating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</> : "Create Supervisor"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Permissions Dialog */}
            <Dialog open={isPermOpen} onOpenChange={setIsPermOpen}>
                <DialogContent className="max-w-lg flex flex-col" style={{ maxHeight: "85vh" }}>
                    <DialogHeader className="shrink-0">
                        <DialogTitle>Permissions — {editingSupervisor?.displayName}</DialogTitle>
                        <DialogDescription>Select which pages this supervisor can access.</DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto py-4 space-y-5 pr-1">
                        {SECTIONS.map(section => {
                            const pages = ALL_PAGES.filter(p => p.section === section);
                            const nonDashboard = pages.filter(p => p.path !== "/supervisor");
                            const allSelected = nonDashboard.every(p => selectedPages.includes(p.path));
                            return (
                                <div key={section}>
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{section}</p>
                                        {nonDashboard.length > 0 && (
                                            <button onClick={() => toggleSection(section)}
                                                className="text-xs text-primary hover:underline">
                                                {allSelected ? "Deselect All" : "Select All"}
                                            </button>
                                        )}
                                    </div>
                                    <div className="space-y-1.5">
                                        {pages.map(page => {
                                            const isChecked = selectedPages.includes(page.path);
                                            const isLocked = page.path === "/supervisor";
                                            return (
                                                <button key={page.path} onClick={() => togglePage(page.path)}
                                                    disabled={isLocked}
                                                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors ${isChecked
                                                        ? "bg-primary/10 text-primary"
                                                        : "hover:bg-muted/50 text-foreground"} ${isLocked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}>
                                                    {isChecked
                                                        ? <CheckSquare className="h-4 w-4 shrink-0" />
                                                        : <Square className="h-4 w-4 shrink-0 text-muted-foreground" />}
                                                    {page.label}
                                                    {isLocked && <span className="ml-auto text-xs text-muted-foreground">Always On</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <DialogFooter className="shrink-0 border-t pt-4">
                        <Button variant="outline" onClick={() => setIsPermOpen(false)}>Cancel</Button>
                        <Button onClick={handleSavePermissions} disabled={isSavingPerm}>
                            {isSavingPerm ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : "Save Permissions"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
