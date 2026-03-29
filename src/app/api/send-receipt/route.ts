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
            const studentDoc = await adminDb.collection('profiles').doc(studentId).get();
            if (studentDoc.exists) {
                const data = studentDoc.data();
                recipientEmail = data?.notificationEmail || data?.parentEmail || data?.email;
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
