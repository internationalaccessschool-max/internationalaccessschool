"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Users, Edit, Trash2 } from "lucide-react";
import { useState } from "react";

// Mock Data
const MOCK_CLASSES = [
    { id: "1", name: "Class 10-A", teacher: "John Doe", students: 32 },
    { id: "2", name: "Class 10-B", teacher: "Jane Smith", students: 30 },
    { id: "3", name: "Class 9-A", teacher: "Alice Brown", students: 28 },
    { id: "4", name: "Class 9-B", teacher: "Bob White", students: 29 },
    { id: "5", name: "Class 1-A", teacher: "Mary Johnson", students: 25 },
];

export default function AdminClassesPage() {
    const [classes] = useState(MOCK_CLASSES);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">Manage Classes</h1>
                <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add New Class
                </Button>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {classes.map((cls) => (
                    <Card key={cls.id}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-lg font-medium">
                                {cls.name}
                            </CardTitle>
                            <Users className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="mt-2 space-y-1">
                                <p className="text-sm text-muted-foreground">Class Teacher: <span className="font-medium text-foreground">{cls.teacher}</span></p>
                                <p className="text-sm text-muted-foreground">Students: <span className="font-medium text-foreground">{cls.students}</span></p>
                            </div>
                            <div className="mt-4 flex gap-2">
                                <Button variant="outline" size="sm" className="w-full">
                                    <Edit className="mr-2 h-3 w-3" /> Edit
                                </Button>
                                <Button variant="destructive" size="sm" className="w-full">
                                    <Trash2 className="mr-2 h-3 w-3" /> Delete
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
