import { auth } from 'firebase-functions/v1';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

/**
 * Trigger: auth.user().onCreate
 * Action:  Creates the /users/{uid} document with all fields initialized.
 *          Never auto-generates the document ID — always uses user.uid.
 */
export const onAuthUserCreated = auth.user().onCreate(async (user) => {
  const db = getFirestore();

  // Document ID = user.uid — this is the invariant that keeps Auth and
  // Firestore in sync. Never use a generated ID here.
  await db
    .collection('users')
    .doc(user.uid)
    .set({
      email: user.email ?? null,
      name: user.displayName ?? null,
      username: null,
      phone: null,
      address: null,
      bio: null,
      profilePhoto: null,
      roles: [],
      activeRole: null,
      starRating: 0,
      rideCount: 0,
      bankInfo: null,
      fcmToken: null,
      profileComplete: false,
      // All required fields for both roles are missing on creation.
      // "carDetails" will be added to missingFields by onUserUpdated when
      // the user selects the driver role.
      missingFields: [
        'name',
        'username',
        'phone',
        'address',
        'profilePhoto',
        'bankInfo',
      ],
      createdAt: FieldValue.serverTimestamp(),
      carDetails: null,
    });
});
