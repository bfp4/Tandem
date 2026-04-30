import { db } from '@/config/firebase';
import { useAuth } from '@/context/AuthContext';
import { getOrCreateConversation } from '@/services/messagingService';
import {
  cancelReady,
  completeRide,
  confirmPickup,
  fetchUserConfirmationsOnce,
  markReady,
  subscribeToUserConfirmations,
  type RideConfirmationWithId,
} from '@/services/rideConfirmationService';
import { getRideRequestById, type RideRequestWithId } from '@/services/rideRequestService';
import { getRiderRides } from '@/services/riderRideService';
import { getUser } from '@/services/userService';
import type { RiderRide } from '@/types/riderRide';
import type { User as AppUser } from '@/types/user';
import { reverseGeocode } from '@/utils/geocoding';
import { fetchRouteWithSteps } from '@/utils/routing';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { collection, getDocs, query, Timestamp, where } from 'firebase/firestore';
import React, { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { type MarkerData, type RouteData } from '../../components/Map';


class HomeErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.error('HomeScreen error boundary caught:', error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <Text style={{ fontSize: 16, color: '#666', textAlign: 'center' }}>
            Something went wrong loading rides. Pull down to refresh.
          </Text>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false })}
            style={{ marginTop: 16, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#007AFF', borderRadius: 10 }}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

type Tab = 'active' | 'upcoming';

interface EnrichedRide {
  confirmation: RideConfirmationWithId;
  request: RideRequestWithId;
  otherUser: AppUser;
  pickupAddress: string;
  dropoffAddress: string;
  /** True when derived from confirmed rideRequest but missing a confirmation doc */
  synthetic?: boolean;
}

interface RiderRideWithId extends RiderRide {
  id: string;
}

interface UpcomingMapSectionProps {
  upcoming: EnrichedRide[];
  userLocation: { latitude: number; longitude: number } | null;
}

const ACCENT = '#007AFF';
const GREEN = '#34C759';
const ORANGE = '#FF9500';
const RED = '#FF3B30';
const TEXT_PRIMARY = '#1C1C1E';
const TEXT_SECONDARY = '#6B7280';
const TEXT_MUTED = '#9CA3AF';
const BG = '#F2F2F7';
const CARD_BG = '#FFFFFF';

/**
 * Safely extract lat/lng from a Firestore GeoPoint, which may arrive
 * as a class instance (with .latitude/.longitude getters) or as a
 * plain object (with _lat/_long fields after serialization).
 */
function geoPointToLatLng(gp: any): { latitude: number; longitude: number } | null {
  if (!gp) return null;
  const lat = gp.latitude ?? gp._lat;
  const lng = gp.longitude ?? gp._long ?? gp._lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return { latitude: lat, longitude: lng };
}

const HOME_RIDES_LOG = '[HomeRides]';

function homeRidesLog(message: string, payload?: unknown) {
  if (!__DEV__) return;
  if (payload !== undefined) {
    console.log(HOME_RIDES_LOG, message, payload);
  } else {
    console.log(HOME_RIDES_LOG, message);
  }
}

/**
 * Calendar date (YYYY-MM-DD) + clock time (HH:MM) in the device's local timezone.
 * Avoids `Date.parse` ambiguity where `YYYY-MM-DD` alone is UTC midnight.
 */
function parseLocalRideStart(ymd: string, requestedStart: string | undefined): Date {
  const parts = (ymd || '').split('-').map((p) => parseInt(p, 10));
  const y = parts[0];
  const mo = parts[1];
  const d = parts[2];
  if (!y || !mo || !d) return new Date(NaN);
  const start = requestedStart ?? '00:00';
  const [hRaw, mRaw] = start.split(':');
  const h = parseInt(hRaw ?? '0', 10) || 0;
  const mi = parseInt(mRaw ?? '0', 10) || 0;
  return new Date(y, mo - 1, d, h, mi, 0, 0);
}

function isValidTimeHHMM(value: string | undefined): boolean {
  if (!value) return false;
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [h, m] = value.split(':').map((x) => parseInt(x, 10));
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = parseLocalRideStart(dateStr, '00:00');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Returns the duration in minutes between two "HH:MM" strings. */
function getRideDurationMinutes(start: string, end: string): number {
  if (!start || !end || !start.includes(':') || !end.includes(':')) return 0;

  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);

  let minutes = (eh * 60 + em) - (sh * 60 + sm);

  if (minutes < 0) minutes += 24 * 60;

  return minutes;
}

/** Formats a minute count as "X hr Y min" or just "Y min". */
function formatDuration(minutes: number): string {
  if (minutes <= 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} hr ${m} min`;
  if (h > 0) return `${h} hr`;
  return `${m} min`;
}

function getDistanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): number {
  const R = 6371e3;
  const φ1 = (from.latitude * Math.PI) / 180;
  const φ2 = (to.latitude * Math.PI) / 180;
  const Δφ = ((to.latitude - from.latitude) * Math.PI) / 180;
  const Δλ = ((to.longitude - from.longitude) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function formatDistance(meters: number | null): string {
  if (meters == null) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function estimateETA(minutes: number | null): string {
  if (minutes == null) return '—';
  return `${Math.round(minutes)} min`;
}


interface RidePricingInfoProps {
  request: RideRequestWithId;
  rideDistanceMeters?: number | null;
}

function RidePricingInfo({ request, rideDistanceMeters }: RidePricingInfoProps) {
  const duration = getRideDurationMinutes(
    request.requestedStart,
    request.requestedEnd,
  );

  const fare =
    request.pricingSnapshot?.totalPrice ??
    request.pricingSnapshot?.baseFare ??
    (duration > 0
      ? Math.round((2.5 + duration * 0.4 + (rideDistanceMeters ?? 0) / 1609.34 * 1.2) * 2) / 2
      : null);

  const isEstimate =
    request.pricingSnapshot?.totalPrice == null &&
    request.pricingSnapshot?.baseFare == null;

  return (
    <View style={pricingStyles.row}>
      <View style={pricingStyles.item}>
        <Ionicons name="time-outline" size={14} color="#6B7280" />
        <Text style={pricingStyles.label}>Duration</Text>
        <Text style={pricingStyles.value}>{formatDuration(duration)}</Text>
      </View>

      <View style={pricingStyles.divider} />

      <View style={pricingStyles.item}>
        <Ionicons name="cash-outline" size={14} color="#6B7280" />
        <Text style={pricingStyles.label}>
          {isEstimate ? 'Est. Fare' : 'Fare'}
        </Text>
        <Text style={pricingStyles.value}>
          {fare != null ? `$${fare.toFixed(2)}` : '—'}
        </Text>
      </View>
    </View>
  );
}

const pricingStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    marginBottom: 12,
    overflow: 'hidden',
  },
  item: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 2,
  },
  divider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 8,
  },
  label: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  value: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
  },
});





function formatTime24to12(hhmm: string): string {
  if (!hhmm || !hhmm.includes(':')) return hhmm ?? '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const hours = h % 12 === 0 ? 12 : h % 12;
  return `${hours}:${String(m).padStart(2, '0')} ${period}`;
}

function placeholderOtherUser(uid: string): AppUser {
  return {
    uid,
    username: 'unknown',
    name: 'Unavailable',
    email: '',
    phone: '',
    address: '',
    bio: '',
    profilePhoto: '',
    roles: ['rider'],
    activeRole: 'rider',
    starRating: 0,
    rideCount: 0,
    bankInfo: null,
    fcmToken: '',
    profileComplete: false,
    missingFields: [],
    geohash: '',
    createdAt: Timestamp.now(),
    carDetails: null,
  };
}

function RidesListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={skeletonStyles.wrap}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={skeletonStyles.card}>
          <View style={skeletonStyles.shimmerRow}>
            <View style={[skeletonStyles.pill, skeletonStyles.shimmer]} />
            <View style={[skeletonStyles.pillSm, skeletonStyles.shimmer]} />
          </View>
          <View style={[skeletonStyles.line, skeletonStyles.shimmer]} />
          <View style={[skeletonStyles.lineShort, skeletonStyles.shimmer]} />
          <View style={[skeletonStyles.line, skeletonStyles.shimmer]} />
        </View>
      ))}
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 12, gap: 12, flex: 1 },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  shimmerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pill: { height: 22, width: '42%', borderRadius: 11, backgroundColor: '#E5E7EB' },
  pillSm: { height: 22, width: 72, borderRadius: 11, backgroundColor: '#E5E7EB' },
  line: { height: 14, width: '100%', borderRadius: 7, backgroundColor: '#EEF0F2' },
  lineShort: { height: 14, width: '55%', borderRadius: 7, backgroundColor: '#EEF0F2' },
  shimmer: { opacity: 0.85 },
});

export default function HomeScreenWrapper() {
  return (
    <HomeErrorBoundary>
      <HomeScreenInner />
    </HomeErrorBoundary>
  );
}

function HomeScreenInner() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('active');
  const [listenerKey, setListenerKey] = useState(0);
  const [subscriptionStatus, setSubscriptionStatus] = useState<
    'idle' | 'connecting' | 'live' | 'error'
  >('idle');
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [confirmations, setConfirmations] = useState<RideConfirmationWithId[]>([]);
  const [enrichedRides, setEnrichedRides] = useState<EnrichedRide[]>([]);
  const [fallbackUpcoming, setFallbackUpcoming] = useState<EnrichedRide[]>([]);
  const [enriching, setEnriching] = useState(false);
  const [enrichWarnings, setEnrichWarnings] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<AppUser | null>(null);
  const [riderRides, setRiderRides] = useState<RiderRideWithId[]>([]);
  const [activeRoute, setActiveRoute] = useState<RouteData | null>(null);
  const [distanceToDropoff, setDistanceToDropoff] = useState<number | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);

  const requestCache = useRef(new Map<string, RideRequestWithId>());
  const userCache = useRef(new Map<string, AppUser>());
  const addressCache = useRef(new Map<string, string>());
  const navigatedToRideRef = useRef<string | null>(null);
  const enrichGenRef = useRef(0);
  const inProgressNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmationsLengthRef = useRef(0);
  const userLocation = useUserLocation();

  confirmationsLengthRef.current = confirmations.length;

  useEffect(() => {
    homeRidesLog('auth state', {
      authLoading,
      hasUser: Boolean(user),
      uid: user?.uid ?? null,
      email: user?.email ?? null,
      authReady: !authLoading,
    });
  }, [authLoading, user]);

  useEffect(() => {
    if (!user) {
      setMyProfile(null);
      return;
    }
    let cancelled = false;
    getUser(user.uid)
      .then((profile) => {
        if (!cancelled) setMyProfile(profile);
      })
      .catch((e) => {
        homeRidesLog('getUser(my profile) failed', e);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setRiderRides([]);
      return;
    }
    let cancelled = false;
    getRiderRides(user.uid)
      .then((rides) => {
        if (!cancelled) setRiderRides(rides);
      })
      .catch((e) => {
        homeRidesLog('getRiderRides failed', e);
        if (!cancelled) setRiderRides([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  //HERE IS THE OLD CODE FOR SUBSCRIPTION DO NOT DELETE IT AGAIN
  // useEffect(() => {
  //   if (!user) {
  //     setSubscriptionStatus('idle');
  //     setSubscriptionError(null);
  //     setConfirmations([]);
  //     return;
  //   }
  //   setSubscriptionStatus('connecting');
  //   setSubscriptionError(null);
  //   const unsub = subscribeToUserConfirmations(
  //     user.uid,
  //     (confs) => {
  //       homeRidesLog('Firestore snapshot', {
  //         count: confs.length,
  //         ids: confs.map((c) => c.id),
  //       });
  //       setSubscriptionStatus('live');
  //       setSubscriptionError(null);
  //       setConfirmations(confs);
  //     },
  //     (err) => {
  //       homeRidesLog('Firestore listener error', err);
  //       setSubscriptionStatus('error');
  //       setSubscriptionError(err.message ?? String(err));
  //     },
  //   );
  //   return unsub;
  // }, [user, listenerKey]);

  useEffect(() => {
    if (!user) {
      setSubscriptionStatus('idle');
      setSubscriptionError(null);
      setConfirmations([]);
      setFallbackUpcoming([]);
      return;
    }
    setSubscriptionStatus('connecting');
    setSubscriptionError(null);

    homeRidesLog('subscribeToUserConfirmations', { uid: user.uid });

    const unsub = subscribeToUserConfirmations(
      user.uid,
      (confs) => {
        homeRidesLog('Firestore snapshot', {
          count: confs.length,
          ids: confs.map((c) => c.id),
        });
        setSubscriptionStatus('live');
        setSubscriptionError(null);
        setConfirmations(confs);
      },
      (err) => {
        homeRidesLog('Firestore listener error', err);
        setSubscriptionStatus('error');
        setSubscriptionError(err.message ?? String(err));
      },
    );
    return unsub;
  }, [user, listenerKey]);

  const enrichConfirmedRequestsAsUpcoming = useCallback(
    async (): Promise<void> => {
      if (!user) return;
      try {
        const [riderSnap, driverSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, 'rideRequests'),
              where('riderId', '==', user.uid),
              where('status', '==', 'confirmed'),
            ),
          ),
          getDocs(
            query(
              collection(db, 'rideRequests'),
              where('driverId', '==', user.uid),
              where('status', '==', 'confirmed'),
            ),
          ),
        ]);

        const riderReqs: RideRequestWithId[] = riderSnap.docs.map((d) => ({
          ...(d.data() as RideRequestWithId),
          id: d.id,
        }));
        const driverReqs: RideRequestWithId[] = driverSnap.docs.map((d) => ({
          ...(d.data() as RideRequestWithId),
          id: d.id,
        }));

        homeRidesLog('fallback upcoming query counts', {
          riderConfirmed: riderReqs.length,
          driverConfirmed: driverReqs.length,
        });

        // Merge and keep only future rides
        const map = new Map<string, RideRequestWithId>();
        for (const r of [...riderReqs, ...driverReqs]) {
          map.set(r.id, r);
        }

        const now = new Date();
        const upcomingReqs = [...map.values()].filter((req) => {
          const start = parseLocalRideStart(req.date, req.requestedStart);
          if (Number.isNaN(start.getTime())) return false;
          return start.getTime() > now.getTime();
        });

        const enriched: EnrichedRide[] = [];
        for (const req of upcomingReqs) {
          const pickup = geoPointToLatLng(req.pickupLocation);
          const dropoff = geoPointToLatLng(req.dropoffLocation);
          if (!pickup || !dropoff) continue;

          const otherId = req.driverId === user.uid ? req.riderId : req.driverId;
          let otherUser = userCache.current.get(otherId);
          if (!otherUser) {
            try {
              otherUser = await getUser(otherId);
              userCache.current.set(otherId, otherUser);
            } catch {
              otherUser = placeholderOtherUser(otherId);
              userCache.current.set(otherId, otherUser);
            }
          }

          const pickupKey = `${pickup.latitude},${pickup.longitude}`;
          let pickupAddr = addressCache.current.get(pickupKey);
          if (!pickupAddr) {
            try {
              pickupAddr = await reverseGeocode(pickup.latitude, pickup.longitude);
              addressCache.current.set(pickupKey, pickupAddr);
            } catch {
              pickupAddr = `${pickup.latitude.toFixed(4)}, ${pickup.longitude.toFixed(4)}`;
              addressCache.current.set(pickupKey, pickupAddr);
            }
          }

          const dropoffKey = `${dropoff.latitude},${dropoff.longitude}`;
          let dropoffAddr = addressCache.current.get(dropoffKey);
          if (!dropoffAddr) {
            try {
              dropoffAddr = await reverseGeocode(dropoff.latitude, dropoff.longitude);
              addressCache.current.set(dropoffKey, dropoffAddr);
            } catch {
              dropoffAddr = `${dropoff.latitude.toFixed(4)}, ${dropoff.longitude.toFixed(4)}`;
              addressCache.current.set(dropoffKey, dropoffAddr);
            }
          }

          // Synthetic confirmation for display purposes only (no ready/pickup actions)
          const syntheticConfirmation: RideConfirmationWithId = {
            id: `synthetic_${req.id}`,
            rideRequestId: req.id,
            driverId: req.driverId,
            riderId: req.riderId,
            active: false,
            riderReady: false,
            driverReady: false,
            bothConfirmedAt: null,
            pickupConfirmed: false,
            pickupConfirmedAt: null,
            reminderSent: false,
            status: 'waiting',
            nextRideDate: req.date,
            createdAt: Timestamp.now(),
          };

          enriched.push({
            confirmation: syntheticConfirmation,
            request: req,
            otherUser,
            pickupAddress: pickupAddr,
            dropoffAddress: dropoffAddr,
            synthetic: true,
          });
        }

        enriched.sort((a, b) => {
          const dateA = parseLocalRideStart(a.confirmation.nextRideDate, a.request.requestedStart);
          const dateB = parseLocalRideStart(b.confirmation.nextRideDate, b.request.requestedStart);
          return dateA.getTime() - dateB.getTime();
        });

        setFallbackUpcoming(enriched);
      } catch (e) {
        homeRidesLog('fallback upcoming from rideRequests failed', e);
        setFallbackUpcoming([]);
      }
    },
    [user],
  );

  useEffect(() => {
    if (!user) return;
    // Only use fallback when confirmations aren't coming through.
    if (subscriptionStatus !== 'live') return;
    if (confirmations.length > 0) {
      setFallbackUpcoming([]);
      return;
    }
    enrichConfirmedRequestsAsUpcoming();
  }, [user, subscriptionStatus, confirmations.length, enrichConfirmedRequestsAsUpcoming]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      if (cancelled) return;
      if (confirmationsLengthRef.current > 0) return;

      homeRidesLog('fallback: confirmations still empty → fetchUserConfirmationsOnce');

      try {
        const rows = await fetchUserConfirmationsOnce(user.uid);
        if (cancelled || confirmationsLengthRef.current > 0) return;
        if (rows.length === 0) {
          homeRidesLog('fallback: one-time fetch also returned zero active confirmations');
          return;
        }
        homeRidesLog('fallback: applying rows from one-time fetch', { count: rows.length });
        setConfirmations(rows);
      } catch (e) {
        homeRidesLog('fallback: fetch failed', e);
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [user, listenerKey]);

  const enrichRides = useCallback(
    async (confs: RideConfirmationWithId[]) => {
      if (!user) return;
      const gen = ++enrichGenRef.current;
      const warnings: string[] = [];

      const rows = await Promise.all(
        confs.map(async (conf) => {
          try {
            if (!conf?.rideRequestId || !conf?.driverId || !conf?.riderId) {
              warnings.push(`Skipped ${conf?.id ?? '?'}: missing rideRequestId/driverId/riderId`);
              return null;
            }

            let req = requestCache.current.get(conf.rideRequestId);
            if (!req) {
              req = (await getRideRequestById(conf.rideRequestId)) ?? undefined;
              if (req) requestCache.current.set(conf.rideRequestId, req);
            }
            if (!req) {
              warnings.push(`No rideRequest ${conf.rideRequestId} for confirmation ${conf.id}`);
              return null;
            }

            const pickup = geoPointToLatLng(req.pickupLocation);
            const dropoff = geoPointToLatLng(req.dropoffLocation);
            if (!pickup || !dropoff) {
              warnings.push(`Missing pickup/dropoff coords (request ${req.id}, confirmation ${conf.id})`);
              return null;
            }

            const otherId =
              conf.driverId === user.uid ? conf.riderId : conf.driverId;
            let otherUser = userCache.current.get(otherId);
            if (!otherUser) {
              try {
                otherUser = await getUser(otherId);
                userCache.current.set(otherId, otherUser);
              } catch (e) {
                homeRidesLog('getUser(other) failed, placeholder', { otherId, e });
                otherUser = placeholderOtherUser(otherId);
                userCache.current.set(otherId, otherUser);
              }
            }

            const pickupKey = `${pickup.latitude},${pickup.longitude}`;
            let pickupAddr = addressCache.current.get(pickupKey);
            if (!pickupAddr) {
              try {
                pickupAddr = await reverseGeocode(pickup.latitude, pickup.longitude);
                addressCache.current.set(pickupKey, pickupAddr);
              } catch (e) {
                homeRidesLog('reverseGeocode pickup failed', { pickupKey, e });
                pickupAddr = `${pickup.latitude.toFixed(4)}, ${pickup.longitude.toFixed(4)}`;
                addressCache.current.set(pickupKey, pickupAddr);
              }
            }

            const dropoffKey = `${dropoff.latitude},${dropoff.longitude}`;
            let dropoffAddr = addressCache.current.get(dropoffKey);
            if (!dropoffAddr) {
              try {
                dropoffAddr = await reverseGeocode(dropoff.latitude, dropoff.longitude);
                addressCache.current.set(dropoffKey, dropoffAddr);
              } catch (e) {
                homeRidesLog('reverseGeocode dropoff failed', { dropoffKey, e });
                dropoffAddr = `${dropoff.latitude.toFixed(4)}, ${dropoff.longitude.toFixed(4)}`;
                addressCache.current.set(dropoffKey, dropoffAddr);
              }
            }

            return {
              confirmation: conf,
              request: req,
              otherUser,
              pickupAddress: pickupAddr,
              dropoffAddress: dropoffAddr,
            } satisfies EnrichedRide;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            warnings.push(`Confirmation ${conf.id}: ${msg}`);
            homeRidesLog('enrich unexpected error', { confId: conf.id, e });
            return null;
          }
        }),
      );

      if (gen !== enrichGenRef.current) {
        homeRidesLog('enrich discarded (stale generation)', { gen, current: enrichGenRef.current });
        return;
      }

      const enriched = rows.filter((r): r is EnrichedRide => r != null);
      enriched.sort((a, b) => {
        const statusOrder: Record<string, number> = {
          in_progress: 0,
          both_ready: 1,
          waiting: 2,
        };
        const aOrder = statusOrder[a.confirmation.status] ?? 3;
        const bOrder = statusOrder[b.confirmation.status] ?? 3;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.confirmation.nextRideDate.localeCompare(b.confirmation.nextRideDate);
      });

      setEnrichedRides(enriched);
      setEnrichWarnings(warnings);
      homeRidesLog('enrich finished', { enriched: enriched.length, warnings: warnings.length });
    },
    [user],
  );

  // ORIGINAL CODE FOR ENRICH
  // useEffect(() => {
  //   if (!user) {
  //     setEnrichedRides([]);
  //     setEnriching(false);
  //     setEnrichWarnings([]);
  //     return;
  //   }
  //   if (confirmations.length === 0) {
  //     setEnrichedRides([]);
  //     setEnriching(false);
  //     setEnrichWarnings([]);
  //     return;
  //   }
  //   let cancelled = false;
  //   setEnriching(true);
  //   enrichRides(confirmations).finally(() => {
  //     if (!cancelled) setEnriching(false);
  //   });
  //   return () => {
  //     cancelled = true;
  //   };
  // }, [user, confirmations, enrichRides]);

  useEffect(() => {
    homeRidesLog('enrich effect', {
      hasUser: Boolean(user),
      confirmationsLength: confirmations.length,
    });

    if (!user) {
      setEnrichedRides([]);
      setEnriching(false);
      setEnrichWarnings([]);
      return;
    }
    if (confirmations.length === 0) {
      setEnrichedRides([]);
      setEnriching(false);
      setEnrichWarnings([]);
      return;
    }

    let cancelled = false;
    setEnriching(true);
    enrichRides(confirmations).finally(() => {
      if (!cancelled) setEnriching(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user, confirmations, enrichRides]);


  const handleManualRefresh = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    try {
      requestCache.current.clear();
      userCache.current.clear();
      addressCache.current.clear();
      enrichGenRef.current += 1;
      homeRidesLog('manual refresh: caches cleared, re-enriching', { confirmations: confirmations.length });

      let confs = confirmations;
      try {
        const fetched = await fetchUserConfirmationsOnce(user.uid);
        if (fetched.length > 0) {
          confs = fetched;
          setConfirmations(fetched);
          homeRidesLog('manual refresh: merged Firestore snapshot', {
            fetchedCount: fetched.length,
          });
        }
      } catch (e) {
        homeRidesLog('manual refresh: snapshot fetch skipped', e);
      }

      try {
        const rides = await getRiderRides(user.uid);
        setRiderRides(rides);
      } catch (e) {
        homeRidesLog('manual refresh: riderRides fetch skipped', e);
      }

      await enrichRides(confs);
      if (confs.length === 0) {
        await enrichConfirmedRequestsAsUpcoming();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      homeRidesLog('manual refresh failed', e);
      Alert.alert('Refresh failed', msg);
    } finally {
      setRefreshing(false);
    }
  }, [user, confirmations, enrichRides, enrichConfirmedRequestsAsUpcoming]);

  const handleRetrySubscription = useCallback(() => {
    homeRidesLog('retry subscription');
    setListenerKey((k) => k + 1);
  }, []);

  const riderRideById = useMemo(() => {
    const map = new Map<string, RiderRideWithId>();
    for (const ride of riderRides) {
      map.set(ride.id, ride);
    }
    return map;
  }, [riderRides]);

  const { upcoming, active } = useMemo(() => {
    const up: EnrichedRide[] = [];
    const act: EnrichedRide[] = [];
    const now = new Date();
  
    for (const ride of enrichedRides) {
      const st = ride.confirmation.status;
      const riderRideId = ride.request.riderRideId;
      const riderRide = riderRideId ? riderRideById.get(riderRideId) : null;
      // Request time is the authoritative scheduled slot. riderRides is only a fallback.
      const startTime = isValidTimeHHMM(ride.request.requestedStart)
        ? ride.request.requestedStart
        : riderRide?.departureTime;
      const rideStart = parseLocalRideStart(
        ride.confirmation.nextRideDate,
        startTime,
      );

      // Skip rides with invalid dates
      if (Number.isNaN(rideStart.getTime())) {
        continue;
      }

      const isFuture = rideStart.getTime() > now.getTime();

      // ACTIVE RIDES: in_progress, both_ready
      if (st === 'in_progress' || st === 'both_ready') {
        act.push(ride);
      }
      // UPCOMING RIDES: waiting status that are in the future
      else if (st === 'waiting' && isFuture) {
        up.push(ride);
      }
    }

    homeRidesLog('filter rides', {
      enrichedCount: enrichedRides.length,
      activeCount: act.length,
      upcomingCount: up.length,
      riderRidesCount: riderRides.length,
    });
    
    // Sort upcoming by date (soonest first)
    up.sort((a, b) => {
      const riderRideA = a.request.riderRideId ? riderRideById.get(a.request.riderRideId) : null;
      const riderRideB = b.request.riderRideId ? riderRideById.get(b.request.riderRideId) : null;
      const startA = isValidTimeHHMM(a.request.requestedStart)
        ? a.request.requestedStart
        : riderRideA?.departureTime;
      const startB = isValidTimeHHMM(b.request.requestedStart)
        ? b.request.requestedStart
        : riderRideB?.departureTime;
      const dateA = parseLocalRideStart(
        a.confirmation.nextRideDate,
        startA,
      );
      const dateB = parseLocalRideStart(
        b.confirmation.nextRideDate,
        startB,
      );
      return dateA.getTime() - dateB.getTime();
    });
    
    return { upcoming: up, active: act };
  }, [enrichedRides, riderRideById, riderRides.length]);

  const upcomingMerged = useMemo(() => {
    if (fallbackUpcoming.length === 0) return upcoming;
    const seen = new Set(upcoming.map((r) => r.confirmation.rideRequestId));
    const merged = [...upcoming];
    for (const r of fallbackUpcoming) {
      if (!seen.has(r.confirmation.rideRequestId)) merged.push(r);
    }
    merged.sort((a, b) => {
      const dateA = parseLocalRideStart(a.confirmation.nextRideDate, a.request.requestedStart);
      const dateB = parseLocalRideStart(b.confirmation.nextRideDate, b.request.requestedStart);
      return dateA.getTime() - dateB.getTime();
    });
    return merged;
  }, [upcoming, fallbackUpcoming]);
  
  
  useEffect(() => {
    if (!userLocation || active.length === 0) {
      setActiveRoute(null);
      setDistanceToDropoff(null);
      setEtaMinutes(null);
      return;
    }

    const ride = active[0];
    const dropoff = geoPointToLatLng(ride.request.dropoffLocation);

    if (!dropoff) {
      setActiveRoute(null);
      setDistanceToDropoff(null);
      setEtaMinutes(null);
      return;
    }

    // Fetch route with actual drive time calculation (like Uber)
    fetchRouteWithSteps(userLocation, dropoff).then((result) => {
      // Set the route coordinates for map display
      setActiveRoute({ coordinates: result.coordinates });

      // Use the actual route distance (not straight-line)
      setDistanceToDropoff(result.totalDistance);

      // Use OSRM's calculated drive time (accounts for roads, speed limits, turns, etc.)
      if (result.totalDuration && result.totalDuration > 0) {
        setEtaMinutes(result.totalDuration / 60); // Convert seconds to minutes
      } else {
        setEtaMinutes(null);
      }
    }).catch((error) => {
      console.warn('Failed to fetch route for ETA:', error);
      // Fallback: use straight-line distance and estimate
      const distance = getDistanceMeters(userLocation, dropoff);
      setDistanceToDropoff(distance);
      const speedMetersPerMin = 35 * 1609 / 60;
      setEtaMinutes(distance / speedMetersPerMin);
    });
  }, [userLocation, active]);



  // Auto-navigate to ride screen when an in_progress ride is detected (delayed so the home list is visible briefly)
  useEffect(() => {
    const inProgress = active.find((r) => r.confirmation.status === 'in_progress');
    const clearTimer = () => {
      if (inProgressNavTimerRef.current) {
        clearTimeout(inProgressNavTimerRef.current);
        inProgressNavTimerRef.current = null;
      }
    };

    if (!inProgress) {
      clearTimer();
      navigatedToRideRef.current = null;
      return;
    }
    if (navigatedToRideRef.current === inProgress.confirmation.id) return;

    clearTimer();
    const id = inProgress.confirmation.id;
    homeRidesLog('schedule delayed navigation to ride screen', { confirmationId: id });
    inProgressNavTimerRef.current = setTimeout(() => {
      inProgressNavTimerRef.current = null;
      navigatedToRideRef.current = id;
      router.push({
        pathname: '/ride/[id]',
        params: { id },
      });
    }, 2200);
    return clearTimer;
  }, [active, router]);

  const myRole: 'driver' | 'rider' | null = useMemo(() => {
    if (!myProfile) return null;
    return myProfile.activeRole;
  }, [myProfile]);

  const handleMarkReady = async (ride: EnrichedRide) => {
    if (!myRole) return;
    setActingOn(ride.confirmation.id);
    try {
      await markReady(ride.confirmation.id, myRole);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not mark ready.');
    } finally {
      setActingOn(null);
    }
  };

  const handleCancelReady = async (ride: EnrichedRide) => {
    if (!myRole) return;
    setActingOn(ride.confirmation.id);
    try {
      await cancelReady(ride.confirmation.id, myRole);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not cancel ready status.');
    } finally {
      setActingOn(null);
    }
  };

  const handleConfirmPickup = async (ride: EnrichedRide) => {
    setActingOn(ride.confirmation.id);
    try {
      await confirmPickup(ride.confirmation.id);
      navigatedToRideRef.current = ride.confirmation.id;
      router.push({
        pathname: '/ride/[id]',
        params: { id: ride.confirmation.id },
      });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not confirm pickup.');
    } finally {
      setActingOn(null);
    }
  };

  const handleCompleteRide = async (ride: EnrichedRide) => {
    setActingOn(ride.confirmation.id);
    try {
      await completeRide(ride.confirmation.id);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not complete ride.');
    } finally {
      setActingOn(null);
    }
  };

  const handleMessage = async (otherUserId: string) => {
    if (!user) return;
    try {
      const { conversationId, isPending } = await getOrCreateConversation(
        user.uid,
        otherUserId,
      );
      router.push({
        pathname: '/conversation/[id]',
        params: {
          id: conversationId,
          otherUserId,
          pending: isPending ? 'true' : 'false',
        },
      });
    } catch {
      Alert.alert('Error', 'Could not open conversation.');
    }
  };

  const handleViewProfile = (otherUser: AppUser) => {
    router.push({
      pathname: '/driver-details',
      params: {
        id: otherUser.uid,
        name: otherUser.name,
        rating: String(otherUser.starRating ?? 0),
        totalRides: String(otherUser.rideCount ?? 0),
        bio: otherUser.bio ?? '',
      },
    });
  };

  const isUserReady = (ride: EnrichedRide): boolean => {
    if (!user) return false;
    if (ride.confirmation.driverId === user.uid) return ride.confirmation.driverReady;
    return ride.confirmation.riderReady;
  };

  const renderActiveRides = () => {
    if (active.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="car-outline" size={48} color={TEXT_MUTED} />
          <Text style={styles.emptyTitle}>No active rides</Text>
          <Text style={styles.emptySubtitle}>
            When both you and your match confirm, the ride will appear here
          </Text>
        </View>
      );
    }

    const first = active[0];
    const pickup = geoPointToLatLng(first.request.pickupLocation);
    const dropoff = geoPointToLatLng(first.request.dropoffLocation);

    const markers: MarkerData[] = [];

    if (userLocation) {
      markers.unshift({
        ...userLocation,
        title: 'You',
        color: ACCENT, // blue circle distinguishes you from pickup/dropoff
        isUserLocation: true,

      });
    }

    if (pickup) {
      markers.push({ ...pickup, title: 'Pickup', color: GREEN });
    }
    if (dropoff) {
      markers.push({ ...dropoff, title: 'Dropoff', color: RED });
    }

    const midLat = pickup && dropoff
      ? (pickup.latitude + dropoff.latitude) / 2
      : pickup?.latitude ?? dropoff?.latitude ?? 33.749;
    const midLng = pickup && dropoff
      ? (pickup.longitude + dropoff.longitude) / 2
      : pickup?.longitude ?? dropoff?.longitude ?? -84.388;

    return (
      <View style={styles.activeContainer}>
        <View style={styles.mapContainer}>
          <MapView
            latitude={midLat}
            longitude={midLng}
            markers={markers}
            route={activeRoute ?? undefined}
          />
        </View>

        <ScrollView
          style={styles.activeCards}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleManualRefresh}
              tintColor={ACCENT}
            />
          }
        >
          {active.map((ride) => (
            <View key={ride.confirmation.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.statusBadge}>
                  <View
                    style={[
                      styles.statusDot,
                      ride.confirmation.status === 'in_progress'
                        ? styles.dotGreen
                        : styles.dotOrange,
                    ]}
                  />
                  <Text style={styles.statusText}>
                    {ride.confirmation.status === 'in_progress'
                      ? 'In Progress'
                      : ride.confirmation.status === 'both_ready'
                        ? 'Waiting for Pickup'
                        : ride.confirmation.active
                          ? 'Starting soon'
                          : 'Scheduled'}
                  </Text>
                </View>
                <Text style={styles.cardDate}>
                  {formatDate(ride.confirmation.nextRideDate)}
                </Text>
              </View>

              <View style={styles.cardTime}>
                <Ionicons name="time-outline" size={16} color={TEXT_SECONDARY} />
                <Text style={styles.cardTimeText}>
                  {formatTime24to12(ride.request.requestedStart)} –{' '}
                  {formatTime24to12(ride.request.requestedEnd)}
                </Text>
              </View>

              <View style={styles.locationBlock}>
                <View style={styles.locationRow}>
                  <View style={[styles.locationDot, { backgroundColor: GREEN }]} />
                  <Text style={styles.locationText} numberOfLines={1}>
                    {ride.pickupAddress}
                  </Text>
                </View>
                <View style={styles.locationConnector} />
                <View style={styles.locationRow}>
                  <View style={[styles.locationDot, { backgroundColor: RED }]} />
                  <Text style={styles.locationText} numberOfLines={1}>
                    {ride.dropoffAddress}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Ionicons name="navigate-outline" size={14} color="#6B7280" />
                <Text style={{ fontSize: 13, color: '#6B7280', fontWeight: '500' }}>
                  {formatDistance(distanceToDropoff)} • {estimateETA(etaMinutes)} away
                </Text>
              </View>

              <TouchableOpacity
                style={styles.profileRow}
                onPress={() => handleViewProfile(ride.otherUser)}
              >
                <View style={styles.avatarSmall}>
                  <Ionicons name="person" size={18} color="#999" />
                </View>
                <View style={styles.profileInfo}>
                  <Text style={styles.profileName}>{ride.otherUser.name}</Text>
                  <View style={styles.ratingRow}>
                    <Ionicons name="star" size={12} color="#FFB800" />
                    <Text style={styles.ratingText}>
                      {(ride.otherUser.starRating ?? 0).toFixed(1)}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
              </TouchableOpacity>

              <View style={styles.cardActions}>
                {ride.confirmation.status === 'both_ready' && (
                  <TouchableOpacity
                    style={[styles.primaryButton, actingOn === ride.confirmation.id && styles.buttonDisabled]}
                    onPress={() => handleConfirmPickup(ride)}
                    disabled={actingOn === ride.confirmation.id}
                  >
                    {actingOn === ride.confirmation.id ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={18} color="#fff" />
                        <Text style={styles.primaryButtonText}>Confirm Pickup</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
                {ride.confirmation.status === 'in_progress' && (
                  <TouchableOpacity
                    style={[styles.primaryButton, styles.completeButton, actingOn === ride.confirmation.id && styles.buttonDisabled]}
                    onPress={() => handleCompleteRide(ride)}
                    disabled={actingOn === ride.confirmation.id}
                  >
                    {actingOn === ride.confirmation.id ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="flag" size={18} color="#fff" />
                        <Text style={styles.primaryButtonText}>Complete Ride</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.messageChip}
                  onPress={() => handleMessage(ride.otherUser.uid)}
                >
                  <Ionicons name="chatbubble-ellipses" size={16} color={ACCENT} />
                  <Text style={styles.messageChipText}>Message</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderUpcomingRides = () => {
    if (upcomingMerged.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={48} color={TEXT_MUTED} />
          <Text style={styles.emptyTitle}>No upcoming rides</Text>
          <Text style={styles.emptySubtitle}>
            Find a driver in the Match tab to get started
          </Text>
        </View>
      );
    }

    interface ViewScheduleButtonProps {
      onPress: () => void;
    }

    function ViewScheduleButton({ onPress }: ViewScheduleButtonProps) {
      return (
        <TouchableOpacity style={scheduleStyles.button} onPress={onPress}>
          <Ionicons name="calendar" size={18} color="#007AFF" />
          <Text style={scheduleStyles.text}>View Schedule</Text>
          <Ionicons name="chevron-forward" size={16} color="#007AFF" />
        </TouchableOpacity>
      );
    }

    const scheduleStyles = StyleSheet.create({
      button: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EFF6FF',
        marginHorizontal: 16,
        marginTop: 12,
        padding: 14,
        borderRadius: 12,
        gap: 8,
      },
      text: {
        flex: 1,
        fontSize: 15,
        fontWeight: '600',
        color: '#007AFF',
      },
    });

    return (
      <>
        <ViewScheduleButton
          onPress={() => router.push({ pathname: '/(tabs)/history' })}
        />
        <ScrollView
          style={styles.upcomingList}
          contentContainerStyle={styles.upcomingContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleManualRefresh}
              tintColor={ACCENT}
            />
          }
        >
          <UpcomingMapSection upcoming={upcomingMerged} userLocation={userLocation} />
          {upcomingMerged.map((ride) => {
            const isDriver = ride.confirmation.driverId === user?.uid;
            const isRider = ride.confirmation.riderId === user?.uid;

            const driverReady = ride.confirmation.driverReady ?? false;
            const riderReady = ride.confirmation.riderReady ?? false;

            // For the current user, are THEY ready?
            const iAmReady = isDriver ? driverReady : riderReady;
            // Is the OTHER party ready?
            const otherReady = isDriver ? riderReady : driverReady;

            // Only show I'm Ready button within 30 minutes of pickup
            const now = new Date();
            const rideStart = parseLocalRideStart(
              ride.confirmation.nextRideDate,
              ride.request.requestedStart,
            );
            const minutesUntilStart = (rideStart.getTime() - now.getTime()) / (1000 * 60);
            const within30Min = minutesUntilStart <= 30 && minutesUntilStart > -60;

            return (
              <View key={ride.confirmation.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardDateLarge}>
                    {formatDate(ride.confirmation.nextRideDate)}
                  </Text>
                  <View style={styles.statusBadge}>
                    <Ionicons name="time-outline" size={14} color={TEXT_MUTED} />
                    <Text style={styles.statusText}>
                      {ride.synthetic ? 'Scheduled (syncing…)': 'Scheduled'}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardTime}>
                  <Ionicons name="time-outline" size={16} color={TEXT_SECONDARY} />
                  <Text style={styles.cardTimeText}>
                    {formatTime24to12(ride.request.requestedStart)} –{' '}
                    {formatTime24to12(ride.request.requestedEnd)}
                  </Text>
                </View>

                <View style={styles.locationBlock}>
                  <View style={styles.locationRow}>
                    <View style={[styles.locationDot, { backgroundColor: GREEN }]} />
                    <Text style={styles.locationText} numberOfLines={1}>
                      {ride.pickupAddress}
                    </Text>
                  </View>
                  <View style={styles.locationConnector} />
                  <View style={styles.locationRow}>
                    <View style={[styles.locationDot, { backgroundColor: RED }]} />
                    <Text style={styles.locationText} numberOfLines={1}>
                      {ride.dropoffAddress}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.profileRow}
                  onPress={() => handleViewProfile(ride.otherUser)}
                >
                  <RidePricingInfo
                    request={ride.request}
                    rideDistanceMeters={
                      geoPointToLatLng(ride.request.pickupLocation) &&
                        geoPointToLatLng(ride.request.dropoffLocation)
                        ? getDistanceMeters(
                          geoPointToLatLng(ride.request.pickupLocation)!,
                          geoPointToLatLng(ride.request.dropoffLocation)!
                        )
                        : null
                    }
                  />
                  <View style={styles.avatarSmall}>
                    <Ionicons name="person" size={18} color="#999" />
                  </View>
                  <View style={styles.profileInfo}>
                    <Text style={styles.profileName}>{ride.otherUser.name}</Text>
                    <View style={styles.ratingRow}>
                      <Ionicons name="star" size={12} color="#FFB800" />
                      <Text style={styles.ratingText}>
                        {(ride.otherUser.starRating ?? 0).toFixed(1)}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
                </TouchableOpacity>

                <View style={styles.cardActions}>
                  {/* DRIVER: auto-ready, show static waiting badge */}
                  {isDriver && within30Min && !ride.synthetic && (
                    <View style={styles.waitingBadge}>
                      <Ionicons name="checkmark-circle" size={16} color={GREEN} />
                      <Text style={[styles.waitingText, { color: GREEN }]}>
                        {otherReady ? 'Both ready!' : "You're set — waiting for rider"}
                      </Text>
                    </View>
                  )}

                  {/* RIDER: manual I'm Ready, with cancel, only within 30 min */}
                  {isRider && within30Min && !iAmReady && !ride.synthetic && (
                    <TouchableOpacity
                      style={[
                        styles.primaryButton,
                        styles.readyButton,
                        actingOn === ride.confirmation.id && styles.buttonDisabled,
                      ]}
                      onPress={() => handleMarkReady(ride)}
                      disabled={actingOn === ride.confirmation.id}
                    >
                      {actingOn === ride.confirmation.id ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <Ionicons name="hand-left" size={18} color="#fff" />
                          <Text style={styles.primaryButtonText}>I'm Ready</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}

                  {/* RIDER: already ready — show static waiting + cancel option */}
                  {isRider && within30Min && iAmReady && !ride.synthetic && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <View style={[styles.waitingBadge, { flex: 1 }]}>
                        <Ionicons name="checkmark-circle" size={16} color={GREEN} />
                        <Text style={[styles.waitingText, { color: GREEN }]}>
                          {otherReady ? 'Both ready!' : 'Waiting for driver...'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.cancelReadyButton, actingOn === ride.confirmation.id && styles.buttonDisabled]}
                        onPress={() => handleCancelReady(ride)}
                        disabled={actingOn === ride.confirmation.id}
                      >
                        {actingOn === ride.confirmation.id ? (
                          <ActivityIndicator color={RED} size="small" />
                        ) : (
                          <Text style={styles.cancelReadyText}>Cancel</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.messageChip}
                    onPress={() => handleMessage(ride.otherUser.uid)}
                  >
                    <Ionicons name="chatbubble-ellipses" size={16} color={ACCENT} />
                    <Text style={styles.messageChipText}>Message</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </>
    );
  };

  const showBlockingSkeleton =
    Boolean(user) && subscriptionStatus === 'connecting';
  const showEnrichSkeleton =
    Boolean(user) &&
    subscriptionStatus === 'live' &&
    enriching &&
    confirmations.length > 0 &&
    enrichedRides.length === 0;

  if (authLoading) {
    return (
      <View style={styles.centered} accessibilityLabel="Signing you in">
        <ActivityIndicator size="large" color={ACCENT} />
        <Text style={{ marginTop: 12, color: TEXT_SECONDARY, fontSize: 15 }}>
          Signing you in…
        </Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.centered}>
        <Ionicons name="log-in-outline" size={48} color={TEXT_MUTED} />
        <Text style={styles.emptyTitle}>Sign in required</Text>
        <Text style={[styles.emptySubtitle, { textAlign: 'center', paddingHorizontal: 32 }]}>
          Log in to view and manage your rides.
        </Text>
        <TouchableOpacity
          style={[styles.primaryButton, { marginTop: 24, paddingHorizontal: 28 }]}
          onPress={() => router.push('/login')}
          accessibilityRole="button"
          accessibilityLabel="Go to login"
        >
          <Text style={styles.primaryButtonText}>Go to login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>My Rides</Text>
          <TouchableOpacity
            onPress={handleManualRefresh}
            disabled={!user || refreshing || enriching}
            style={styles.headerRefresh}
            accessibilityLabel="Refresh rides"
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={ACCENT} />
            ) : (
              <Ionicons name="refresh" size={22} color={ACCENT} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {subscriptionError ? (
        <View style={styles.errorBanner}>
          <Ionicons name="cloud-offline-outline" size={22} color="#B91C1C" />
          <View style={styles.errorBannerBody}>
            <Text style={styles.errorBannerTitle}>Could not sync rides</Text>
            <Text style={styles.errorBannerText} numberOfLines={5}>
              {subscriptionError}
            </Text>
          </View>
          <TouchableOpacity style={styles.errorBannerRetry} onPress={handleRetrySubscription}>
            <Text style={styles.errorBannerRetryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {enrichWarnings.length > 0 ? (
        <View style={styles.warnBanner}>
          <Ionicons name="warning-outline" size={18} color="#92400E" />
          <Text style={styles.warnBannerText} numberOfLines={3}>
            {enrichWarnings.length} confirmation(s) skipped or partially loaded. Pull down to retry.
          </Text>
        </View>
      ) : null}

      {showBlockingSkeleton ? (
        <RidesListSkeleton count={4} />
      ) : (
        <>
      <View style={styles.toggleBar}>
        <TouchableOpacity
          style={[styles.toggleTab, tab === 'active' && styles.toggleTabActive]}
          onPress={() => setTab('active')}
        >
          <Text
            style={[styles.toggleText, tab === 'active' && styles.toggleTextActive]}
          >
            Active
          </Text>
          {active.length > 0 && (
            <View style={[styles.badge, tab === 'active' && styles.badgeOnActive]}>
              <Text style={[styles.badgeText, tab === 'active' && styles.badgeTextOnActive]}>
                {active.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleTab, tab === 'upcoming' && styles.toggleTabActive]}
          onPress={() => setTab('upcoming')}
        >
          <Text
            style={[styles.toggleText, tab === 'upcoming' && styles.toggleTextActive]}
          >
            Upcoming
          </Text>
          {upcoming.length > 0 && (
            <View style={[styles.badge, tab === 'upcoming' && styles.badgeOnActive]}>
              <Text style={[styles.badgeText, tab === 'upcoming' && styles.badgeTextOnActive]}>
                {upcoming.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {showEnrichSkeleton ? (
            <RidesListSkeleton count={3} />
          ) : (
            tab === 'active' ? renderActiveRides() : renderUpcomingRides()
          )}
        </>
      )}
    </View>
  );
}

/** Call inside HomeScreenInner to get live device location. */
function useUserLocation() {
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      // Get an immediate fix first…
      const initial = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setUserLocation({
        latitude: initial.coords.latitude,
        longitude: initial.coords.longitude,
      });

      // …then keep watching for updates.
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 20 },
        (loc) =>
          setUserLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          }),
      );
    })();

    return () => {
      sub?.remove();
    };
  }, []);

  return userLocation;
}

function UpcomingMapSection({ upcoming, userLocation }: UpcomingMapSectionProps) {
  const upcomingMarkers: MarkerData[] = [];

  if (userLocation) {
    upcomingMarkers.push({
      ...userLocation,
      title: 'You',
      color: '#007AFF',
      isUserLocation: true,
      calloutLines: ['📍 Your location'],
    });
  }

  upcoming.forEach((ride) => {
    const pickup = geoPointToLatLng(ride.request.pickupLocation);
    const dropoff = geoPointToLatLng(ride.request.dropoffLocation);

    if (pickup) {
      upcomingMarkers.push({
        ...pickup,
        title: `Pickup – ${ride.otherUser.name}`,
        color: GREEN,
        calloutLines: [
          `📍 Pickup with ${ride.otherUser.name}`,
          ride.pickupAddress,
          formatDate(ride.confirmation.nextRideDate),
          formatTime24to12(ride.request.requestedStart),
        ],
      });
    }
    if (dropoff) {
      upcomingMarkers.push({
        ...dropoff,
        title: `Drop-off – ${ride.otherUser.name}`,
        color: RED,
        calloutLines: [
          `🏁 Drop-off – ${ride.otherUser.name}`,
          ride.dropoffAddress,
          formatDate(ride.confirmation.nextRideDate),
          formatTime24to12(ride.request.requestedEnd),
        ],
      });
    }
  });

  // Centre map on user, or first marker, or a US default
  const centre = userLocation ??
    (upcomingMarkers[0]
      ? { latitude: upcomingMarkers[0].latitude, longitude: upcomingMarkers[0].longitude }
      : { latitude: 33.749, longitude: -84.388 });

  if (upcomingMarkers.length === 0) return null;

  return (
    <View style={{ height: 200 }}>
      <MapView
        latitude={centre.latitude}
        longitude={centre.longitude}
        markers={upcomingMarkers}
      />
    </View>
  );
}





const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BG,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: TEXT_PRIMARY,
    flex: 1,
  },
  headerRefresh: {
    padding: 8,
    marginRight: -4,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderBottomWidth: 1,
    borderBottomColor: '#FECACA',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  errorBannerBody: {
    flex: 1,
    minWidth: 0,
  },
  errorBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991B1B',
    marginBottom: 4,
  },
  errorBannerText: {
    fontSize: 13,
    color: '#7F1D1D',
    lineHeight: 18,
  },
  errorBannerRetry: {
    backgroundColor: '#B91C1C',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'center',
  },
  errorBannerRetryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  warnBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
  },

  toggleBar: {
    flexDirection: 'row',
    backgroundColor: CARD_BG,
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  toggleTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    gap: 6,
  },
  toggleTabActive: {
    backgroundColor: ACCENT,
  },
  toggleText: {
    fontSize: 15,
    fontWeight: '600',
    color: TEXT_SECONDARY,
  },
  toggleTextActive: {
    color: '#fff',
  },
  badge: {
    backgroundColor: '#E5E7EB',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeOnActive: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: TEXT_SECONDARY,
  },
  badgeTextOnActive: {
    color: '#fff',
  },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginTop: 12,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 20,
  },

  activeContainer: {
    flex: 1,
  },
  mapContainer: {
    height: 240,
  },
  activeCards: {
    flex: 1,
  },

  upcomingList: {
    flex: 1,
  },
  upcomingContent: {
    paddingBottom: 40,
  },

  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardDate: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_SECONDARY,
  },
  cardDateLarge: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeActive: {
    backgroundColor: '#ECFDF5',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotGreen: {
    backgroundColor: GREEN,
  },
  dotOrange: {
    backgroundColor: ORANGE,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: TEXT_SECONDARY,
  },

  cardTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  cardTimeText: {
    fontSize: 14,
    fontWeight: '500',
    color: TEXT_PRIMARY,
  },

  locationBlock: {
    marginBottom: 14,
    paddingLeft: 2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  locationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  locationText: {
    flex: 1,
    fontSize: 13,
    color: TEXT_SECONDARY,
  },
  locationConnector: {
    width: 2,
    height: 14,
    backgroundColor: '#E5E7EB',
    marginLeft: 4,
    marginVertical: 2,
  },

  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 10,
  },
  avatarSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 15,
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 1,
  },
  ratingText: {
    fontSize: 12,
    color: TEXT_SECONDARY,
  },

  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 6,
  },
  readyButton: {
    backgroundColor: GREEN,
  },
  completeButton: {
    backgroundColor: GREEN,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  messageChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: ACCENT,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 5,
  },
  messageChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: ACCENT,
  },

  waitingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF8F0',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  cancelReadyButton: {
    borderWidth: 1.5,
    borderColor: RED,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  cancelReadyText: {
    fontSize: 13,
    fontWeight: '600',
    color: RED,
  },
  waitingText: {
    fontSize: 13,
    fontWeight: '500',
    color: ORANGE,
  },
  scheduledNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scheduledNoteText: {
    fontSize: 12,
    color: TEXT_MUTED,
  },
});
