import { initializeApp } from 'firebase/app';
import { initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getReactNativePersistence } from '@firebase/auth/dist/rn';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyB7KcCm9e5HK_GSv9PKIUl4KijPCaXXxoI",
  authDomain: "capstone-499-77660.firebaseapp.com",
  projectId: "capstone-499-77660",
  storageBucket: "capstone-499-77660.firebasestorage.app",
  messagingSenderId: "985020817268",
  appId: "1:985020817268:web:d921c8e09c3c98a19f9621",
  measurementId: "G-JG04VRCVT4"
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
