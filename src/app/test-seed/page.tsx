"use client";

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useState } from "react";

export default function SeedPage() {
    const [status, setStatus] = useState("Ready");

    const seed = async () => {
        try {
            setStatus("Seeding...");
            await addDoc(collection(db, "notices"), {
                content: "Test Notice from Seeder",
                isActive: true,
                type: "info",
                priority: 10,
                createdAt: serverTimestamp()
            });
            setStatus("Success!");
        } catch (e) {
            console.error(e);
            if (e instanceof Error) {
                setStatus("Error: " + e.message);
            } else {
                setStatus("Error: An unknown error occurred");
            }
        }
    };

    return (
        <div className="p-10">
            <h1>Seeder</h1>
            <p>Status: {status}</p>
            <button onClick={seed} className="px-4 py-2 bg-blue-500 text-white rounded">
                Create Test Notice
            </button>
        </div>
    );
}
