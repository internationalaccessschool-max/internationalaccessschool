import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/mailer';
import { buildReceiptHTML, ReceiptData } from '@/lib/print-receipt';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuth } from '@/lib/auth-guard';

export async function POST(req: NextRequest) {
    const authResult = await verifyAuth(req, ["admin", "accountant"]);
    if (authResult instanceof NextResponse) return authResult;

    try {
        const body = await req.json();
        const { to, studentId, receiptData } = body as { to?: string, studentId?: string, receiptData: ReceiptData };

        if (!receiptData) {
            return NextResponse.json({ error: 'Missing receipt data' }, { status: 400 });
        }

        let recipientEmail = to;

        // If explicit email was passed from frontend, use it directly (skip lookup)
        if (!recipientEmail && studentId) {
            try {
                // Try studentLookup first (fast, flat collection)
                const lookupDoc = await adminDb.collection('studentLookup').doc(studentId).get();
                if (lookupDoc.exists) {
                    const lookupData = lookupDoc.data();
                    const cls = lookupData?.className;
                    const sec = lookupData?.section;
                    if (cls && sec) {
                        const profileRef = adminDb
                            .collection('users').doc('classes')
                            .collection(cls).doc('sections')
                            .collection(sec).doc('students')
                            .collection('profiles').doc(studentId);
                        const profileSnap = await profileRef.get();
                        if (profileSnap.exists) {
                            const data = profileSnap.data();
                            // Only use notificationEmail or parentEmail — NEVER data.email (that's the auth/login email)
                            recipientEmail = data?.notificationEmail || data?.parentEmail || undefined;
                            // Extra safety: skip auth-style emails like 12345@ias.edu
                            if (recipientEmail && (recipientEmail.includes('@ias.edu') || recipientEmail.includes('@school.'))) {
                                recipientEmail = undefined;
                            }
                        }
                    }
                }

                // Fallback: collectionGroup scan
                if (!recipientEmail) {
                    const snap = await adminDb.collectionGroup('profiles')
                        .where('uid', '==', studentId)
                        .limit(1)
                        .get();
                    if (!snap.empty) {
                        const data = snap.docs[0].data();
                        recipientEmail = data?.notificationEmail || data?.parentEmail || undefined;
                        if (recipientEmail && (recipientEmail.includes('@ias.edu') || recipientEmail.includes('@school.'))) {
                            recipientEmail = undefined;
                        }
                    }
                }
            } catch (lookupErr) {
                console.warn('Email lookup failed:', lookupErr);
            }
        }


        if (!recipientEmail) {
            console.warn(`No recipient email found for student ${studentId}. Skipping email send.`);
            return NextResponse.json({ message: 'No email to send to' });
        }

        // Build HTML strictly Server Side using shared template
        const htmlContent = buildReceiptHTML(receiptData);

        const emailResult = await sendEmail({
            to: recipientEmail,
            subject: `Fee Receipt: ${receiptData.title || 'Payment Successful'} - ${receiptData.feeMonth}`,
            html: htmlContent
        });

        if (emailResult.success) {
            return NextResponse.json({ message: 'Receipt sent successfully', simulated: emailResult.simulated });
        } else {
            return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
        }

    } catch (error: any) {
        console.error('send-receipt error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
