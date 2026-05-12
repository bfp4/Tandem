import { useAuth } from '@/context/AuthContext';
import { getOrCreateConversation } from '@/services/messagingService';
import type { RideMatchInfo } from '@/services/matchingService';
import { createNotification } from '@/services/notificationService';
import { aggregateRatingForUser } from '@/services/ratingService';
import { cancelRideRequest, createRideRequest } from '@/services/rideRequestService';
import { getUser } from '@/services/userService';
import { normalizeProfilePhotoUrl } from '@/utils/profilePhoto';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { GeoPoint } from 'firebase/firestore';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { db } from '../config/firebase';

const FULL_DAY: Record<string, string> = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday',
  Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
};

function format12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const hours = h % 12 === 0 ? 12 : h % 12;
  return `${hours}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * "YYYY-MM-DD" of the soonest occurrence of a short day name ("Mon", etc.).
 * Includes today if today matches the target day AND `departureTime` (HH:MM, 24h)
 * has not yet passed; otherwise rolls to the same weekday next week.
 */
function nextDateForDay(dayShort: string, departureTime?: string): string {
  const DAY_MAP: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const target = DAY_MAP[dayShort] ?? 0;
  const now = new Date();
  let daysAhead = (target - now.getDay() + 7) % 7;

  if (daysAhead === 0 && departureTime) {
    const [h, m] = departureTime.split(':').map((n) => parseInt(n, 10));
    const departureToday = new Date(now);
    departureToday.setHours(h || 0, m || 0, 0, 0);
    if (departureToday.getTime() <= now.getTime()) {
      daysAhead = 7;
    }
  }

  const d = new Date(now);
  d.setDate(now.getDate() + daysAhead);
  // Format as LOCAL YYYY-MM-DD (avoid toISOString which converts to UTC and can shift the day)
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

export default function DriverDetailsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams();

  const otherId = params.id as string;
  const otherName = (params.name as string) || 'User';

  /** From navigation; overwritten when `/ratings` aggregate is available */
  const [displayRating, setDisplayRating] = useState(() => {
    const n = Number.parseFloat(String(params.rating ?? ''));
    return Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : 0;
  });
  const [displayRideCount, setDisplayRideCount] = useState(() => {
    const n = Number.parseInt(String(params.totalRides ?? ''), 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  });

  /** Pending: maps riderRideId → Firestore rideRequests doc id (withdrawable). */
  const [pendingRequestByRideId, setPendingRequestByRideId] = useState<
    Record<string, string>
  >({});
  /** Confirmed match — show "Request Sent" with no cancel. */
  const [confirmedRideIds, setConfirmedRideIds] = useState<Set<string>>(new Set());
  const [submittingRideId, setSubmittingRideId] = useState<string | null>(null);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState('');

  const bio = (params.bio as string) || '';
  const distance = (params.distance as string) || '';
  const score = (params.score as string) || '';
  const myRole = (params.myRole as string) || 'rider';

  let matchingRides: RideMatchInfo[] = [];
  try {
    matchingRides = JSON.parse((params.matchingRides as string) ?? '[]');
  } catch {
    matchingRides = [];
  }

  useEffect(() => {
    const r = Number.parseFloat(String(params.rating ?? ''));
    const rides = Number.parseInt(String(params.totalRides ?? ''), 10);
    setDisplayRating(Number.isFinite(r) ? Math.max(0, Math.min(5, r)) : 0);
    setDisplayRideCount(Number.isFinite(rides) ? Math.max(0, rides) : 0);
  }, [otherId, params.rating, params.totalRides]);

  useEffect(() => {
    if (!otherId?.trim()) return;
    let cancelled = false;
    void (async () => {
      try {
        const agg = await aggregateRatingForUser(otherId);
        if (!cancelled && agg && agg.count > 0) {
          setDisplayRating(agg.average);
          setDisplayRideCount(agg.count);
        }
      } catch (e) {
        console.warn('driver-details: aggregateRatingForUser failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [otherId]);

  useEffect(() => {
    if (!user) {
      setLoadingRequests(false);
      return;
    }
    void checkExistingRequests();
  }, [user, otherId]);

  useEffect(() => {
    if (!otherId?.trim()) return;
    let cancelled = false;
    const raw = params.profilePhoto;
    const paramUrl = normalizeProfilePhotoUrl(
      Array.isArray(raw) ? raw[0] : raw,
    );
    setProfilePhotoUrl(paramUrl);
    void (async () => {
      try {
        const u = await getUser(otherId);
        if (cancelled) return;
        const fromDoc = normalizeProfilePhotoUrl(u.profilePhoto);
        setProfilePhotoUrl(fromDoc || paramUrl);
      } catch {
        if (!cancelled) setProfilePhotoUrl(paramUrl);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [otherId, params.profilePhoto]);

  const checkExistingRequests = async () => {
    if (!user) return;
    try {
      // Query by riderId only (single-field, no composite index) and filter in memory.
      // We check both orientations so we catch requests that either party created.
      const riderId1 = myRole === 'rider' ? user.uid : otherId;
      const driverId1 = myRole === 'rider' ? otherId : user.uid;
      const riderId2 = myRole === 'rider' ? otherId : user.uid;
      const driverId2 = myRole === 'rider' ? user.uid : otherId;

      const [snap1, snap2] = await Promise.all([
        getDocs(query(collection(db, 'rideRequests'), where('riderId', '==', riderId1))),
        getDocs(query(collection(db, 'rideRequests'), where('riderId', '==', riderId2))),
      ]);

      const merged: Record<
        string,
        { pendingDocId?: string; confirmed?: boolean }
      > = {};

      const consider = (
        data: {
          driverId?: string;
          riderRideId?: string;
          status?: string;
        },
        docId: string,
        driverIdExpected: string,
      ) => {
        if (data.driverId !== driverIdExpected || !data.riderRideId) return;
        const rr = data.riderRideId as string;
        if (!merged[rr]) merged[rr] = {};
        if (data.status === 'pending') merged[rr].pendingDocId = docId;
        if (data.status === 'confirmed') merged[rr].confirmed = true;
      };

      snap1.docs.forEach(d => consider(d.data(), d.id, driverId1));
      snap2.docs.forEach(d => consider(d.data(), d.id, driverId2));

      const pending: Record<string, string> = {};
      const confirmed = new Set<string>();
      for (const [rideId, m] of Object.entries(merged)) {
        if (m.confirmed) confirmed.add(rideId);
        else if (m.pendingDocId) pending[rideId] = m.pendingDocId;
      }
      setPendingRequestByRideId(pending);
      setConfirmedRideIds(confirmed);
    } catch (e) {
      console.warn('Could not load existing requests:', e);
    } finally {
      setLoadingRequests(false);
    }
  };

  const handleRequestMatch = async (ride: RideMatchInfo) => {
    if (!user) return;

    const riderId = myRole === 'rider' ? user.uid : otherId;
    const driverId = myRole === 'rider' ? otherId : user.uid;
    const initiatedBy = myRole as 'rider' | 'driver';
    const notifyUserId = myRole === 'rider' ? driverId : riderId;

    setSubmittingRideId(ride.riderRideId);
    try {
      const requestId = await createRideRequest({
        scheduleBlockId: '',
        driverId,
        riderId,
        riderRideId: ride.riderRideId,
        initiatedBy,
        requestedStart: ride.departureTime,
        requestedEnd: ride.arrivalTime,
        date: nextDateForDay(ride.day, ride.departureTime),
        pickupLocation: new GeoPoint(ride.pickupLat, ride.pickupLng),
        dropoffLocation: new GeoPoint(ride.dropoffLat, ride.dropoffLng),
        repeating: true,
        repeatDays: [ride.day],
        repeatEndsAt: null,
        seriesId: null,
      });

      const notifyMsg = myRole === 'rider'
        ? `${user.displayName || 'A rider'} wants to request a ride for ${FULL_DAY[ride.day] ?? ride.day} at ${format12h(ride.departureTime)}.`
        : `${user.displayName || 'A driver'} wants to drive you on ${FULL_DAY[ride.day] ?? ride.day} at ${format12h(ride.departureTime)}.`;

      await createNotification(notifyUserId, 'ride_requested', requestId, notifyMsg);

      setPendingRequestByRideId(prev => ({ ...prev, [ride.riderRideId]: requestId }));
      Alert.alert('Request sent!', `Your match request has been sent to ${otherName}.`);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not send match request.');
    } finally {
      setSubmittingRideId(null);
    }
  };

  const handleCancelPendingRequest = (ride: RideMatchInfo) => {
    if (!user) return;
    const requestId = pendingRequestByRideId[ride.riderRideId];
    if (!requestId) return;

    Alert.alert(
      'Cancel request?',
      `Withdraw your match request to ${otherName}?`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel request',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setSubmittingRideId(ride.riderRideId);
              try {
                await cancelRideRequest(requestId, user.uid);
                setPendingRequestByRideId(prev => {
                  const next = { ...prev };
                  delete next[ride.riderRideId];
                  return next;
                });
                Alert.alert('Request cancelled', 'Your match request was withdrawn.');
              } catch (e: any) {
                Alert.alert('Error', e.message ?? 'Could not cancel request.');
              } finally {
                setSubmittingRideId(null);
              }
            })();
          },
        },
      ],
    );
  };

  const handleMessage = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'You must be signed in to send messages.');
      return;
    }
    try {
      const { conversationId, isPending } = await getOrCreateConversation(user.uid, otherId);
      router.push({
        pathname: '/conversation/[id]',
        params: { id: conversationId, otherUserId: otherId, pending: isPending ? 'true' : 'false' },
      });
    } catch {
      Alert.alert('Error', 'Could not open conversation. Please try again.');
    }
  };

  const profileLabel = myRole === 'rider' ? 'Driver Profile' : 'Rider Profile';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{profileLabel}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* ── Profile ── */}
        <View style={styles.profileSection}>
          <View style={styles.avatarLarge}>
            {profilePhotoUrl ? (
              <Image
                source={{ uri: profilePhotoUrl }}
                style={styles.avatarLargeImage}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <Ionicons name="person" size={48} color="#999" />
            )}
          </View>

          <Text style={styles.driverName}>{otherName}</Text>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="star" size={18} color="#FFB800" />
              <Text style={styles.statValue}>{displayRating.toFixed(1)}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="car" size={18} color="#666" />
              <Text style={styles.statValue}>{displayRideCount} rides</Text>
            </View>
            {distance ? (
              <>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Ionicons name="location" size={18} color="#666" />
                  <Text style={styles.statValue}>{distance} mi</Text>
                </View>
              </>
            ) : null}
            {score ? (
              <>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Ionicons name="checkmark-circle" size={18} color="#007AFF" />
                  <Text style={[styles.statValue, { color: '#007AFF' }]}>{score}% match</Text>
                </View>
              </>
            ) : null}
          </View>

          {matchingRides.length > 0 && (
            <View style={styles.ridesBadge}>
              <Ionicons name="calendar" size={14} color="#007AFF" />
              <Text style={styles.ridesBadgeText}>
                {matchingRides.length} compatible ride{matchingRides.length !== 1 ? 's' : ''}
              </Text>
            </View>
          )}

          {bio ? <Text style={styles.bioText}>{bio}</Text> : null}

          <TouchableOpacity style={styles.messageButton} onPress={handleMessage}>
            <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
            <Text style={styles.messageButtonText}>Message</Text>
          </TouchableOpacity>
        </View>

        {/* ── Compatible Rides ── */}
        <View style={styles.ridesSection}>
          <Text style={styles.sectionTitle}>Compatible Rides</Text>
          <Text style={styles.sectionSubtitle}>
            {matchingRides.length > 0
              ? 'Tap a ride to send a match request. You can cancel while it\'s still pending.'
              : myRole === 'rider'
                ? 'No schedule overlap yet. Add rides in your Schedule tab to find matches.'
                : 'No schedule overlap yet. Add availability in your Schedule tab to find matches.'}
          </Text>

          {loadingRequests ? (
            <ActivityIndicator color="#007AFF" style={{ marginVertical: 16 }} />
          ) : (
            matchingRides.map((ride, i) => {
              const pendingRequestId = pendingRequestByRideId[ride.riderRideId];
              const isConfirmed = confirmedRideIds.has(ride.riderRideId);
              const isSubmitting = submittingRideId === ride.riderRideId;
              return (
                <View key={i} style={styles.rideCard}>
                  <View style={styles.rideCardHeader}>
                    <View style={styles.dayBadge}>
                      <Text style={styles.dayBadgeText}>{FULL_DAY[ride.day] ?? ride.day}</Text>
                    </View>
                    {ride.estimatedDurationMinutes != null && (
                      <View style={styles.durationBadge}>
                        <Ionicons name="time-outline" size={12} color="#666" />
                        <Text style={styles.durationText}>{ride.estimatedDurationMinutes} min</Text>
                      </View>
                    )}
                  </View>

                  <Text style={styles.rideTime}>
                    {format12h(ride.departureTime)}
                    {'  →  '}
                    {format12h(ride.arrivalTime)}
                  </Text>

                  <View style={styles.routeContainer}>
                    <View style={styles.routeIconCol}>
                      <View style={styles.routeDotPickup} />
                      <View style={styles.routeConnector} />
                      <View style={styles.routeDotDropoff} />
                    </View>
                    <View style={styles.routeTextCol}>
                      <Text style={styles.routeAddress} numberOfLines={2}>{ride.pickupAddress}</Text>
                      <Text style={styles.routeAddress} numberOfLines={2}>{ride.dropoffAddress}</Text>
                    </View>
                  </View>

                  {pendingRequestId && !isConfirmed ? (
                    <TouchableOpacity
                      style={[
                        styles.requestButtonCancel,
                        isSubmitting && styles.requestButtonDisabled,
                      ]}
                      onPress={() => handleCancelPendingRequest(ride)}
                      disabled={isSubmitting}
                      activeOpacity={0.75}
                    >
                      {isSubmitting ? (
                        <ActivityIndicator size="small" color="#FF3B30" />
                      ) : (
                        <>
                          <Ionicons name="close-circle-outline" size={16} color="#FF3B30" />
                          <Text style={styles.requestButtonCancelText}>Cancel request</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.requestButton,
                        isConfirmed && styles.requestButtonSent,
                        (isSubmitting || isConfirmed) && styles.requestButtonDisabled,
                      ]}
                      onPress={() => handleRequestMatch(ride)}
                      disabled={isSubmitting || isConfirmed}
                      activeOpacity={0.75}
                    >
                      {isSubmitting ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : isConfirmed ? (
                        <>
                          <Ionicons name="checkmark-circle" size={16} color="#fff" />
                          <Text style={styles.requestButtonText}>Request Sent</Text>
                        </>
                      ) : (
                        <>
                          <Ionicons name="paper-plane-outline" size={16} color="#fff" />
                          <Text style={styles.requestButtonText}>Request Match</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}

          {!loadingRequests && matchingRides.length === 0 && (
            <View style={styles.emptyRides}>
              <Ionicons name="calendar-outline" size={40} color="#ccc" />
              <Text style={styles.emptyRidesText}>No compatible rides</Text>
            </View>
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  placeholder: {
    width: 40,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  profileSection: {
    backgroundColor: '#fff',
    padding: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  avatarLarge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  avatarLargeImage: {
    width: '100%',
    height: '100%',
  },
  driverName: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  statDivider: {
    width: 1,
    height: 18,
    backgroundColor: '#e0e0e0',
  },
  ridesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 12,
    gap: 6,
  },
  ridesBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007AFF',
  },
  bioText: {
    fontSize: 15,
    color: '#666',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 4,
  },
  messageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
    marginTop: 16,
    gap: 8,
  },
  messageButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  ridesSection: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#999',
    marginBottom: 16,
    lineHeight: 18,
  },
  rideCard: {
    backgroundColor: '#f8faff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#dde8ff',
  },
  rideCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  dayBadge: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dayBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  durationText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  rideTime: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1c1c1e',
    marginBottom: 12,
  },
  routeContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  routeIconCol: {
    alignItems: 'center',
    paddingTop: 4,
    width: 12,
  },
  routeDotPickup: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#007AFF',
  },
  routeConnector: {
    flex: 1,
    width: 2,
    backgroundColor: '#cce0ff',
    marginVertical: 4,
    minHeight: 20,
  },
  routeDotDropoff: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: '#34C759',
  },
  routeTextCol: {
    flex: 1,
    gap: 18,
  },
  routeAddress: {
    fontSize: 13,
    color: '#444',
    lineHeight: 18,
  },
  requestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6,
  },
  requestButtonSent: {
    backgroundColor: '#34C759',
  },
  requestButtonDisabled: {
    opacity: 0.7,
  },
  requestButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  requestButtonCancel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#FF3B30',
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6,
  },
  requestButtonCancelText: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyRides: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyRidesText: {
    fontSize: 15,
    color: '#bbb',
    fontWeight: '500',
  },
});
