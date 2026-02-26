import { z } from "zod";

// Shared options for select fields
export const GENDER_OPTIONS = ["Male", "Female", "Other"] as const;
export const BLOOD_GROUP_OPTIONS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
export const SOCIAL_CATEGORY_OPTIONS = ["General", "OBC", "SC", "ST", "Other"] as const;
export const EMPLOYMENT_TYPE_OPTIONS = ["Permanent", "Contractual", "Temporary", "Probation"] as const;
export const STATUS_OPTIONS = ["Active", "Inactive", "On Leave", "Resigned", "Terminated"] as const;

// Allow empty strings for optional fields to handle form state easily
const optionalString = z.string().optional().or(z.literal(""));
const optionalDate = z.string().optional().or(z.literal("")); // Date as string YYYY-MM-DD
const requiredString = z.string().min(1, "Required");

export const staffSchema = z.object({
    // Personal Details
    photoUrl: optionalString,
    name: requiredString.min(2, "Name must be at least 2 characters"),
    fatherName: requiredString,
    dob: requiredString.refine(val => !isNaN(Date.parse(val)), "Invalid Date"),
    gender: z.enum(GENDER_OPTIONS, { message: "Select Gender" }),
    bloodGroup: z.enum(BLOOD_GROUP_OPTIONS).optional().or(z.literal("")),
    socialCategory: z.enum(SOCIAL_CATEGORY_OPTIONS).optional().or(z.literal("")),
    disability: optionalString,

    // Contact Details
    mobile: requiredString.min(10, "Invalid Mobile Number").max(15, "Invalid Mobile Number"),
    email: z.string().email("Invalid Email Address"),
    permanentAddress: requiredString,
    temporaryAddress: optionalString,

    // Professional Details
    designation: requiredString, // e.g. PGT, TGT, PRT, Admin
    branch: optionalString, // e.g. Primary Wing
    grade: optionalString, // e.g. Grade A
    group: optionalString, // e.g. Science
    employmentType: z.enum(EMPLOYMENT_TYPE_OPTIONS).optional().or(z.literal("")),
    status: z.enum(STATUS_OPTIONS).default("Active"),
    joiningDate: requiredString,
    leavingDate: optionalDate,

    // Qualifications
    technicalQualification: optionalString, // e.g. B.Ed, M.Ed
    professionalQualification: optionalString, // e.g. PhD

    // Identity & Financial (Some sensitive/admin only)
    panNumber: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$|^$/, "Invalid PAN Format").optional().or(z.literal("")),
    panUploadUrl: optionalString,
    aadhaarNumber: z.string().regex(/^[0-9]{12}$|^$/, "Invalid Aadhaar (12 digits)").optional().or(z.literal("")),
    aadhaarUploadUrl: optionalString,

    bankName: optionalString,
    bankAccountNumber: optionalString,
    ifscCode: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$|^$/, "Invalid IFSC Format").optional().or(z.literal("")),

    uanNumber: optionalString,
    epfNumber: optionalString,
    epfJoiningDate: optionalDate,
    epfLeavingDate: optionalDate,

    // Salary & Allowances (Admin Only mostly)
    basicSalary: z.coerce.number().min(0).optional(),
    transportAllowance: z.coerce.number().min(0).optional(),
    hraAllowance: z.coerce.number().min(0).optional(),
    daAllowance: z.coerce.number().min(0).optional(),
    otherAllowance: z.coerce.number().min(0).optional(),

    remarks: optionalString,
});

export type StaffFormValues = z.infer<typeof staffSchema>;

// Career Application schema is a subset
// Applicants usually don't provide Salary, EPF, etc. unless explicitly asked.
// User said "these details will require to apply".
// So I will make a schema that makes Admin-only fields optional/hidden for public if needed.
// But for now, I'll use the same schema but maybe make financial fields strictly optional for applicants.

export const applicationSchema = staffSchema.omit({
    status: true,
    leavingDate: true,
    epfLeavingDate: true,
    // Keep financial fields as optional since user asked, but they might not provide them
});

export type ApplicationFormValues = z.infer<typeof applicationSchema>;
