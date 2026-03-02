import * as admin from 'firebase-admin';

// Only initialize if we have the required env vars and it's not already initialized
if (!admin.apps.length) {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (projectId && clientEmail && privateKey) {
        try {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId,
                    clientEmail,
                    privateKey,
                }),
                storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
            });
        } catch (error) {
            console.error('Firebase admin initialization error', error);
        }
    } else {
        // Log a warning during build time, but don't crash
        console.warn('Firebase Admin is not initialized. Missing environment variables (expected during build).');
    }
}

export const adminAuth = admin.apps.length ? admin.auth() : null as any;
export const adminDb = admin.apps.length ? admin.firestore() : null as any;

// Keep backward compat
export function customInitApp() { }
