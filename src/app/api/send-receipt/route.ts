import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/mailer';
import { buildReceiptHTML, ReceiptData } from '@/lib/print-receipt';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { to, studentId, receiptData } = body as { to?: string, studentId?: string, receiptData: ReceiptData };

        if (!receiptData) {
            return NextResponse.json({ error: 'Missing receipt data' }, { status: 400 });
        }

        let recipientEmail = to;

        // Automatically resolve the student's notification email if studentId is provided
        if (!recipientEmail && studentId) {
            try {
                // Try studentLookup first (fast, flat collection)
                const lookupDoc = await adminDb.collection('studentLookup').doc(studentId).get();
                if (lookupDoc.exists) {
                    const lookupData = lookupDoc.data();
                    // studentLookup has class/section — use it to fetch full profile
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
                            recipientEmail = data?.notificationEmail || data?.parentEmail || data?.email;
                        }
                    }
                }

                // Fallback: collectionGroup scan (slower but always works)
                if (!recipientEmail) {
                    const snap = await adminDb.collectionGroup('profiles')
                        .where('uid', '==', studentId)
                        .limit(1)
                        .get();
                    if (!snap.empty) {
                        const data = snap.docs[0].data();
                        recipientEmail = data?.notificationEmail || data?.parentEmail || data?.email;
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
