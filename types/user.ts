import { Timestamp } from 'firebase/firestore';

// Document ID = Firebase Auth uid — never stored as a field
export type AppearancePreference = 'system' | 'light' | 'dark';
export type GenderPreference = 'any' | 'female' | 'male' | 'nonbinary';

export interface User {
  username: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  bio: string;
  /** URL to Firebase Storage */
  profilePhoto: string;
  /** At least one role required */
  roles: ('driver' | 'rider')[];
  activeRole: 'driver' | 'rider';
  /**
   * 1 decimal place.
   * @readonly - set by Cloud Function only
   */
  starRating: number;
  /**
   * @readonly - set by Cloud Function only
   */
  rideCount: number;
  bankInfo: Record<string, any>;
  /** Updated on every app launch */
  fcmToken: string;
  /**
   * @readonly - set by Cloud Function only
   */
  profileComplete: boolean;
  /**
   * e.g. ["carDetails", "bankInfo"]
   * @readonly - set by Cloud Function only
   */
  missingFields: string[];
  /** Geohash of the user's location — updated whenever address/location changes */
  geohash: string;
  /** Latitude component of the user's base location */
  lat?: number;
  /** Longitude component of the user's base location */
  lng?: number;
  createdAt: Timestamp;
  /** ISO string (some screens write this client-side) */
  updatedAt?: string;
  /** Driver only — null for riders */
  carDetails: {
    licensePlate: string;
    model: string;
    /** URL to Firebase Storage */
    photo: string;
  } | null;

  /** User-controlled preferences */
  preferences?: {
    notificationsEnabled?: boolean;
    appearance?: AppearancePreference;
    placeSettings?: string;
    genderPreference?: GenderPreference;
  };

  uid: string;
}
