import { useAuth } from '@/context/AuthContext';
import {
  confirmPickup,
  completeRide,
  markReady,
  subscribeToUserConfirmations,
  type RideConfirmationWithId,
} from '@/services/rideConfirmationService';
import { getOrCreateConversation } from '@/services/messagingService';
import { getRideRequestById, type RideRequestWithId } from '@/services/rideRequestService';
import { getUser } from '@/services/userService';
import type { User as AppUser } from '@/types/user';
import { reverseGeocode } from '@/utils/geocoding';
import { fetchRoute } from '@/utils/routing';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
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

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime24to12(hhmm: string): string {
  if (!hhmm || !hhmm.includes(':')) return hhmm ?? '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const hours = h % 12 === 0 ? 12 : h % 12;
  return `${hours}:${String(m).padStart(2, '0')} ${period}`;
}

export default function HomeScreenWrapper() {
  return (
    <HomeErrorBoundary>
      <HomeScreenInner />
    </HomeErrorBoundary>
  );
}

function HomeScreenInner() {
  const { user } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('active');
  const [loading, setLoading] = useState(true);
  const [confirmations, setConfirmations] = useState<RideConfirmationWithId[]>([]);
  const [enrichedRides, setEnrichedRides] = useState<EnrichedRide[]>([]);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<AppUser | null>(null);
  const [activeRoute, setActiveRoute] = useState<RouteData | null>(null);

  const requestCache = useRef(new Map<string, RideRequestWithId>());
  const userCache = useRef(new Map<string, AppUser>());
  const addressCache = useRef(new Map<string, string>());
  const navigatedToRideRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getUser(user.uid)
      .then(setMyProfile)
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const unsub = subscribeToUserConfirmations(
      user.uid,
      (confs) => {
        setConfirmations(confs);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [user]);

  const enrichRides = useCallback(
    async (confs: RideConfirmationWithId[]) => {
      if (!user) return;

      const enriched: EnrichedRide[] = [];
      await Promise.all(
        confs.map(async (conf) => {
          try {
            if (!conf?.rideRequestId || !conf?.driverId || !conf?.riderId) return;

            let req = requestCache.current.get(conf.rideRequestId);
            if (!req) {
              req = (await getRideRequestById(conf.rideRequestId)) ?? undefined;
              if (req) requestCache.current.set(conf.rideRequestId, req);
            }
            if (!req) return;

            const pickup = geoPointToLatLng(req.pickupLocation);
            const dropoff = geoPointToLatLng(req.dropoffLocation);
            if (!pickup || !dropoff) return;

            const otherId =
              conf.driverId === user.uid ? conf.riderId : conf.driverId;
            let otherUser = userCache.current.get(otherId);
            if (!otherUser) {
              otherUser = await getUser(otherId);
              userCache.current.set(otherId, otherUser);
            }

            const pickupKey = `${pickup.latitude},${pickup.longitude}`;
            let pickupAddr = addressCache.current.get(pickupKey);
            if (!pickupAddr) {
              pickupAddr = await reverseGeocode(pickup.latitude, pickup.longitude);
              addressCache.current.set(pickupKey, pickupAddr);
            }

            const dropoffKey = `${dropoff.latitude},${dropoff.longitude}`;
            let dropoffAddr = addressCache.current.get(dropoffKey);
            if (!dropoffAddr) {
              dropoffAddr = await reverseGeocode(dropoff.latitude, dropoff.longitude);
              addressCache.current.set(dropoffKey, dropoffAddr);
            }

            enriched.push({
              confirmation: conf,
              request: req,
              otherUser,
              pickupAddress: pickupAddr,
              dropoffAddress: dropoffAddr,
            });
          } catch (e) {
            console.error('Error enriching ride confirmation:', e);
          }
        }),
      );

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
    },
    [user],
  );

  useEffect(() => {
    if (confirmations.length === 0) {
      setEnrichedRides([]);
      return;
    }
    enrichRides(confirmations);
  }, [confirmations, enrichRides]);

  const { upcoming, active } = useMemo(() => {
    const up: EnrichedRide[] = [];
    const act: EnrichedRide[] = [];
    for (const ride of enrichedRides) {
      if (ride.confirmation.status === 'waiting') {
        up.push(ride);
      } else {
        act.push(ride);
      }
    }
    return { upcoming: up, active: act };
  }, [enrichedRides]);

  useEffect(() => {
    if (active.length === 0) {
      setActiveRoute(null);
      return;
    }
    const first = active[0];
    const pickup = geoPointToLatLng(first.request.pickupLocation);
    const dropoff = geoPointToLatLng(first.request.dropoffLocation);
    if (!pickup || !dropoff) {
      setActiveRoute(null);
      return;
    }
    fetchRoute(pickup, dropoff).then((coords) =>
      setActiveRoute({ coordinates: coords }),
    );
  }, [active]);

  // Auto-navigate to ride screen when an in_progress ride is detected
  useEffect(() => {
    const inProgress = active.find((r) => r.confirmation.status === 'in_progress');
    if (!inProgress) {
      navigatedToRideRef.current = null;
      return;
    }
    if (navigatedToRideRef.current === inProgress.confirmation.id) return;
    navigatedToRideRef.current = inProgress.confirmation.id;
    router.push({
      pathname: '/ride/[id]',
      params: { id: inProgress.confirmation.id },
    });
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

        <ScrollView style={styles.activeCards} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
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
                      : 'Waiting for Pickup'}
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
    if (upcoming.length === 0) {
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

    return (
      <ScrollView style={styles.upcomingList} contentContainerStyle={styles.upcomingContent} showsVerticalScrollIndicator={false}>
        {upcoming.map((ride) => {
          const ready = isUserReady(ride);
          const canConfirm = !ready;
          const waitingOther = ready;

          return (
            <View key={ride.confirmation.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardDateLarge}>
                  {formatDate(ride.confirmation.nextRideDate)}
                </Text>
                <View style={styles.statusBadge}>
                  <Ionicons name="time-outline" size={14} color={TEXT_MUTED} />
                  <Text style={styles.statusText}>Scheduled</Text>
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
                {canConfirm && (
                  <TouchableOpacity
                    style={[styles.primaryButton, styles.readyButton, actingOn === ride.confirmation.id && styles.buttonDisabled]}
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
                {waitingOther && (
                  <View style={styles.waitingBadge}>
                    <ActivityIndicator size="small" color={ORANGE} />
                    <Text style={styles.waitingText}>Waiting for other party...</Text>
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
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Rides</Text>
      </View>

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

      {tab === 'active' ? renderActiveRides() : renderUpcomingRides()}
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
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: TEXT_PRIMARY,
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
