import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { verifyAuth } from "@/lib/auth-guard";

export async function POST(req: NextRequest) {
    const authResult = await verifyAuth(req, ["admin", "accountant"]);
    if (authResult instanceof NextResponse) return authResult;

    const { to, subject, html } = await req.json();

    if (!to || !subject || !html) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Create transporter using Gmail SMTP
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    try {
        await transporter.sendMail({
            from: `"International Access School" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html,
        });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Email send error:", error);
        return NextResponse.json({ error: error.message || "Failed to send email" }, { status: 500 });
    }
}
