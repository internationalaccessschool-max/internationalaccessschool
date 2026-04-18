import { Loader2 } from "lucide-react";

export default function Loading() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
            <div className="relative flex items-center justify-center w-20 h-20">
                <div className="absolute inset-0 rounded-full border-4 border-navy/10 animate-ping opacity-20"></div>
                <div className="w-16 h-16 bg-navy rounded-2xl flex items-center justify-center shadow-lg animate-pulse">
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                </div>
            </div>
            <p className="text-sm font-semibold text-navy/60 animate-pulse tracking-widest uppercase">
                Loading...
            </p>
        </div>
    );
}
