export type UserRole = "student" | "teacher" | "admin" | "accountant" | "supervisor";

export interface SupervisorProfile {
    uid: string;
    email: string;
    displayName: string;
    allowedPages: string[]; // e.g. ["/supervisor/students", "/supervisor/attendance"]
    createdAt: number;
}

export interface UserProfile {
    uid: string;
    email: string;
    role: UserRole;
    displayName?: string;
    photoURL?: string;
    createdAt: number;
}

export interface StudentProfile extends UserProfile {
    role: "student";
    rollNo: string;
    classId: string;
    guardianName: string;
    guardianPhone: string;
    address: string;
    dob: string;
    notificationEmail?: string;
}

export interface TeacherProfile extends UserProfile {
    role: "teacher";
    employeeId: string;
    subjects: string[];
    assignedClasses: string[]; // Array of classIds
    qualification: string;
}

export interface Class {
    id: string;
    name: string; // e.g. "10", "X", "10th"
    section: string; // e.g. "A", "B"
    classTeacherId?: string;
}

export interface AdmissionInquiry {
    id?: string;
    studentName: string;
    parentName: string;
    email: string;
    phone: string;
    gradeApplyingFor: string;
    message?: string;
    status: "new" | "contacted" | "admitted" | "rejected";
    submittedAt: number;
}

export interface Notice {
    id?: string;
    title: string;
    content: string;
    date: string;
    postedBy: string; // teacher or admin uid
    targetAudience: "all" | "students" | "teachers" | string; // specific classId
    attachmentUrl?: string;
}

export interface Subject {
    id?: string;
    name: string; // e.g., "Mathematics"
    type: "Core" | "Elective" | "Practical";
    maxMarks: number;
}

// Maps a class name to its list of subjects (per-class subject assignment)
export interface ClassSubjectMap {
    className: string; // e.g. "Class 7"
    subjects: Subject[];
}

export interface Exam {
    id?: string;
    name: string; // e.g., "Term 1", "Mid-Term", "Final"
    startDate: string;
    endDate: string;
    status: "Draft" | "Published";
    classesApplicable: string[]; // Array of class names that take this exam
    createdAt?: number;
    updatedAt?: number;
    /** New: exam type for 4-exam academic structure */
    examType?: "Standard" | "Unit Test" | "Term Exam" | "Annual Exam";
    /** New: academic session e.g. "2026-27" */
    session?: string;
}

export interface SubjectMark {
    subjectId: string;
    obtained: number | null; // null if absent or not yet entered
    total: number;
    grade?: string;
    /** Sub-marks for Unit Test exams (max 10 / 5 / 5) */
    perTest?: number | null;
    noteBook?: number | null;
    sea?: number | null;
}

export interface Result {
    id?: string;
    studentId: string;
    examId: string;
    /** Snapshotted from exam at save time — survives exam deletion */
    examName?: string;
    examStartDate?: string;
    examEndDate?: string;
    classId: string;
    sectionId: string; // the section of the student
    marks: Record<string, SubjectMark>; // Map of subjectId -> SubjectMark
    totalObtained: number;
    totalMax: number;
    percentage: number;
    overallGrade: string;
    teacherRemarks?: string;
    updatedAt: number;
    /** Co-Scholastic area grades (only for Annual Exam) */
    coScholastic?: Record<string, { hy?: string; annual?: string }>;
}

export interface AdmitCard {
    id?: string;
    examId: string;
    examName: string;
    startDate: string;
    endDate: string;
    timing?: string;
    instructions?: string;
    studentId: string;
    admissionNumber: string;
    studentName: string;
    className: string;
    section: string;
    dob: string;
    fatherName: string;
    generatedAt: number;
    timetable?: {
        subject: string;
        date: string;
        startTime: string;
        endTime: string;
        roomNo: string;
    }[];
}
