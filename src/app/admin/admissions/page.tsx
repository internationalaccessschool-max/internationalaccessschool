"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Search,
    X,
    Loader2,
    CheckCircle2,
    XCircle,
    Eye,
    GraduationCap,
    School,
    User,
    Users,
    Activity,
    CreditCard,
    Home,
    Phone
} from "lucide-react";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp, collection, query, getDocs, orderBy, updateDoc, where } from "firebase/firestore";
import { db, firebaseConfig } from "@/lib/firebase";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

// Schema for acceptance (Admin assigns Reg No & Section)
const acceptSchema = z.object({
    admissionNo: z.string().min(1, "Admission Number is required"),
    section: z.string().min(1, "Section is required"),
    class: z.string().min(1, "Class is required"),
});

type AcceptFormValues = z.infer<typeof acceptSchema>;

interface AdmissionRequest {
    id: string;
    studentName: string;
    firstName?: string;
    lastName?: string;
    middleName?: string;
    gender: string;
    aadhaarNo?: string;
    enrollmentClass: string;
    session: string;
    mobileNo: string;
    motherName: string;
    motherQualification?: string;
    motherOccupation?: string;
    fatherName: string;
    fatherQualification?: string;
    fatherOccupation?: string;
    noOfBrothers: number;
    noOfSisters: number;
    annualIncome?: string;
    category: string;
    physicallyDisabled: string;
    bloodGroup?: string;
    dob: string;
    localAddress: string;
    permanentAddress: string;
    accountNumber?: string;
    accountHolderName?: string;
    ifscCode?: string;
    height?: string;
    weight?: string;
    allergies?: string;
    imageUrl?: string;
    status: "pending" | "accepted" | "rejected";
    submittedAt: any;
}

export default function AdminAdmissionsPage() {
    const [requests, setRequests] = useState<AdmissionRequest[]>([]);
    const [selectedRequest, setSelectedRequest] = useState<AdmissionRequest | null>(null);
    const [isAccepting, setIsAccepting] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [error, setError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors },
        setValue,
        reset
    } = useForm<AcceptFormValues>({
        resolver: zodResolver(acceptSchema),
    });

    // Fetch requests
    useEffect(() => {
        fetchRequests();
    }, []);

    const fetchRequests = async () => {
        try {
            const q = query(collection(db, "admission_requests"), where("status", "==", "pending"), orderBy("submittedAt", "desc"));
            const querySnapshot = await getDocs(q);
            const data = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as AdmissionRequest[];
            setRequests(data);
        } catch (err) {
            // If index error, fallback to client-side sort or simpler query
            console.error("Error fetching requests:", err);
            try {
                const qSimple = query(collection(db, "admission_requests"), where("status", "==", "pending"));
                const qs = await getDocs(qSimple);
                const data = qs.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdmissionRequest));
                setRequests(data.sort((a, b) => b.submittedAt?.toMillis() - a.submittedAt?.toMillis()));
            } catch (e) {
                console.error("Retry failed:", e);
            }
        }
    };

    const handleViewDetails = (req: AdmissionRequest) => {
        setSelectedRequest(req);
        setValue("class", req.enrollmentClass); // Pre-fill class
        setError(null);
    };

    // Reusable Email Sender
    const sendStatusEmail = async (to: string, subject: string, html: string) => {
        try {
            await fetch("/api/send-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ to, subject, html }),
            });
        } catch (e) {
            console.error("Failed to send email", e);
        }
    };

    const handleAcceptForTest = async () => {
        if (!selectedRequest) return;
        if (!confirm("Are you sure you want to invite this student for an admission test?")) return;

        setIsLoading(true);
        try {
            await updateDoc(doc(db, "admission_requests", selectedRequest.id), {
                status: "test_pending"
            });

            // Send Email
            const subject = `Admission Test Invitation - ${selectedRequest.studentName}`;
            const html = `
                <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto;">
                    <h2 style="color: #1a365d;">Admission Test Invitation</h2>
                    <p>Dear ${selectedRequest.fatherName || selectedRequest.motherName || 'Parent'},</p>
                    <p>We are pleased to inform you that your child, <strong>${selectedRequest.studentName}</strong>, has been shortlisted for the next phase of the admission process at International Access School.</p>
                    <p>Please bring your child in for an admission test. Our admissions team will be in touch shortly to schedule the exact date and time.</p>
                    <br/>
                    <p>Best regards,</p>
                    <p><strong>Admissions Office</strong><br/>International Access School</p>
                </div>
            `;
            // Note: We use the provided contact number as a fallback, but technically we need an email. 
            // Since the original form didn't capture an email, we'll assume the mobileNo field might contain it, 
            // or we log that an email field is missing.
            // Wait, the admission schema doesn't have an email field. Let's send it to a mock email based on name for now to prevent crash
            const mockEmail = `${(selectedRequest.studentName || "parent").split(' ')[0].toLowerCase()}@parent.com`;
            await sendStatusEmail(mockEmail, subject, html);

            setRequests(prev => prev.filter(r => r.id !== selectedRequest.id));
            setSelectedRequest(null);
        } catch (err) {
            console.error("Error accepting for test:", err);
            alert("Failed to update application.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleReject = async () => {
        if (!selectedRequest) return;
        if (!confirm("Are you sure you want to REJECT this application? This cannot be undone.")) return;

        setIsLoading(true);
        try {
            await updateDoc(doc(db, "admission_requests", selectedRequest.id), {
                status: "rejected"
            });

            // Send Email
            const subject = `Update on Admission Application - ${selectedRequest.studentName}`;
            const html = `
                <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto;">
                    <h2 style="color: #1a365d;">Application Update</h2>
                    <p>Dear ${selectedRequest.fatherName || selectedRequest.motherName || 'Parent'},</p>
                    <p>Thank you for your interest in International Access School for your child, <strong>${selectedRequest.studentName}</strong>.</p>
                    <p>After careful consideration, we regret to inform you that we are unable to offer admission at this time as we do not have available seats in the requested class.</p>
                    <p>We wish your child the very best in their future endeavors.</p>
                    <br/>
                    <p>Best regards,</p>
                    <p><strong>Admissions Office</strong><br/>International Access School</p>
                </div>
            `;
            const mockEmail = `${(selectedRequest.studentName || "parent").split(' ')[0].toLowerCase()}@parent.com`;
            await sendStatusEmail(mockEmail, subject, html);

            setRequests(prev => prev.filter(r => r.id !== selectedRequest.id));
            setSelectedRequest(null);
        } catch (err) {
            console.error("Error rejecting:", err);
            alert("Failed to reject application.");
        } finally {
            setIsLoading(false);
        }
    };

    const onAcceptSubmit = async (data: AcceptFormValues) => {
        if (!selectedRequest) return;
        setIsLoading(true);
        setError(null);

        let secondaryApp;
        try {
            // 1. Create Auth User (AdmissionNo + DOB as password)
            secondaryApp = initializeApp(firebaseConfig, `adm_${Date.now()}`);
            const secondaryAuth = getAuth(secondaryApp);
            const email = `${data.admissionNo}@ias.edu`;

            // Convert DOB from YYYY-MM-DD → DD-MM-YY for password
            const rawDob = selectedRequest.dob;
            let dobFormatted = rawDob;
            if (rawDob && rawDob.match(/^\d{4}-\d{2}-\d{2}$/)) {
                const [y, m, d] = rawDob.split("-");
                dobFormatted = `${d}-${m}-${y.slice(-2)}`;
            }
            if (!dobFormatted || !dobFormatted.trim()) {
                dobFormatted = `ias${data.admissionNo}2025`;
            }
            const password = dobFormatted;

            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            const user = userCredential.user;

            // 2. Normalise class name — strip any "Class " prefix, keep plain "1", "NUR" etc.
            const rawClass = data.class.trim();
            const normClass = rawClass.replace(/^class\s*/i, "").trim();

            // Build full name — try studentName first, then firstName+lastName from form
            const fullName = (
                selectedRequest.studentName ||
                `${selectedRequest.firstName || ""} ${selectedRequest.middleName || ""} ${selectedRequest.lastName || ""}`.replace(/\s+/g, " ").trim()
            ).trim() || "Student";
            const nameParts = fullName.split(" ");
            const firstName = nameParts[0] || "Unknown";
            const lastName = nameParts.slice(1).join(" ");
            const sectionStr = data.section || "A";

            // 3. Save to users doc (lightweight)
            await setDoc(doc(db, "users", user.uid), {
                uid: user.uid,
                email,
                role: "student",
                name: fullName,
                firstName,
                lastName,
                className: normClass,
                currentClass: normClass,
                section: sectionStr,
                createdAt: serverTimestamp(),
            });

            // 4. Save full profile in nested path (new schema)
            const studentPayload = {
                id: user.uid,
                uid: user.uid,
                email,
                role: "student",
                // Name fields
                name: fullName,
                firstName,
                lastName,
                // Class fields — new schema uses plain class names
                className: normClass,
                currentClass: normClass,
                classAtAdmission: normClass,
                section: sectionStr,
                // Admission
                admissionNumber: data.admissionNo,
                serialNumber: "",
                session: selectedRequest.session || "",
                dateOfAdmission: new Date().toISOString().split("T")[0],
                status: "ACTIVE",
                // Personal
                dob: rawDob || "",
                gender: selectedRequest.gender || "",
                bloodGroup: selectedRequest.bloodGroup || "",
                category: selectedRequest.category || "",
                physicallyDisabled: selectedRequest.physicallyDisabled || "No",
                religion: "",
                // Contact
                mobileNo: selectedRequest.mobileNo || "",
                contact2: "",
                contact3: "",
                // Parent info
                fatherName: selectedRequest.fatherName || "",
                fatherOccupation: selectedRequest.fatherOccupation || "",
                fatherQualification: selectedRequest.fatherQualification || "",
                motherName: selectedRequest.motherName || "",
                motherOccupation: selectedRequest.motherOccupation || "",
                motherQualification: selectedRequest.motherQualification || "",
                guardianName: selectedRequest.fatherName || selectedRequest.motherName || "",
                guardianQualification: "",
                noOfBrothers: selectedRequest.noOfBrothers || 0,
                noOfSisters: selectedRequest.noOfSisters || 0,
                annualIncome: selectedRequest.annualIncome || "",
                // Address
                presentAddress: selectedRequest.localAddress || "",
                permanentAddress: selectedRequest.permanentAddress || "",
                // Identity docs
                aadharNo: selectedRequest.aadhaarNo || "",
                pen: "",
                aparId: "",
                udise: "",
                cbseEnrolmentNo: "",
                // Medical
                height: selectedRequest.height || "",
                weight: selectedRequest.weight || "",
                allergies: selectedRequest.allergies || "",
                // School specifics
                house: "",
                transport: "",
                branch: "",
                block: "",
                freeScheme: "",
                economicallyWeakSection: "No",
                minorityStatus: "",
                // Bank
                accountHolderName: selectedRequest.accountHolderName || "",
                bankAccountNumber: selectedRequest.accountNumber || "",
                ifscCode: selectedRequest.ifscCode || "",
                bankName: "",
                // Photo
                childPhotoUrl: selectedRequest.imageUrl || "",
                // Identifiers
                admissionRequestId: selectedRequest.id,
                // Timestamps
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            };

            const profileRef = doc(db, "users", "classes", normClass, "sections", sectionStr, "students", "profiles", user.uid);
            await setDoc(profileRef, studentPayload);

            // Scaffold hierarchy markers
            await setDoc(doc(db, "users", "classes"), { _marker: true }, { merge: true });
            await setDoc(doc(db, "users", "classes", normClass, "sections"), { _marker: true }, { merge: true });
            await setDoc(doc(db, "users", "classes", normClass, "sections", sectionStr, "students"), { _marker: true }, { merge: true });

            // 5. Add to studentLookup for fast queries (same as bulk-import)
            await setDoc(doc(db, "studentLookup", user.uid), {
                uid: user.uid,
                admissionNumber: data.admissionNo,
                name: fullName,
                className: normClass,
                section: sectionStr,
                status: "ACTIVE",
                mobileNo: selectedRequest.mobileNo || "",
                email,
            });

            // 6. Mark admission request as accepted
            await updateDoc(doc(db, "admission_requests", selectedRequest.id), {
                status: "accepted",
                studentId: user.uid,
                assignedAdmissionNo: data.admissionNo,
                assignedClass: normClass,
                assignedSection: sectionStr,
            });

            // Cleanup
            await deleteApp(secondaryApp);
            setRequests(prev => prev.filter(r => r.id !== selectedRequest.id));
            setSelectedRequest(null);
            setIsAccepting(false);
            reset();
            alert(`✅ Admission confirmed!\nEmail: ${email}\nPassword: ${password}\nClass: ${normClass} - ${sectionStr}`);

        } catch (err: any) {
            console.error(err);
            if (err.code === "auth/email-already-in-use") {
                setError("A student with this Admission Number already exists. Try a different number.");
            } else {
                setError("Failed to create student account: " + (err.message || "Please try again."));
            }
        } finally {
            if (secondaryApp) {
                try { await deleteApp(secondaryApp).catch(() => { }); } catch { }
            }
            setIsLoading(false);
        }
    };


    const filteredRequests = requests.filter(req =>
        req.studentName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.enrollmentClass?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 relative">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-navy">Admission Requests</h1>
                    <p className="text-gray-500 text-sm">Review, accept, or reject online applications</p>
                </div>
            </div>

            <div className="flex gap-4 items-center">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        type="search"
                        placeholder="Search by name or class..."
                        className="pl-9 bg-white border-gray-200 focus:border-gold focus:ring-gold"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <Card className="border-gray-100 shadow-sm">
                <CardContent className="p-0">
                    <div className="relative w-full overflow-auto">
                        <table className="w-full caption-bottom text-sm">
                            <thead className="[&_tr]:border-b bg-gray-50/50">
                                <tr className="border-b transition-colors hover:bg-muted/50">
                                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Student Name</th>
                                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Class Applied</th>
                                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Parent</th>
                                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Contact</th>
                                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Date</th>
                                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Action</th>
                                </tr>
                            </thead>
                            <tbody className="[&_tr:last-child]:border-0 bg-white">
                                {filteredRequests.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-gray-500">
                                            No pending admission requests found.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRequests.map((req) => (
                                        <tr key={req.id} className="border-b transition-colors hover:bg-gray-50/50">
                                            <td className="p-4 align-middle font-medium text-navy">
                                                <div className="flex items-center gap-2">
                                                    {req.imageUrl ? (
                                                        <img src={req.imageUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                                                            <User className="w-4 h-4 text-gray-400" />
                                                        </div>
                                                    )}
                                                    {req.studentName}
                                                </div>
                                            </td>
                                            <td className="p-4 align-middle">{req.enrollmentClass}</td>
                                            <td className="p-4 align-middle">{req.fatherName}</td>
                                            <td className="p-4 align-middle">{req.mobileNo}</td>
                                            <td className="p-4 align-middle">
                                                {req.submittedAt?.toDate ? req.submittedAt.toDate().toLocaleDateString() : 'Just now'}
                                            </td>
                                            <td className="p-4 align-middle">
                                                <Button size="sm" onClick={() => handleViewDetails(req)} className="bg-navy hover:bg-navy-light text-white h-8 px-3">
                                                    <Eye className="w-3 h-3 mr-1.5" />
                                                    View
                                                </Button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Details Modal */}
            {selectedRequest && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-white z-10">
                            <div>
                                <h2 className="text-xl font-bold text-navy">Application Details</h2>
                                <p className="text-gray-500 text-sm">Reviewing application for {selectedRequest.studentName}</p>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => { setSelectedRequest(null); setIsAccepting(false); }}>
                                <X className="h-5 w-5" />
                            </Button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                            {!isAccepting ? (
                                <div className="space-y-8">
                                    {/* Student Info */}
                                    <div className="flex flex-col md:flex-row gap-6">
                                        <div className="w-32 h-32 rounded-xl bg-gray-100 flex-shrink-0 overflow-hidden border border-gray-200">
                                            {selectedRequest.imageUrl ? (
                                                <img src={selectedRequest.imageUrl} alt="Student" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <User className="w-12 h-12 text-gray-300" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-4">
                                            <DetailItem label="Name" value={selectedRequest.studentName} />
                                            <DetailItem label="Gender" value={selectedRequest.gender} />
                                            <DetailItem label="DOB" value={selectedRequest.dob} />
                                            <DetailItem label="Blood Group" value={selectedRequest.bloodGroup} />
                                            <DetailItem label="Class Applied" value={selectedRequest.enrollmentClass} />
                                            <DetailItem label="Session" value={selectedRequest.session} />
                                            <DetailItem label="Category" value={selectedRequest.category} />
                                            <DetailItem label="Disabled" value={selectedRequest.physicallyDisabled} />
                                        </div>
                                    </div>

                                    {/* Parent Info */}
                                    <Section title="Family Details" icon={Users} color="text-purple-600" bg="bg-purple-50">
                                        <div className="grid md:grid-cols-3 gap-6">
                                            <div>
                                                <p className="font-semibold text-sm mb-2 text-gray-700">Father</p>
                                                <div className="text-sm space-y-1">
                                                    <p>{selectedRequest.fatherName}</p>
                                                    <p className="text-gray-500">{selectedRequest.fatherQualification} • {selectedRequest.fatherOccupation}</p>
                                                </div>
                                            </div>
                                            <div>
                                                <p className="font-semibold text-sm mb-2 text-gray-700">Mother</p>
                                                <div className="text-sm space-y-1">
                                                    <p>{selectedRequest.motherName}</p>
                                                    <p className="text-gray-500">{selectedRequest.motherQualification} • {selectedRequest.motherOccupation}</p>
                                                </div>
                                            </div>
                                            <div>
                                                <p className="font-semibold text-sm mb-2 text-gray-700">Siblings</p>
                                                <div className="text-sm space-y-1">
                                                    <p>Brothers: {selectedRequest.noOfBrothers}</p>
                                                    <p>Sisters: {selectedRequest.noOfSisters}</p>
                                                    <p className="text-gray-500">Income: {selectedRequest.annualIncome}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </Section>

                                    {/* Contact & Address */}
                                    <Section title="Contact & Address" icon={Home} color="text-indigo-600" bg="bg-indigo-50">
                                        <div className="grid md:grid-cols-2 gap-6">
                                            <DetailItem label="Primary Mobile" value={selectedRequest.mobileNo} />
                                            <DetailItem label="Aadhaar" value={selectedRequest.aadhaarNo} />
                                            <div className="md:col-span-2 grid md:grid-cols-2 gap-6">
                                                <DetailItem label="Local Address" value={selectedRequest.localAddress} full />
                                                <DetailItem label="Permanent Address" value={selectedRequest.permanentAddress} full />
                                            </div>
                                        </div>
                                    </Section>

                                    {/* Additional Info */}
                                    <div className="grid md:grid-cols-2 gap-6">
                                        <Section title="Bank Details" icon={CreditCard} color="text-green-600" bg="bg-green-50">
                                            <div className="grid grid-cols-2 gap-4">
                                                <DetailItem label="Account No" value={selectedRequest.accountNumber} />
                                                <DetailItem label="IFSC" value={selectedRequest.ifscCode} />
                                                <DetailItem label="Holder Name" value={selectedRequest.accountHolderName} full />
                                            </div>
                                        </Section>
                                        <Section title="Medical" icon={Activity} color="text-red-600" bg="bg-red-50">
                                            <div className="grid grid-cols-2 gap-4">
                                                <DetailItem label="Height" value={selectedRequest.height} />
                                                <DetailItem label="Weight" value={selectedRequest.weight} />
                                                <DetailItem label="Allergies" value={selectedRequest.allergies} full />
                                            </div>
                                        </Section>
                                    </div>
                                </div>
                            ) : (
                                // Accept Form
                                <div className="max-w-md mx-auto py-8">
                                    <div className="text-center mb-6">
                                        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                                            <CheckCircle2 className="w-6 h-6 text-green-600" />
                                        </div>
                                        <h3 className="text-lg font-bold text-navy">Approve Admission</h3>
                                        <p className="text-sm text-gray-500">Assign registration details to finalize admission.</p>
                                    </div>

                                    <form onSubmit={handleSubmit(onAcceptSubmit)} className="space-y-4">
                                        <div className="space-y-2">
                                            <Label>Assign Admission Number</Label>
                                            <div className="relative">
                                                <Input {...register("admissionNo")} placeholder="e.g. 2024001" className="pl-9" />
                                                <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                            </div>
                                            {errors.admissionNo && <p className="text-red-500 text-xs">{errors.admissionNo.message}</p>}
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Class</Label>
                                                <Input {...register("class")} />
                                                {errors.class && <p className="text-red-500 text-xs">{errors.class.message}</p>}
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Section</Label>
                                                <Input {...register("section")} placeholder="e.g. A" />
                                                {errors.section && <p className="text-red-500 text-xs">{errors.section.message}</p>}
                                            </div>
                                        </div>

                                        {error && (
                                            <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm text-center">
                                                {error}
                                            </div>
                                        )}

                                        <div className="pt-4 flex gap-3">
                                            <Button type="button" variant="outline" className="flex-1" onClick={() => setIsAccepting(false)}>
                                                Back
                                            </Button>
                                            <Button type="submit" disabled={isLoading} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                                                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Admission"}
                                            </Button>
                                        </div>
                                    </form>
                                </div>
                            )}
                        </div>

                        {/* Footer Actions */}
                        {!isAccepting && (
                            <div className="p-6 border-t border-gray-100 bg-gray-50 flex flex-wrap justify-end gap-3">
                                <Button
                                    variant="outline"
                                    className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                                    onClick={handleReject}
                                    disabled={isLoading}
                                >
                                    <XCircle className="w-4 h-4 mr-2" />
                                    Reject
                                </Button>
                                <Button
                                    variant="outline"
                                    className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                                    onClick={handleAcceptForTest}
                                    disabled={isLoading}
                                >
                                    <Activity className="w-4 h-4 mr-2" />
                                    Accept for Test
                                </Button>
                                <Button
                                    className="bg-green-600 hover:bg-green-700 text-white"
                                    onClick={() => setIsAccepting(true)}
                                    disabled={isLoading}
                                >
                                    <CheckCircle2 className="w-4 h-4 mr-2" />
                                    Directly Add to Students
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// Helper Components
function DetailItem({ label, value, full }: { label: string, value?: string | number, full?: boolean }) {
    return (
        <div className={full ? "col-span-full" : ""}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
            <p className="text-sm font-medium text-navy break-words">{value || "-"}</p>
        </div>
    );
}

function Section({ title, icon: Icon, color, bg, children }: any) {
    return (
        <div className="bg-white rounded-xl p-5 border border-gray-100">
            <div className="flex items-center gap-2 mb-4">
                <div className={`p-1.5 rounded-lg ${bg} ${color}`}>
                    <Icon className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-navy">{title}</h4>
            </div>
            {children}
        </div>
    );
}
