export const TIMETABLE_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface PeriodTiming {
    period: number;
    start: string;
    end: string;
    isBreak?: boolean;
    label?: string; // used for breaks
}

// A standard bell schedule for an 8-period setup.
// Kept period index (1-8) matching the current Firebase data structure.
// So existing records mapped as "Monday-1" continue to work exactly.
export const TIMETABLE_PERIODS: PeriodTiming[] = [
    { period: 1, start: "08:00 AM", end: "08:40 AM" },
    { period: 2, start: "08:40 AM", end: "09:20 AM" },
    { period: 3, start: "09:20 AM", end: "10:00 AM" },
    { period: 4, start: "10:00 AM", end: "10:40 AM" },
    { period: -1, start: "10:40 AM", end: "11:10 AM", isBreak: true, label: "LUNCH BREAK" }, // -1 denotes a break, no storage needed
    { period: 5, start: "11:10 AM", end: "11:50 AM" },
    { period: 6, start: "11:50 AM", end: "12:30 PM" },
    { period: 7, start: "12:30 PM", end: "01:10 PM" },
    { period: 8, start: "01:10 PM", end: "01:50 PM" },
];
