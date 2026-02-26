import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
    const authCookie = request.cookies.get("auth");
    const roleCookie = request.cookies.get("role")?.value;
    const emailCookie = request.cookies.get("email")?.value;
    const { pathname } = request.nextUrl;

    // Admin login page is public but standard login paths aren't necessarily protected.
    // The main protection is for the dashboard segments.

    // Quick escape for standard public routes
    if (!pathname.startsWith("/student") && !pathname.startsWith("/teacher") && !pathname.startsWith("/admin") && !pathname.startsWith("/supervisor")) {
        return NextResponse.next();
    }

    // Exception for the login pages themselves (don't block them)
    if (pathname === "/student/login" || pathname === "/admin/login" || pathname === "/teacher/login" || pathname === "/accountant/login" || pathname === "/supervisor/login") {
        // If already logged in, redirect them away from login page to dashboard
        if (authCookie && roleCookie) {
            if (pathname === "/admin/login" && roleCookie === "admin") return NextResponse.redirect(new URL("/admin", request.url));
            if (pathname === "/student/login" && roleCookie === "student") return NextResponse.redirect(new URL("/student", request.url));
            if (pathname === "/teacher/login" && roleCookie === "teacher") return NextResponse.redirect(new URL("/teacher", request.url));
            if (pathname === "/accountant/login" && roleCookie === "accountant") return NextResponse.redirect(new URL("/accountant", request.url));
            if (pathname === "/supervisor/login" && roleCookie === "supervisor") return NextResponse.redirect(new URL("/supervisor", request.url));
        }
        return NextResponse.next();
    }

    // Main Protection Logic
    if (!authCookie || !roleCookie) {
        // Not logged in
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("from", pathname);
        return NextResponse.redirect(loginUrl);
    }

    // Role-based Path Checking
    if (pathname.startsWith("/admin")) {
        // Strict Admin Check
        if (roleCookie !== "admin" || emailCookie !== "internationalaccessschool@gmail.com") {
            return NextResponse.redirect(new URL("/login", request.url));
        }
    } else if (pathname.startsWith("/teacher")) {
        // Strict Teacher Check
        if (roleCookie !== "teacher") {
            return NextResponse.redirect(new URL("/login", request.url));
        }
    } else if (pathname.startsWith("/student")) {
        // Strict Student Check (allowing parents too if needed later, but enforcing student now)
        if (roleCookie !== "student" && roleCookie !== "parent") {
            return NextResponse.redirect(new URL("/login", request.url));
        }
    } else if (pathname.startsWith("/supervisor")) {
        if (roleCookie !== "supervisor") {
            return NextResponse.redirect(new URL("/login", request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/student/:path*", "/teacher/:path*", "/admin/:path*", "/supervisor/:path*"],
};
