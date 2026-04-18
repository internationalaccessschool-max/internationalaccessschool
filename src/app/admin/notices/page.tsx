"use client";

import toast from "react-hot-toast";
import { useState, useEffect } from "react";
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AlertTriangle, Check, Info, Megaphone, Plus, Trash2, X, Edit2 } from "lucide-react";

interface Notice {
    id: string;
    content: string;
    isActive: boolean;
    type: 'info' | 'warning' | 'urgent';
    priority: number;
}

export default function NoticesPage() {
    const [notices, setNotices] = useState<Notice[]>([]);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        content: "",
        isActive: true,
        type: "info" as 'info' | 'warning' | 'urgent',
        priority: 0
    });

    useEffect(() => {
        const q = query(collection(db, "notices"), orderBy("priority", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedNotices = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Notice));
            setNotices(fetchedNotices);
        });
        return () => unsubscribe();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingId) {
                await updateDoc(doc(db, "notices", editingId), {
                    content: formData.content,
                    isActive: formData.isActive,
                    type: formData.type,
                    priority: formData.priority,
                    updatedAt: serverTimestamp()
                });
            } else {
                await addDoc(collection(db, "notices"), {
                    content: formData.content,
                    isActive: formData.isActive,
                    type: formData.type,
                    priority: formData.priority,
                    createdAt: serverTimestamp()
                });
            }

            closeForm();
        } catch (error) {
            console.error("Error saving notice:", error);
            toast.error("Failed to save notice");
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm("Are you sure you want to delete this notice?")) {
            try {
                await deleteDoc(doc(db, "notices", id));
            } catch (error) {
                console.error("Error deleting notice:", error);
            }
        }
    };

    const handleEdit = (notice: Notice) => {
        setFormData({
            content: notice.content,
            isActive: notice.isActive,
            type: notice.type,
            priority: notice.priority
        });
        setEditingId(notice.id);
        setIsFormOpen(true);
    };

    const toggleStatus = async (notice: Notice) => {
        try {
            await updateDoc(doc(db, "notices", notice.id), {
                isActive: !notice.isActive
            });
        } catch (error) {
            console.error("Error updating status:", error);
        }
    };

    const closeForm = () => {
        setIsFormOpen(false);
        setEditingId(null);
        setFormData({ content: "", isActive: true, type: "info", priority: 0 });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-navy">Manage Notices</h1>
                    <p className="text-gray-500">Add, edit, and organize scrolling news updates.</p>
                </div>
                <button
                    onClick={() => setIsFormOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-navy text-white rounded-lg hover:bg-navy-light transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    <span>Add Notice</span>
                </button>
            </div>

            {/* List of Notices */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
                <table className="w-full min-w-[700px]">
                    <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                            <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Content</th>
                            <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                            <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Priority</th>
                            <th className="text-right px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {notices.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                                    No notices found. Create one to get started.
                                </td>
                            </tr>
                        ) : noticeList(notices)}
                    </tbody>
                </table>
            </div>

            {/* Add/Edit Modal */}
            {isFormOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-navy">
                                {editingId ? "Edit Notice" : "New Notice"}
                            </h2>
                            <button onClick={closeForm} className="p-2 hover:bg-gray-100 rounded-lg">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                                <textarea
                                    required
                                    rows={3}
                                    value={formData.content}
                                    onChange={e => setFormData({ ...formData, content: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy"
                                    placeholder="Enter the notice text..."
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                                    <select
                                        value={formData.type}
                                        onChange={e => setFormData({ ...formData, type: e.target.value as any })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy"
                                    >
                                        <option value="info">Info (Blue)</option>
                                        <option value="warning">Warning (Yellow)</option>
                                        <option value="urgent">Urgent (Red)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                                    <input
                                        type="number"
                                        value={formData.priority}
                                        onChange={e => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-2 pt-2">
                                <input
                                    type="checkbox"
                                    id="isActive"
                                    checked={formData.isActive}
                                    onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                                    className="w-4 h-4 text-navy rounded border-gray-300 focus:ring-navy"
                                />
                                <label htmlFor="isActive" className="text-sm text-gray-700 font-medium">
                                    Set as Active
                                </label>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={closeForm}
                                    className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2 bg-navy text-white rounded-lg hover:bg-navy-light font-medium"
                                >
                                    {editingId ? "Update" : "Create"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );

    function noticeList(items: Notice[]) {
        return items.map((notice) => (
            <tr key={notice.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-6 py-4">
                    <button
                        onClick={() => toggleStatus(notice)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${notice.isActive
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-gray-50 text-gray-500 border-gray-200"
                            }`}
                    >
                        {notice.isActive ? (
                            <>
                                <Check className="w-3 h-3" /> Active
                            </>
                        ) : (
                            <>
                                <X className="w-3 h-3" /> Inactive
                            </>
                        )}
                    </button>
                </td>
                <td className="px-6 py-4">
                    <p className="text-sm font-medium text-navy line-clamp-1">{notice.content}</p>
                </td>
                <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                        {notice.type === 'urgent' && <AlertTriangle className="w-4 h-4 text-red-500" />}
                        {notice.type === 'warning' && <AlertTriangle className="w-4 h-4 text-yellow-500" />}
                        {notice.type === 'info' && <Info className="w-4 h-4 text-blue-500" />}
                        <span className="text-sm text-gray-600 capitalize">{notice.type}</span>
                    </div>
                </td>
                <td className="px-6 py-4">
                    <span className="text-sm text-gray-600">{notice.priority}</span>
                </td>
                <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                        <button
                            onClick={() => handleEdit(notice)}
                            className="p-2 text-gray-400 hover:text-navy hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => handleDelete(notice.id)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </td>
            </tr>
        ));
    }
}
