import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { app } from "../firebase";

export const requestForToken = async () => {
    try {
        const supported = await isSupported();
        if (!supported) {
            console.log("Firebase Messaging is not supported in this browser.");
            return null;
        }

        const messaging = getMessaging(app);
        
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const currentToken = await getToken(messaging, { 
                vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY 
            });
            return currentToken;
        } else {
            console.log('Permission not granted for Notification');
            return null;
        }
    } catch (err) {
        console.error('An error occurred while retrieving token. ', err);
        return null;
    }
};

export const setupOnMessageListener = (callback: (payload: any) => void) => {
    isSupported().then((supported) => {
        if (supported) {
            const messaging = getMessaging(app);
            onMessage(messaging, (payload) => {
                callback(payload);
            });
        }
    });
};
