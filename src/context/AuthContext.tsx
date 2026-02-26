"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

interface AuthContextType {
    user: User | null;
    role: string | null;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    role: null,
    loading: true,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [role, setRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setUser(user);
                // Set generic auth cookie
                document.cookie = "auth=true; path=/; max-age=86400";
                document.cookie = `email=${user.email}; path=/; max-age=86400`;

                // Fetch user role from Firestore
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (userDoc.exists()) {
                    const userRole = userDoc.data().role;
                    console.log("AuthContext: User role fetched:", userRole, "UID:", user.uid);
                    setRole(userRole);
                    document.cookie = `role=${userRole}; path=/; max-age=86400`;
                } else {
                    console.error("AuthContext: userDoc DOES NOT EXIST for UID:", user.uid);
                    setRole(null);
                    document.cookie = "role=; path=/; max-age=0"; // Clear role cookie
                }
            } else {
                setUser(null);
                setRole(null);
                document.cookie = "auth=; path=/; max-age=0"; // Clear auth cookie
                document.cookie = "email=; path=/; max-age=0"; // Clear email cookie
                document.cookie = "role=; path=/; max-age=0"; // Clear role cookie
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return (
        <AuthContext.Provider value={{ user, role, loading }}>
            {children}
        </AuthContext.Provider>
    );
};
