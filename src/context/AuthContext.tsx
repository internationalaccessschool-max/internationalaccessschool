"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { useRouter } from "next/navigation";

interface AuthContextType {
    user: User | null;
    role: string | null;
    status: string | null;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    role: null,
    status: null,
    loading: true,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [role, setRole] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        let unsubscribeDoc: () => void;

        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            if (user) {
                setUser(user);
                // Set generic auth cookie
                document.cookie = "auth=true; path=/; max-age=86400";
                document.cookie = `email=${user.email}; path=/; max-age=86400`;

                // Listen to user document in real-time to solve self-heal race conditions
                unsubscribeDoc = onSnapshot(doc(db, "users", user.uid), (userDoc) => {
                    if (userDoc.exists()) {
                        const userRole = userDoc.data().role;
                        const userStatus = userDoc.data().status || "ACTIVE";
                        setRole(userRole);
                        setStatus(userStatus);
                        document.cookie = `role=${userRole}; path=/; max-age=86400`;
                    } else {
                        console.warn("AuthContext: userDoc DOES NOT EXIST yet for UID:", user.uid);
                        setRole(null);
                        setStatus(null);
                        document.cookie = "role=; path=/; max-age=0";
                    }
                    setLoading(false);
                });
            } else {
                setUser(null);
                setRole(null);
                setStatus(null);
                document.cookie = "auth=; path=/; max-age=0";
                document.cookie = "email=; path=/; max-age=0";
                document.cookie = "role=; path=/; max-age=0";
                setLoading(false);
            }
        });

        return () => {
            unsubscribeAuth();
            if (unsubscribeDoc) unsubscribeDoc();
        };
    }, []);

    return (
        <AuthContext.Provider value={{ user, role, status, loading }}>
            {children}
        </AuthContext.Provider>
    );
};
