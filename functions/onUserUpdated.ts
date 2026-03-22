import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import type { User } from '../types/user';

const REQUIRED_ALL: (keyof User)[] = [
  'name',
  'email',
  'phone',
  'address',
  'profilePhoto',
  'bankInfo',
];
const REQUIRED_DRIVER: (keyof User)[] = ['carDetails'];

function computeProfileStatus(user: User): {
  profileComplete: boolean;
  missingFields: string[];
} {
  const required: (keyof User)[] =
    user.activeRole === 'driver'
      ? [...REQUIRED_ALL, ...REQUIRED_DRIVER]
      : REQUIRED_ALL;

  const missingFields = required.filter((field) => {
    const val = user[field];
    return val === null || val === undefined || val === '';
  }) as string[];

  return { profileComplete: missingFields.length === 0, missingFields };
}

/**
 * Trigger: onUpdate /users/{userId}
 * Action:  Recompute profileComplete and missingFields.
 *          Only writes back if the computed values have changed — prevents infinite trigger loop.
 */
export const onUserUpdated = onDocumentUpdated(
  'users/{userId}',
  async (event) => {
    const before = event.data?.before.data() as User | undefined;
    const after = event.data?.after.data() as User | undefined;
    if (!before || !after) return;

    const { profileComplete, missingFields } = computeProfileStatus(after);

    // Guard: only write if computed values differ from what's already stored
    const unchanged =
      after.profileComplete === profileComplete &&
      JSON.stringify(after.missingFields ?? []) ===
        JSON.stringify(missingFields);
    if (unchanged) return;

    await getFirestore()
      .collection('users')
      .doc(event.params.userId)
      .update({ profileComplete, missingFields });
  },
);
