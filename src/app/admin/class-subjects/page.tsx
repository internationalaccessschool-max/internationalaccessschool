"use client";

import toast from "react-hot-toast";
import { useState, useEffect } from "react";
import {
    doc, getDoc, setDoc,
    collectionGroup, getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, Save, Layers } from "lucide-react";

interface ClassSubjectEntry {
    id: string; // slug e.g. "math"
    name: string;
    type: "Core" | "Elective" | "Practical";
    maxMarks: number;
}

export default function ClassSubjectMappingPage() {
    // Helper: Safe string render
    const safeStr = (val: any): string => {
        if (!val) return "";
        if (typeof val === 'string') return val;
        if (typeof val === 'object') {
            return val.name || val.label || val.id || JSON.stringify(val);
        }
        return String(val);
    };
    const [allClasses, setAllClasses] = useState<string[]>([]);
    const [selectedClass, setSelectedClass] = useState("");
    const [subjects, setSubjects] = useState<ClassSubjectEntry[]>([]);
    const [isLoadingClasses, setIsLoadingClasses] = useState(true);
    const [isLoadingSubjects, setIsLoadingSubjects] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // New subject form
    const [newName, setNewName] = useState("");
    const [newType, setNewType] = useState<"Core" | "Elective" | "Practical">("Core");
    const [newMaxMarks, setNewMaxMarks] = useState(100);

    // Fetch all unique class names from student profiles
    useEffect(() => {
        const fetchClasses = async () => {
            try {
                const snap = await getDocs(collectionGroup(db, "profiles"));
                // Start with standard class order (NUR/LKG/UKG first, then 1-12)
                const order: Record<string, number> = { NUR: 0, LKG: 1, UKG: 2 };
                const classSet = new Set<string>(["NUR", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
                snap.docs.forEach(d => {
                    const data = d.data();
                    if (data.className) classSet.add(data.className);
                });
                const sorted = Array.from(classSet).sort((a, b) => {
                    const na = order[a.toUpperCase()] ?? (parseInt(a) || 99);
                    const nb = order[b.toUpperCase()] ?? (parseInt(b) || 99);
                    return na - nb;
                });
                setAllClasses(sorted);
            } catch (err) {
                console.error("Error fetching classes:", err);
                setAllClasses(["NUR", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
            } finally {
                setIsLoadingClasses(false);
            }
        };
        fetchClasses();
    }, []);

    // Load subjects for selected class
    useEffect(() => {
        if (!selectedClass) {
            setSubjects([]);
            return;
        }
        const fetchSubjects = async () => {
            setIsLoadingSubjects(true);
            try {
                const docRef = doc(db, "classSubjects", selectedClass);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    setSubjects((snap.data().subjects as ClassSubjectEntry[]) || []);
                } else {
                    setSubjects([]);
                }
            } catch (err) {
                console.error("Error fetching class subjects:", err);
            } finally {
                setIsLoadingSubjects(false);
            }
        };
        fetchSubjects();
    }, [selectedClass]);

    const handleAddSubject = () => {
        if (!newName.trim()) { toast.error("Enter a subject name."); return; }
        const id = newName.trim().toLowerCase().replace(/\s+/g, "_");
        if (subjects.find(s => s.id === id)) {
            toast.error("A subject with this name already exists for this class.");
            return;
        }
        setSubjects(prev => [...prev, { id, name: newName.trim(), type: newType, maxMarks: newMaxMarks }]);
        setNewName("");
        setNewType("Core");
        setNewMaxMarks(100);
    };

    const handleRemoveSubject = (id: string) => {
        setSubjects(prev => prev.filter(s => s.id !== id));
    };

    const handleSave = async () => {
        if (!selectedClass) { toast.error("Select a class first."); return; }
        setIsSaving(true);
        try {
            await setDoc(doc(db, "classSubjects", selectedClass), {
                className: selectedClass,
                subjects,
                updatedAt: Date.now(),
            });
            toast.success(`Subjects saved for ${selectedClass}!`);
        } catch (err: any) {
            console.error("Save error:", err);
            toast.error("Failed to save: " + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                    <Layers className="h-6 w-6 text-primary" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Class Subject Mapping</h1>
                    <p className="text-muted-foreground">Assign subjects per class with custom max marks</p>
                </div>
            </div>

            {/* Class selector */}
            <Card className="border-border/50 shadow-sm">
                <CardHeader className="bg-muted/20 border-b pb-4">
                    <CardTitle className="text-lg">Select Class</CardTitle>
                    <CardDescription>Choose a class to view or edit its subject list</CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                    {isLoadingClasses ? (
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading classes...
                        </div>
                    ) : (
                        <Select value={selectedClass} onValueChange={setSelectedClass}>
                            <SelectTrigger className="w-full md:w-64">
                                <SelectValue placeholder="Select a class..." />
                            </SelectTrigger>
                            <SelectContent>
                                {allClasses.map(cls => (
                                    <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </CardContent>
            </Card>

            {selectedClass && (
                <>
                    {/* Subject List */}
                    <Card className="border-border/50 shadow-sm">
                        <CardHeader className="bg-muted/20 border-b pb-4 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-lg">Subjects for {selectedClass}</CardTitle>
                                <CardDescription>These subjects will appear in result entry for this class</CardDescription>
                            </div>
                            <Button onClick={handleSave} disabled={isSaving} size="sm">
                                {isSaving
                                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                                    : <><Save className="mr-2 h-4 w-4" /> Save</>}
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0">
                            {isLoadingSubjects ? (
                                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                                    <Loader2 className="h-5 w-5 animate-spin" /> Loading subjects...
                                </div>
                            ) : subjects.length === 0 ? (
                                <div className="py-10 text-center text-muted-foreground text-sm">
                                    No subjects added yet. Use the form below to add subjects.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left min-w-[500px]">
                                        <thead className="text-xs text-muted-foreground uppercase bg-muted/30 border-b">
                                            <tr>
                                                <th className="px-6 py-3 font-medium">Subject Name</th>
                                                <th className="px-6 py-3 font-medium">Type</th>
                                                <th className="px-6 py-3 font-medium">Max Marks</th>
                                                <th className="px-6 py-3 font-medium text-right">Remove</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {subjects.map(sub => (
                                                <tr key={sub.id} className="hover:bg-muted/10">
                                                    <td className="px-6 py-3 font-medium">{safeStr(sub.name)}</td>
                                                    <td className="px-6 py-3">
                                                        <Badge variant={sub.type === "Core" ? "default" : sub.type === "Elective" ? "secondary" : "outline"}>
                                                            {safeStr(sub.type)}
                                                        </Badge>
                                                    </td>
                                                    <td className="px-6 py-3">{safeStr(sub.maxMarks)}</td>
                                                    <td className="px-6 py-3 text-right">
                                                        <Button variant="ghost" size="icon"
                                                            onClick={() => handleRemoveSubject(sub.id)}
                                                            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50">
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

                    {/* Add Subject Form */}
                    <Card className="border-border/50 shadow-sm">
                        <CardHeader className="bg-muted/20 border-b pb-4">
                            <CardTitle className="text-lg">Add New Subject</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <div className="flex flex-col md:flex-row gap-4 items-end">
                                <div className="space-y-2 flex-1">
                                    <Label>Subject Name</Label>
                                    <Input placeholder="e.g. Mathematics"
                                        value={newName} onChange={e => setNewName(e.target.value)}
                                        onKeyDown={e => e.key === "Enter" && handleAddSubject()} />
                                </div>
                                <div className="space-y-2 w-full md:w-40">
                                    <Label>Type</Label>
                                    <Select value={newType} onValueChange={(v: "Core" | "Elective" | "Practical") => setNewType(v)}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Core">Core</SelectItem>
                                            <SelectItem value="Elective">Elective</SelectItem>
                                            <SelectItem value="Practical">Practical</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2 w-full md:w-32">
                                    <Label>Max Marks</Label>
                                    <Input type="number" min={1} max={1000}
                                        value={newMaxMarks}
                                        onChange={e => setNewMaxMarks(Number(e.target.value))} />
                                </div>
                                <Button onClick={handleAddSubject} className="shrink-0">
                                    <Plus className="mr-2 h-4 w-4" /> Add
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}
