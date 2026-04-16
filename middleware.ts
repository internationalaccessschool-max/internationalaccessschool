import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Map each role to its dashboard and login path
const ROLE_ROUTES: Record<string, { dashboard: string; login: string }> = {
    admin:      { dashboard: "/admin",      login: "/admin/login" },
    teacher:    { dashboard: "/teacher",    login: "/teacher/login" },
    student:    { dashboard: "/student",    login: "/student/login" },
    parent:     { dashboard: "/student",    login: "/student/login" },
    accountant: { dashboard: "/accountant", login: "/accountant/login" },
    supervisor: { dashboard: "/supervisor", login: "/supervisor/login" },
};

function getLoginPath(pathname: string): string {
    if (pathname.startsWith("/admin"))      return "/admin/login";
    if (pathname.startsWith("/teacher"))    return "/teacher/login";
    if (pathname.startsWith("/student"))    return "/student/login";
    if (pathname.startsWith("/accountant")) return "/accountant/login";
    if (pathname.startsWith("/supervisor")) return "/supervisor/login";
    return "/login";
}

function getRequiredRole(pathname: string): string[] {
    if (pathname.startsWith("/admin"))      return ["admin"];
    if (pathname.startsWith("/teacher"))    return ["teacher"];
    if (pathname.startsWith("/student"))    return ["student", "parent"];
    if (pathname.startsWith("/accountant")) return ["accountant"];
    if (pathname.startsWith("/supervisor")) return ["supervisor"];
    return [];
}

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // 1. Skip non-protected routes immediately
    const isProtected = ["/admin", "/teacher", "/student", "/supervisor", "/accountant"]
        .some(p => pathname.startsWith(p));
    if (!isProtected) return NextResponse.next();

    const authCookie = request.cookies.get("auth")?.value;
    const roleCookie = request.cookies.get("role")?.value;
    const isLoggedIn = authCookie === "true" && !!roleCookie;

    // 2. On login pages — only redirect to dashboard if FULLY logged in with correct role
    const loginPath = getLoginPath(pathname);
    if (pathname === loginPath) {
        if (isLoggedIn) {
            const route = ROLE_ROUTES[roleCookie!];
            // Only redirect if this login page matches their role (prevents cross-role loop)
            if (route && pathname === route.login) {
                return NextResponse.redirect(new URL(route.dashboard, request.url));
            }
        }
        // Always allow login pages through
        return NextResponse.next();
    }

    // 3. Not logged in → send to login page (no `from` param to avoid loop chains)
    if (!isLoggedIn) {
        return NextResponse.redirect(new URL(loginPath, request.url));
    }

    // 4. Wrong role → send to correct login page (not their current page, avoids loop)
    const requiredRoles = getRequiredRole(pathname);
    if (requiredRoles.length > 0 && !requiredRoles.includes(roleCookie!)) {
        return NextResponse.redirect(new URL(loginPath, request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/student/:path*", "/teacher/:path*", "/admin/:path*", "/supervisor/:path*", "/accountant/:path*"],
};
