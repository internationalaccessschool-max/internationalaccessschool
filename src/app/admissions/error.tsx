"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Admissions Page Error:", error);
    }, [error]);

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center">
            <h2 className="text-2xl font-bold text-red-600 mb-4">Something went wrong!</h2>
            <p className="text-gray-600 mb-6 max-w-md bg-gray-100 p-4 rounded-lg font-mono text-sm">
                {error.message || "Unknown error occurred"}
            </p>
            <Button onClick={() => reset()} variant="outline">
                Try again
            </Button>
        </div>
    );
}
