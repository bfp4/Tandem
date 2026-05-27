import { useAuth } from '@/context/AuthContext';
import { submitRating } from '@/services/ratingService';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ACCENT,
  BG,
  CARD_BG,
  GREEN,
  STAR_COLOR,
  STAR_EMPTY,
  TEXT_INVERSE,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from '@/utils/constants';

export default function RateRideScreen() {
  const { rideRequestId, otherUserId, otherUserName } = useLocalSearchParams<{
    rideRequestId: string;
    otherUserId: string;
    otherUserName: string;
  }>();
  const { user } = useAuth();
  const router = useRouter();

  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user || !rideRequestId || !otherUserId) return;
    if (score === 0) {
      Alert.alert('Rating Required', 'Please select a star rating.');
      return;
    }

    setSubmitting(true);
    try {
      await submitRating(
        rideRequestId,
        user.uid,
        otherUserId,
        score,
        comment.trim() || undefined,
      );
      router.replace('/(tabs)/home');
    } catch (e: any) {
      console.error('Rating submission error:', e);
      Alert.alert('Error', e.message ?? 'Could not submit rating.');
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    router.replace('/(tabs)/home');
  };

  const displayName = otherUserName || 'your match';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.checkCircle}>
            <Ionicons name="checkmark" size={36} color={TEXT_INVERSE} />
          </View>
          <Text style={styles.title}>Ride Complete</Text>
          <Text style={styles.subtitle}>
            How was your ride with {displayName}?
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.rateLabel}>Tap to rate</Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((value) => (
              <TouchableOpacity
                key={value}
                onPress={() => setScore(value)}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                <Ionicons
                  name={value <= score ? 'star' : 'star-outline'}
                  size={44}
                  color={value <= score ? STAR_COLOR : STAR_EMPTY}
                />
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.commentInput}
            placeholder="Leave a comment (optional)"
            placeholderTextColor={TEXT_MUTED}
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={300}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={TEXT_INVERSE} size="small" />
            ) : (
              <Text style={styles.submitButtonText}>Submit Rating</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={handleSkip}
            disabled={submitting}
          >
            <Text style={styles.skipButtonText}>Skip</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  checkCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: GREEN,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: TEXT_PRIMARY,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 22,
  },

  card: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 24,
  },
  rateLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT_MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  stars: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  commentInput: {
    width: '100%',
    minHeight: 80,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: TEXT_PRIMARY,
    lineHeight: 21,
  },

  actions: {
    gap: 12,
  },
  submitButton: {
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: TEXT_INVERSE,
    fontSize: 17,
    fontWeight: '700',
  },
  skipButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipButtonText: {
    color: TEXT_MUTED,
    fontSize: 15,
    fontWeight: '500',
  },
});
