import { redirect } from "next/navigation";

// Redirect anyone visiting /homework to the protected student homework page
// Middleware will catch unauthenticated users and send them to /login
export default function HomeworkRedirect() {
    redirect("/student/homework");
}
