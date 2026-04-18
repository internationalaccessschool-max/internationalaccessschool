"use client";

import toast from "react-hot-toast";
import { useState, useEffect } from "react";
import { collection, addDoc, deleteDoc, doc, onSnapshot, serverTimestamp, query, orderBy, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CloudinaryUploadWidget } from "@/components/ui/cloudinary-upload-widget";
import { Trash2, Edit3, ImageIcon, Save, X, Loader2, Play, Youtube } from "lucide-react";
import Image from "next/image";

interface GalleryItem {
    id: string;
    url: string;
    caption?: string;
    type?: "image" | "video";
    videoId?: string;
    createdAt: any;
}

export default function GalleryAdminPage() {
    const [items, setItems] = useState<GalleryItem[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editCaption, setEditCaption] = useState("");
    const [savingId, setSavingId] = useState<string | null>(null);

    const [ytModalOpen, setYtModalOpen] = useState(false);
    const [ytUrl, setYtUrl] = useState("");
    const [addingYt, setAddingYt] = useState(false);

    useEffect(() => {
        const q = query(collection(db, "gallery"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GalleryItem)));
        });
        return () => unsubscribe();
    }, []);

    const handleUpload = async (url: string) => {
        try {
            await addDoc(collection(db, "gallery"), {
                url,
                type: "image",
                createdAt: serverTimestamp(),
                caption: ""
            });
        } catch (error) {
            console.error("Error adding image:", error);
            toast.error("Failed to save image reference");
        }
    };

    const extractYouTubeId = (url: string) => {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    };

    const handleAddYoutube = async () => {
        const videoId = extractYouTubeId(ytUrl);
        if (!videoId) {
            toast.error("Invalid YouTube URL. Please enter a valid link.");
            return;
        }

        setAddingYt(true);
        try {
            const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
            await addDoc(collection(db, "gallery"), {
                url: thumbnailUrl,
                type: "video",
                videoId: videoId,
                createdAt: serverTimestamp(),
                caption: ""
            });
            setYtModalOpen(false);
            setYtUrl("");
        } catch (error) {
            console.error("Error adding youtube video:", error);
            toast.error("Failed to save YouTube video");
        } finally {
            setAddingYt(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm("Delete this item from gallery?")) {
            await deleteDoc(doc(db, "gallery", id));
        }
    };

    const startEdit = (img: GalleryItem) => {
        setEditingId(img.id);
        setEditCaption(img.caption || "");
    };

    const saveCaption = async (id: string) => {
        setSavingId(id);
        try {
            await updateDoc(doc(db, "gallery", id), { caption: editCaption.trim() });
            setEditingId(null);
        } catch (err) {
            toast.error("Failed to update caption");
        } finally {
            setSavingId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-navy">Gallery Management</h1>
                    <p className="text-gray-500">Upload images and add YouTube videos.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setYtModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl font-semibold transition-colors border border-red-100 shadow-sm text-sm"
                    >
                        <Youtube className="w-5 h-5" />
                        Add YouTube Video
                    </button>
                    <CloudinaryUploadWidget onUpload={handleUpload} />
                </div>
            </div>

            {/* YouTube Modal */}
            {ytModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setYtModalOpen(false)}></div>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md relative z-10 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-navy flex items-center gap-2">
                                <Youtube className="w-5 h-5 text-red-500" />
                                Add YouTube Video
                            </h2>
                            <button onClick={() => setYtModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">YouTube URL</label>
                                <input
                                    type="url"
                                    value={ytUrl}
                                    onChange={(e) => setYtUrl(e.target.value)}
                                    placeholder="https://www.youtube.com/watch?v=..."
                                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all text-sm"
                                    autoFocus
                                    onKeyDown={(e) => e.key === "Enter" && handleAddYoutube()}
                                />
                                <p className="text-xs text-gray-500 mt-2">Paste the full URL or "youtu.be" shortlink.</p>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    onClick={() => setYtModalOpen(false)}
                                    className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddYoutube}
                                    disabled={!ytUrl || addingYt}
                                    className="flex items-center gap-2 px-5 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
                                >
                                    {addingYt ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    {addingYt ? "Adding..." : "Add Video"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {items.map((img) => (
                    <div key={img.id} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 flex flex-col">
                        <div className="relative aspect-[4/3] bg-gray-50 group">
                            <Image
                                src={img.url}
                                alt={img.caption || "Gallery"}
                                fill
                                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                                className="object-cover transition-transform duration-500 group-hover:scale-105"
                            />

                            {/* Video Play Icon Indicator */}
                            {img.type === "video" && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="w-12 h-12 bg-red-600/90 rounded-full flex items-center justify-center shadow-lg backdrop-blur-sm transition-transform group-hover:scale-110">
                                        <Play className="w-5 h-5 text-white ml-1" fill="currentColor" />
                                    </div>
                                </div>
                            )}

                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                <button onClick={() => startEdit(img)} className="w-10 h-10 bg-white/10 hover:bg-white text-white hover:text-navy backdrop-blur-md rounded-full flex items-center justify-center transition-all">
                                    <Edit3 className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDelete(img.id)} className="w-10 h-10 bg-white/10 hover:bg-red-500 text-white backdrop-blur-md rounded-full flex items-center justify-center transition-all">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="p-4 flex-1 flex flex-col justify-between bg-white z-10">
                            {editingId === img.id ? (
                                <div className="space-y-2">
                                    <input
                                        autoFocus
                                        value={editCaption}
                                        onChange={e => setEditCaption(e.target.value)}
                                        placeholder="Enter caption..."
                                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-navy"
                                        onKeyDown={(e) => e.key === "Enter" && saveCaption(img.id)}
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={() => saveCaption(img.id)} disabled={savingId === img.id} className="flex-1 py-1.5 bg-navy text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1 hover:bg-navy/90">
                                            {savingId === img.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
                                        </button>
                                        <button onClick={() => setEditingId(null)} className="px-3 py-1.5 bg-gray-100 text-gray-500 text-xs font-semibold rounded-lg hover:bg-gray-200">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm font-medium text-navy line-clamp-2">
                                    {img.caption || <span className="text-gray-400 italic">No caption set</span>}
                                </p>
                            )}
                        </div>
                    </div>
                ))}

                {items.length === 0 && (
                    <div className="col-span-full py-16 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-3xl bg-gray-50/50">
                        <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4">
                            <ImageIcon className="w-8 h-8 opacity-40 text-navy" />
                        </div>
                        <h3 className="text-lg font-semibold text-navy mb-1">Gallery is Empty</h3>
                        <p className="text-sm">Upload some photos or add videos to showcase your campus.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
