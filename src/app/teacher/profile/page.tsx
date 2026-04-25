"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { User, Mail, Phone, BookOpen, GraduationCap, Calendar, MapPin, Heart, Users, Briefcase, Building2 } from "lucide-react";
import { CloudinaryUpload } from "@/components/ui/cloudinary-upload";
import toast from "react-hot-toast";

export default function TeacherProfilePage() {
    const [userData, setUserData] = useState<any>(null);
    const [uid, setUid] = useState<string | null>(null);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const router = useRouter();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (userDoc.exists() && userDoc.data().role === "teacher") {
                    setUserData(userDoc.data());
                    setUid(user.uid);
                } else {
                    router.push("/login");
                }
            } else {
                router.push("/login");
            }
        });
        return () => unsubscribe();
    }, [router]);

    const handlePhotoUpload = async (url: string, _id: string, name?: string) => {
        if (!uid) return;
        setUploadingPhoto(true);
        try {
            await updateDoc(doc(db, "teachers", uid), { photoUrl: url, photoName: name ?? "" });
            await updateDoc(doc(db, "users", uid), { photoUrl: url, photoName: name ?? "" });
            setUserData((prev: any) => ({ ...prev, photoUrl: url, photoName: name ?? "" }));
            toast.success("Photo updated!");
        } catch {
            toast.error("Failed to save photo. Try again.");
        } finally {
            setUploadingPhoto(false);
        }
    };

    const handleRemovePhoto = async () => {
        if (!uid) return;
        try {
            await updateDoc(doc(db, "teachers", uid), { photoUrl: "", photoName: "" });
            await updateDoc(doc(db, "users", uid), { photoUrl: "", photoName: "" });
            setUserData((prev: any) => ({ ...prev, photoUrl: "", photoName: "" }));
            toast.success("Photo removed.");
        } catch {
            toast.error("Failed to remove photo.");
        }
    };

    const fmt = (v: any) => v || "—";

    const infoGroups = [
        {
            title: "Basic Information",
            items: [
                { icon: Mail, label: "Email", value: fmt(userData?.email) },
                { icon: Phone, label: "Phone", value: fmt(userData?.phone) },
                { icon: Briefcase, label: "Designation", value: fmt(userData?.designation) },
                { icon: BookOpen, label: "Subjects", value: userData?.subjects?.join(", ") || userData?.subject || "—" },
                { icon: GraduationCap, label: "Qualification", value: fmt(userData?.qualification) },
                { icon: Calendar, label: "Joining Date", value: fmt(userData?.joiningDate) },
            ],
        },
        {
            title: "Personal Details",
            items: [
                { icon: Calendar, label: "Date of Birth", value: fmt(userData?.dob) },
                { icon: User, label: "Gender", value: fmt(userData?.gender) },
                { icon: Heart, label: "Blood Group", value: fmt(userData?.bloodGroup) },
                { icon: Users, label: "Social Category", value: fmt(userData?.socialCategory) },
                { icon: User, label: "Father's Name", value: fmt(userData?.fatherName) },
                { icon: Phone, label: "Emergency Contact", value: fmt(userData?.emergencyContact) },
                { icon: MapPin, label: "Permanent Address", value: fmt(userData?.permanentAddress) },
            ],
        },
        {
            title: "Bank Details",
            items: [
                { icon: Building2, label: "Bank Name", value: fmt(userData?.bankName) },
                { icon: Building2, label: "Branch", value: fmt(userData?.branchName) },
                { icon: Building2, label: "Account Number", value: fmt(userData?.bankAccountNumber) },
                { icon: Building2, label: "IFSC Code", value: fmt(userData?.ifscCode) },
            ],
        },
    ];

    return (
        <div className="space-y-6">
            {/* Header Banner */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }}
                />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Teacher Portal</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">My Profile</h1>
                    <p className="text-white/40 text-sm mt-2">Your personal and professional information.</p>
                </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
                {/* Avatar Card */}
                <div className="md:col-span-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col items-center text-center">
                    {userData?.photoUrl ? (
                        <img
                            src={userData.photoUrl}
                            alt="Profile"
                            className="w-24 h-24 rounded-2xl object-cover border border-gray-200 shadow-sm mb-4"
                        />
                    ) : (
                        <div className="w-24 h-24 rounded-2xl bg-navy/10 flex items-center justify-center mb-4">
                            <span className="text-4xl font-bold text-navy/40">
                                {(userData?.firstName || "T").charAt(0).toUpperCase()}
                            </span>
                        </div>
                    )}

                    <h2 className="font-bold text-navy text-lg">
                        {userData ? `${userData.firstName || ""} ${userData.lastName || ""}`.trim() : "Teacher"}
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">{userData?.designation || userData?.subject || "Subject Teacher"}</p>
                    <span className="mt-3 px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-xs font-semibold">Active</span>

                    {/* Photo upload */}
                    <div className="mt-5 w-full">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Profile Photo</p>
                        {userData?.photoUrl ? (
                            <button
                                onClick={handleRemovePhoto}
                                className="w-full py-2 rounded-xl border border-red-200 text-xs font-medium text-red-500 hover:bg-red-50 transition-colors"
                            >
                                Remove Photo
                            </button>
                        ) : (
                            <CloudinaryUpload
                                folder="admin-docs"
                                subFolder="teacher-photos"
                                onUpload={handlePhotoUpload}
                                acceptedFileTypes="images"
                                maxSizeMB={1}
                            />
                        )}
                        {uploadingPhoto && <p className="text-xs text-gray-400 mt-1">Saving…</p>}
                    </div>
                </div>

                {/* Info Cards */}
                <div className="md:col-span-2 space-y-5">
                    {infoGroups.map(group => (
                        <div key={group.title} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                            <h2 className="font-bold text-navy text-sm uppercase tracking-wide mb-4 border-b border-gray-100 pb-2">{group.title}</h2>
                            <div className="grid sm:grid-cols-2 gap-3">
                                {group.items.map((item) => (
                                    <div key={item.label} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50">
                                        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center border border-gray-100 shrink-0 mt-0.5">
                                            <item.icon className="w-3.5 h-3.5 text-navy/50" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[10px] text-gray-400 uppercase tracking-wide">{item.label}</p>
                                            <p className="text-sm font-semibold text-navy break-words">{item.value}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
