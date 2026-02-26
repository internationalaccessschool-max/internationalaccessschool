"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { FileText, ClipboardCheck, GraduationCap, Send, CheckCircle2, Upload, Loader2, User, Users, Home, CreditCard, Activity, Files } from "lucide-react";

// --- Schema Definition ---
const admissionSchema = z.object({
    // Student Details
    firstName: z.string().min(2, "First Name is required"),
    middleName: z.string().optional(),
    lastName: z.string().min(1, "Surname is required"),
    gender: z.string().min(1, "Gender is required"),
    aadhaarNo: z.string().min(12, "12-digit Aadhaar Number is required").max(12, "Aadhaar must be exactly 12 digits"),
    pen: z.string().optional(),
    aparId: z.string().optional(),
    enrollmentClass: z.string().min(1, "Class is required"),
    session: z.string().min(1, "Session is required"),
    mobileNo: z.string().min(10, "Valid Mobile Number is required"),

    // Mother's Details
    motherName: z.string().min(2, "Mother's Name is required"),
    motherQualification: z.string().optional(),
    motherOccupation: z.string().optional(),
    motherAadharNo: z.string().min(12, "12-digit Aadhaar is required").max(12, "Aadhaar must be exactly 12 digits"),

    // Father's Details
    fatherName: z.string().min(2, "Father's Name is required"),
    fatherQualification: z.string().optional(),
    fatherOccupation: z.string().optional(),
    fatherAadharNo: z.string().min(12, "12-digit Aadhaar is required").max(12, "Aadhaar must be exactly 12 digits"),

    // Family Details
    noOfBrothers: z.coerce.number().min(0),
    noOfSisters: z.coerce.number().min(0),
    annualIncome: z.string().optional(),

    // Category & Personal
    category: z.string().min(1, "Category is required"),
    physicallyDisabled: z.string().min(1, "Please select an option"),
    bloodGroup: z.string().optional(),
    dob: z.string().min(1, "Date of Birth is required"),

    // Address
    localAddress: z.string().min(5, "Local Address is required"),
    permanentAddress: z.string().min(5, "Permanent Address is required"),

    // Bank Details
    accountNumber: z.string().optional(),
    accountHolderName: z.string().optional(),
    ifscCode: z.string().optional(),

    // Medical Details
    height: z.string().optional(),
    weight: z.string().optional(),
    allergies: z.string().optional(),
});

type AdmissionFormData = z.infer<typeof admissionSchema>;

export default function AdmissionsPage() {
    const [submitted, setSubmitted] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // File Upload States
    const [childPhoto, setChildPhoto] = useState<File | null>(null);
    const [aparImage, setAparImage] = useState<File | null>(null);
    const [fatherAadharImage, setFatherAadharImage] = useState<File | null>(null);
    const [motherAadharImage, setMotherAadharImage] = useState<File | null>(null);

    const { register, handleSubmit, formState: { errors } } = useForm<AdmissionFormData>({
        resolver: zodResolver(admissionSchema) as any,
        defaultValues: {
            physicallyDisabled: "No",
            session: "2025-2026",
            noOfBrothers: 0,
            noOfSisters: 0,
        }
    });

    const onSubmit = async (data: AdmissionFormData) => {
        setIsLoading(true);
        try {
            const uploadFile = async (file: File | null, prefix: string) => {
                if (!file) return "";
                const storageRef = ref(storage, `admission_uploads/${Date.now()}_${prefix}_${file.name}`);
                const snapshot = await uploadBytes(storageRef, file);
                return await getDownloadURL(snapshot.ref);
            };

            const childPhotoUrl = await uploadFile(childPhoto, "child");
            const aparUrl = await uploadFile(aparImage, "apar");
            const fatherAadharUrl = await uploadFile(fatherAadharImage, "father");
            const motherAadharUrl = await uploadFile(motherAadharImage, "mother");

            // Save to Firestore
            await addDoc(collection(db, "admission_requests"), {
                ...data, // includes transformed numbers
                childPhotoUrl,
                aparUrl,
                fatherAadharUrl,
                motherAadharUrl,
                status: "pending",
                submittedAt: serverTimestamp(),
            });

            setSubmitted(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            console.error("Submission error:", err);
            alert("Failed to submit application. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col min-h-screen bg-off-white">
            <Navbar />

            {/* Hero */}
            <section className="relative pt-[72px]">
                <div className="bg-slate-900 gradient-navy py-20 md:py-28">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                        <span className="text-sm font-semibold uppercase tracking-wider text-gold">Join Us</span>
                        <h1 className="text-4xl md:text-5xl font-bold text-white mt-3">
                            Online <span className="text-gold">Admission</span>
                        </h1>
                        <p className="text-white/60 text-lg mt-4 max-w-xl mx-auto">
                            Secure your child&apos;s future at International Access School. Fill out the comprehensive form below.
                        </p>
                    </div>
                </div>
            </section>

            <main className="flex-1 section-padding">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">

                    {submitted ? (
                        <div className="bg-white rounded-3xl p-12 text-center shadow-lg border border-gray-100 animate-in fade-in zoom-in duration-500">
                            <div className="w-20 h-20 rounded-full bg-green-100 mx-auto flex items-center justify-center mb-6">
                                <CheckCircle2 className="w-10 h-10 text-green-600" />
                            </div>
                            <h2 className="text-3xl font-bold text-navy mb-4">Application Submitted Successfully!</h2>
                            <p className="text-gray-500 max-w-lg mx-auto mb-8">
                                Thank you for choosing International Access School. Your application reference ID has been generated.
                                We have sent a confirmation email to your registerd address. Our admissions team will review your details and contact you shortly.
                            </p>
                            <button
                                onClick={() => window.location.href = '/'}
                                className="px-8 py-3 bg-navy text-white rounded-xl font-semibold hover:bg-navy-light transition-all"
                            >
                                Return to Home
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

                            {/* 1. Student Details */}
                            <section className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
                                <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                                    <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                                        <User className="w-5 h-5" />
                                    </div>
                                    <h2 className="text-xl font-bold text-navy">Student Details</h2>
                                </div>

                                <div className="grid md:grid-cols-3 gap-6 mb-6">
                                    <FormInput label="First Name *" register={register("firstName")} error={errors.firstName} placeholder="First Name" />
                                    <FormInput label="Middle Name" register={register("middleName")} error={errors.middleName} placeholder="Middle Name" />
                                    <FormInput label="Surname / Last Name *" register={register("lastName")} error={errors.lastName} placeholder="Surname" />
                                </div>

                                <div className="grid md:grid-cols-2 gap-6">
                                    <FormSelect label="Gender *" register={register("gender")} error={errors.gender}>
                                        <option value="">Select Gender</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Other">Other</option>
                                    </FormSelect>

                                    <FormInput label="Aadhaar No *" register={register("aadhaarNo")} error={errors.aadhaarNo} placeholder="12-digit Aadhaar" />
                                    <FormInput label="PEN (Optional)" register={register("pen")} placeholder="Permanent Education Number" />
                                    <FormInput label="APAR ID (Optional)" register={register("aparId")} placeholder="APAR ID" />

                                    <FormSelect label="Enrollment For Class *" register={register("enrollmentClass")} error={errors.enrollmentClass}>
                                        <option value="">Select Class</option>
                                        {["Preschool", "Nursery", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"].map(c => (
                                            <option key={c} value={c}>Class {c}</option>
                                        ))}
                                    </FormSelect>

                                    <FormSelect label="Session *" register={register("session")} error={errors.session}>
                                        <option value="2025-2026">2025-2026</option>
                                        <option value="2026-2027">2026-2027</option>
                                    </FormSelect>

                                    <FormInput label="Mobile No *" register={register("mobileNo")} error={errors.mobileNo} placeholder="Primary Contact Number" />
                                </div>
                            </section>

                            {/* 2. Parent Details */}
                            <section className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
                                <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                                    <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                                        <Users className="w-5 h-5" />
                                    </div>
                                    <h2 className="text-xl font-bold text-navy">Parents&apos; Details</h2>
                                </div>
                                <div className="grid md:grid-cols-1 gap-8">
                                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                                        <div className="md:col-span-4 font-semibold text-gray-700 mb-1">Mother&apos;s Details</div>
                                        <FormInput label="Name *" register={register("motherName")} error={errors.motherName} />
                                        <FormInput label="Qualification" register={register("motherQualification")} />
                                        <FormInput label="Occupation" register={register("motherOccupation")} />
                                        <FormInput label="Aadhaar No *" register={register("motherAadharNo")} error={errors.motherAadharNo} />
                                    </div>
                                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 border-t border-gray-50 pt-6">
                                        <div className="md:col-span-4 font-semibold text-gray-700 mb-1">Father&apos;s Details</div>
                                        <FormInput label="Name *" register={register("fatherName")} error={errors.fatherName} />
                                        <FormInput label="Qualification" register={register("fatherQualification")} />
                                        <FormInput label="Occupation" register={register("fatherOccupation")} />
                                        <FormInput label="Aadhaar No *" register={register("fatherAadharNo")} error={errors.fatherAadharNo} />
                                    </div>
                                </div>
                            </section>

                            {/* 3. Document Uploads */}
                            <section className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
                                <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                                    <div className="p-2 bg-teal-50 rounded-lg text-teal-600">
                                        <Upload className="w-5 h-5" />
                                    </div>
                                    <h2 className="text-xl font-bold text-navy">Identity Documents (Upload)</h2>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                    <FileUploadCard label="Student Photo *" file={childPhoto} setFile={setChildPhoto} icon={User} />
                                    <FileUploadCard label="APAR (Optional)" file={aparImage} setFile={setAparImage} icon={Files} />
                                    <FileUploadCard label="Father Aadhaar *" file={fatherAadharImage} setFile={setFatherAadharImage} icon={FileText} />
                                    <FileUploadCard label="Mother Aadhaar *" file={motherAadharImage} setFile={setMotherAadharImage} icon={FileText} />
                                </div>
                            </section>

                            {/* 4. Category & Personal Information */}
                            <section className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
                                <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                                    <div className="p-2 bg-pink-50 rounded-lg text-pink-600">
                                        <Activity className="w-5 h-5" />
                                    </div>
                                    <h2 className="text-xl font-bold text-navy">Category & Personal Info</h2>
                                </div>
                                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    <FormSelect label="Category *" register={register("category")} error={errors.category}>
                                        <option value="">Select Category</option>
                                        <option value="General">General</option>
                                        <option value="OBC">OBC</option>
                                        <option value="SC">SC</option>
                                        <option value="ST">ST</option>
                                    </FormSelect>

                                    <FormSelect label="Physically Disabled *" register={register("physicallyDisabled")} error={errors.physicallyDisabled}>
                                        <option value="No">No</option>
                                        <option value="Yes">Yes</option>
                                    </FormSelect>

                                    <FormInput label="Blood Group" register={register("bloodGroup")} placeholder="e.g. O+" />
                                    <FormInput label="Date of Birth *" type="date" register={register("dob")} error={errors.dob} />
                                </div>
                            </section>

                            {/* 5. Address & Family */}
                            <div className="grid md:grid-cols-2 gap-8">
                                <section className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 h-full">
                                    <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                                        <div className="p-2 bg-orange-50 rounded-lg text-orange-600">
                                            <Users className="w-5 h-5" />
                                        </div>
                                        <h2 className="text-xl font-bold text-navy">Family Income & Siblings</h2>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormInput label="No. of Brothers" type="number" register={register("noOfBrothers")} />
                                        <FormInput label="No. of Sisters" type="number" register={register("noOfSisters")} />
                                        <div className="col-span-2">
                                            <FormInput label="Annual Income" register={register("annualIncome")} />
                                        </div>
                                    </div>
                                </section>

                                <section className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 h-full">
                                    <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                                        <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                                            <Home className="w-5 h-5" />
                                        </div>
                                        <h2 className="text-xl font-bold text-navy">Address Details</h2>
                                    </div>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-navy mb-1.5">Local Address *</label>
                                            <textarea {...register("localAddress")} rows={2} className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/30 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-colors resize-none" placeholder="Current address" />
                                            {errors.localAddress && <p className="text-xs text-red-500 mt-1">{errors.localAddress.message}</p>}
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-navy mb-1.5">Permanent Address *</label>
                                            <textarea {...register("permanentAddress")} rows={2} className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/30 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-colors resize-none" placeholder="Permanent address" />
                                            {errors.permanentAddress && <p className="text-xs text-red-500 mt-1">{errors.permanentAddress.message}</p>}
                                        </div>
                                    </div>
                                </section>
                            </div>

                            {/* 6. Bank & Medical Details */}
                            <div className="grid md:grid-cols-2 gap-8">
                                <section className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
                                    <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                                        <div className="p-2 bg-green-50 rounded-lg text-green-600">
                                            <CreditCard className="w-5 h-5" />
                                        </div>
                                        <h2 className="text-xl font-bold text-navy">Bank Details</h2>
                                    </div>
                                    <div className="space-y-4">
                                        <FormInput label="Account Number" register={register("accountNumber")} />
                                        <FormInput label="Account Holder's Name" register={register("accountHolderName")} />
                                        <FormInput label="IFSC Code" register={register("ifscCode")} />
                                    </div>
                                </section>

                                <section className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
                                    <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                                        <div className="p-2 bg-red-50 rounded-lg text-red-600">
                                            <Activity className="w-5 h-5" />
                                        </div>
                                        <h2 className="text-xl font-bold text-navy">Medical Details</h2>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormInput label="Height (cm)" register={register("height")} />
                                        <FormInput label="Weight (kg)" register={register("weight")} />
                                        <div className="col-span-2">
                                            <FormInput label="Allergies (if any)" register={register("allergies")} placeholder="e.g. Peanuts, Dust" />
                                        </div>
                                    </div>
                                </section>
                            </div>

                            {/* Submit Button */}
                            <div className="pt-6">
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full md:w-auto md:min-w-[200px] inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-navy text-white font-bold text-lg hover:bg-navy-light transition-all shadow-lg hover:shadow-xl hover:-translate-y-1 disabled:opacity-70 disabled:translate-y-0"
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            Submitting...
                                        </>
                                    ) : (
                                        <>
                                            Submit Application
                                            <Send className="w-5 h-5 ml-1" />
                                        </>
                                    )}
                                </button>
                                <p className="text-center md:text-left text-sm text-gray-400 mt-4">
                                    By clicking submit, you confirm that all provided details are accurate.
                                </p>
                            </div>
                        </form>
                    )}
                </div>
            </main>
            <Footer />
        </div>
    );
}

// --- Helper Components ---

function FileUploadCard({ label, file, setFile, icon: Icon }: any) {
    const [preview, setPreview] = useState<string | null>(null);
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const f = e.target.files[0];
            setFile(f);
            setPreview(URL.createObjectURL(f));
        }
    };
    return (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center hover:border-gold/50 transition-colors relative h-full flex flex-col items-center justify-center min-h-[160px] bg-gray-50/50">
            <input type="file" accept="image/*" onChange={handleChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
            {preview ? (
                <div className="relative w-20 h-20 mx-auto rounded-xl overflow-hidden shadow-md mb-2"><img src={preview} alt="Preview" className="w-full h-full object-cover" /></div>
            ) : (
                <div className="w-12 h-12 bg-white rounded-full mx-auto flex items-center justify-center mb-2 shadow-sm border border-gray-100"><Icon className="w-6 h-6 text-gray-300" /></div>
            )}
            <p className="text-xs font-medium text-navy mt-1 max-w-[90%] truncate leading-tight">{file ? file.name : `Upload ${label}`}</p>
        </div>
    );
}

function FormInput({ label, register, error, placeholder, type = "text" }: any) {
    return (
        <div className="w-full">
            <label className="block text-sm font-medium text-navy mb-1.5">{label}</label>
            <input
                type={type}
                {...register}
                placeholder={placeholder}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/30 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-colors"
            />
            {error && <p className="text-xs text-red-500 mt-1">{error.message}</p>}
        </div>
    );
}

function FormSelect({ label, register, error, children }: any) {
    return (
        <div className="w-full">
            <label className="block text-sm font-medium text-navy mb-1.5">{label}</label>
            <select
                {...register}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/30 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-colors appearance-none"
            >
                {children}
            </select>
            {error && <p className="text-xs text-red-500 mt-1">{error.message}</p>}
        </div>
    );
}
