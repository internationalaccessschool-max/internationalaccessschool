import { Loader2 } from "lucide-react";

export default function Loading() {
    return (
        <div className="w-full h-[60vh] flex flex-col items-center justify-center p-8">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-navy/10 flex items-center justify-center shadow-inner animate-pulse">
                    <Loader2 className="w-6 h-6 text-navy/40 animate-spin" />
                </div>
                <div className="space-y-2 flex flex-col items-center">
                    <div className="h-4 w-32 bg-gray-200 rounded-full animate-pulse"></div>
                    <div className="h-3 w-48 bg-gray-100 rounded-full animate-pulse"></div>
                </div>
            </div>
            {/* Fake Dashboard Skeleton layout to look like it's building up */}
            <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full opacity-40">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-24 bg-gray-50 border border-gray-100 rounded-2xl animate-pulse"></div>
                ))}
            </div>
        </div>
    );
}
