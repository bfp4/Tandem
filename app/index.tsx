import { useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { ACCENT } from '@/utils/constants';

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace('./login' as any);
      return;
    }

    // Check if the user has completed their profile
    const checkProfile = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (!snap.exists() || !snap.data()?.username) {
          router.replace('/signup/details' as any);
        } else {
          router.replace('/(tabs)/home' as any);
        }
      } catch (error) {
        console.error('Failed to fetch user profile:', error);
        // On error, fall back to login rather than signup flow
        router.replace('./login' as any);
      }
    };

    checkProfile();
  }, [user, loading]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={ACCENT} />
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});

