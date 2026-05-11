import { db } from '@/config/firebase';
import { useAuth } from '@/context/AuthContext';
import {
  completeRide,
  type RideConfirmationWithId,
} from '@/services/rideConfirmationService';
import { cancelRideRequest, getRideRequestById, type RideRequestWithId } from '@/services/rideRequestService';
import { getUser } from '@/services/userService';
import type { RideConfirmation } from '@/types/rideConfirmation';
import type { User as AppUser } from '@/types/user';
import { reverseGeocode } from '@/utils/geocoding';
import { fetchRouteWithSteps, getManeuverIcon, type RouteStep } from '@/utils/routing';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { doc, onSnapshot } from 'firebase/firestore';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { type MarkerData, type RouteData } from '../../components/Map';

const ACCENT = '#007AFF';
const GREEN = '#34C759';
const RED = '#FF3B30';
const TEXT_PRIMARY = '#1C1C1E';
const TEXT_SECONDARY = '#6B7280';
const TEXT_MUTED = '#9CA3AF';
const CARD_BG = '#FFFFFF';

const ARRIVAL_THRESHOLD_METERS = 150;
const ROUTE_REFRESH_DISTANCE_METERS = 500;

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function geoPointToLatLng(gp: any): { latitude: number; longitude: number } | null {
  if (!gp) return null;
  const lat = gp.latitude ?? gp._lat;
  const lng = gp.longitude ?? gp._long ?? gp._lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return { latitude: lat, longitude: lng };
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const miles = meters / 1609.34;
  return `${miles.toFixed(1)} mi`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatStepDistance(meters: number): string {
  if (meters < 30) return '';
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  const miles = meters / 1609.34;
  return `${miles.toFixed(1)} mi`;
}

export default function RideScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [confirmation, setConfirmation] = useState<RideConfirmationWithId | null>(null);
  const [request, setRequest] = useState<RideRequestWithId | null>(null);
  const [otherUser, setOtherUser] = useState<AppUser | null>(null);
  const [dropoffAddress, setDropoffAddress] = useState('');

  const [currentLocation, setCurrentLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [route, setRoute] = useState<RouteData | null>(null);
  const [steps, setSteps] = useState<RouteStep[]>([]);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);
  const [distanceToDropoff, setDistanceToDropoff] = useState<number | null>(null);
  const [hasArrived, setHasArrived] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showAllSteps, setShowAllSteps] = useState(false);

  const lastRouteFetchLocation = useRef<{ latitude: number; longitude: number } | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  /** Tracks last emitted status so we detect driver completing while passenger is on this screen */
  const lastConfirmationStatusRef = useRef<RideConfirmation['status'] | null>(null);
  const fetchedRideRequestIdRef = useRef<string | null>(null);

  const isDriver = confirmation && user ? confirmation.driverId === user.uid : false;

  // Real-time confirmation doc — passenger UI must react when driver completes elsewhere
  useEffect(() => {
    if (!id || typeof id !== 'string' || !user) return;

    lastConfirmationStatusRef.current = null;
    fetchedRideRequestIdRef.current = null;
    const confirmRef = doc(db, 'rideConfirmations', id);

    const unsub = onSnapshot(
      confirmRef,
      (snap) => {
        if (!snap.exists()) {
          setLoading(false);
          Alert.alert('Ride ended', 'This ride was cancelled or is no longer available.');
          router.replace('/(tabs)/home');
          return;
        }

        const conf: RideConfirmationWithId = {
          id: snap.id,
          ...(snap.data() as RideConfirmation),
        };

        const prev = lastConfirmationStatusRef.current;
        lastConfirmationStatusRef.current = conf.status;
        setLoading(false);

        if (conf.status !== 'in_progress') {
          const shouldRate =
            prev === 'in_progress'
            || (prev === null && conf.status === 'completed');

          if (shouldRate) {
            const otherUserId =
              conf.driverId === user.uid ? conf.riderId : conf.driverId;
            router.replace({
              pathname: '/ride/rate',
              params: {
                rideRequestId: conf.rideRequestId,
                otherUserId,
                otherUserName: otherUser?.name ?? 'your match',
              },
            });
            return;
          }

          Alert.alert(
            'Ride unavailable',
            'This ride isn’t active for live navigation anymore.',
          );
          router.replace('/(tabs)/home');
          return;
        }

        setConfirmation(conf);
      },
      (err) => {
        console.error('ride confirmation snapshot error:', err);
        setLoading(false);
        Alert.alert('Error', err.message ?? 'Could not sync ride.');
        router.back();
      },
    );

    return () => unsub();
  }, [id, user, router]);

  /** Load ride request + other profile once per rideRequestId */
  useEffect(() => {
    const rideRequestId = confirmation?.rideRequestId;
    const driverId = confirmation?.driverId;
    const riderId = confirmation?.riderId;
    if (!rideRequestId || !driverId || !riderId || !user) return;

    if (fetchedRideRequestIdRef.current === rideRequestId) return;

    let cancelled = false;

    (async () => {
      try {
        const req = await getRideRequestById(rideRequestId);
        if (cancelled || !req) return;

        fetchedRideRequestIdRef.current = rideRequestId;
        setRequest(req);

        const otherId = driverId === user.uid ? riderId : driverId;
        const other = await getUser(otherId);
        if (cancelled) return;
        setOtherUser(other);

        const dropoff = geoPointToLatLng(req.dropoffLocation);
        if (dropoff) {
          const addr = await reverseGeocode(dropoff.latitude, dropoff.longitude);
          if (!cancelled) setDropoffAddress(addr);
        }
      } catch (e: any) {
        console.error('Error loading ride request / rider profile:', e);
        if (!cancelled) Alert.alert('Error', e.message ?? 'Failed to load ride details.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [confirmation?.rideRequestId, confirmation?.driverId, confirmation?.riderId, user]);

  // Start location tracking
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location Required',
          'Location permission is needed to track the ride.',
        );
        return;
      }

      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10 },
        (loc) => {
          if (cancelled) return;
          setCurrentLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        },
      );

      if (cancelled) {
        sub.remove();
      } else {
        locationSubRef.current = sub;
      }
    })();

    return () => {
      cancelled = true;
      locationSubRef.current?.remove();
      locationSubRef.current = null;
    };
  }, []);

  // Update distance and check arrival
  useEffect(() => {
    if (!currentLocation || !request) return;
    const dropoff = geoPointToLatLng(request.dropoffLocation);
    if (!dropoff) return;

    const dist = haversineMeters(
      currentLocation.latitude,
      currentLocation.longitude,
      dropoff.latitude,
      dropoff.longitude,
    );
    setDistanceToDropoff(dist);

    if (dist <= ARRIVAL_THRESHOLD_METERS && !hasArrived) {
      setHasArrived(true);
    }
  }, [currentLocation, request, hasArrived]);

  // Fetch/refresh route from current location to dropoff
  const refreshRoute = useCallback(
    async (loc: { latitude: number; longitude: number }) => {
      if (!request) return;
      const dropoff = geoPointToLatLng(request.dropoffLocation);
      if (!dropoff) return;

      const result = await fetchRouteWithSteps(loc, dropoff);
      setRoute({ coordinates: result.coordinates });
      setSteps(result.steps);
      if (result.totalDistance > 0) setRouteDistance(result.totalDistance);
      if (result.totalDuration > 0) setRouteDuration(result.totalDuration);
      lastRouteFetchLocation.current = loc;
    },
    [request],
  );

  useEffect(() => {
    if (!currentLocation || !request) return;

    if (!lastRouteFetchLocation.current) {
      refreshRoute(currentLocation);
      return;
    }

    const moved = haversineMeters(
      currentLocation.latitude,
      currentLocation.longitude,
      lastRouteFetchLocation.current.latitude,
      lastRouteFetchLocation.current.longitude,
    );
    if (moved >= ROUTE_REFRESH_DISTANCE_METERS) {
      refreshRoute(currentLocation);
    }
  }, [currentLocation, request, refreshRoute]);

  const handleCompleteRide = async () => {
    if (!confirmation || !request || !user) {
      Alert.alert('Error', 'Missing ride data. Go back to Home and open the ride again.');
      return;
    }
    const otherUserId =
      confirmation.driverId === user.uid ? confirmation.riderId : confirmation.driverId;
    setCompleting(true);
    try {
      await completeRide(confirmation.id);
      router.replace({
        pathname: '/ride/rate',
        params: {
          rideRequestId: confirmation.rideRequestId,
          otherUserId,
          otherUserName: otherUser?.name ?? 'your match',
        },
      });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not complete ride.');
      setCompleting(false);
    }
  };

  const runCancelRide = async () => {
    if (!confirmation || !user) return;
    setCancelling(true);
    try {
      await cancelRideRequest(confirmation.rideRequestId, user.uid, confirmation.id);
      router.replace('/(tabs)/home');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not cancel ride.');
      setCancelling(false);
    }
  };

  const handleCancelRide = () => {
    if (!confirmation || !request) return;
    const message =
      'Are you sure you want to cancel this ride? The rider will be notified.';
    if (Platform.OS === 'web') {
      if (typeof globalThis !== 'undefined' && typeof globalThis.confirm === 'function') {
        if (globalThis.confirm(message)) {
          void runCancelRide();
        }
      }
      return;
    }
    Alert.alert('Cancel Ride', message, [
      { text: 'Keep Riding', style: 'cancel' },
      {
        text: 'Cancel Ride',
        style: 'destructive',
        onPress: () => {
          void runCancelRide();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={ACCENT} />
        <Text style={styles.loadingText}>Loading ride...</Text>
      </View>
    );
  }

  if (!confirmation || !request) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Ride data unavailable.</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const pickup = geoPointToLatLng(request.pickupLocation);
  const dropoff = geoPointToLatLng(request.dropoffLocation);

  const markers: MarkerData[] = [];
  if (currentLocation) {
    markers.push({
      ...currentLocation,
      title: 'You',
      color: ACCENT,
    });
  }
  if (pickup) {
    markers.push({ ...pickup, title: 'Pickup', color: GREEN });
  }
  if (dropoff) {
    markers.push({ ...dropoff, title: 'Dropoff', color: RED });
  }

  const mapCenter = currentLocation ?? dropoff ?? pickup ?? { latitude: 33.749, longitude: -84.388 };

  // Find the next upcoming step based on proximity
  const upcomingStepIndex = (() => {
    if (!currentLocation || steps.length === 0) return 0;
    let closest = 0;
    let minDist = Infinity;
    for (let i = 0; i < steps.length; i++) {
      const d = haversineMeters(
        currentLocation.latitude,
        currentLocation.longitude,
        steps[i].location.latitude,
        steps[i].location.longitude,
      );
      if (d < minDist) {
        minDist = d;
        closest = i;
      }
    }
    // If we're past the closest step's location, show the next one
    if (closest < steps.length - 1 && minDist < 50) {
      return closest + 1;
    }
    return closest;
  })();

  const nextStep = steps[upcomingStepIndex] ?? null;
  const remainingSteps = steps.slice(upcomingStepIndex);
  const displayDistance = routeDistance ?? distanceToDropoff;
  const displayDuration = routeDuration;

  return (
    <View style={styles.container}>
      <View style={styles.mapContainer} collapsable={false}>
        <MapView
          latitude={mapCenter.latitude}
          longitude={mapCenter.longitude}
          markers={markers}
          route={route ?? undefined}
        />
      </View>

      {/* Full-screen layer so map (native/web) cannot steal touches from UI below */}
      <View style={styles.uiLayer} pointerEvents="box-none">
        {/* Next turn banner at top of screen */}
        {nextStep && isDriver && !hasArrived && (
          <View style={styles.directionBanner} pointerEvents="auto">
            <Ionicons
              name={getManeuverIcon(nextStep.maneuverType, nextStep.maneuverModifier) as any}
              size={28}
              color="#fff"
            />
            <View style={styles.directionTextContainer}>
              <Text style={styles.directionInstruction} numberOfLines={2}>
                {nextStep.instruction}
              </Text>
              {nextStep.distance > 30 && (
                <Text style={styles.directionDistance}>
                  {formatStepDistance(nextStep.distance)}
                </Text>
              )}
            </View>
          </View>
        )}

        <View style={styles.overlay} pointerEvents="box-none">
        {hasArrived && isDriver && (
          <View style={styles.arrivedBanner}>
            <Ionicons name="checkmark-circle" size={22} color="#fff" />
            <Text style={styles.arrivedText}>You've arrived at the destination!</Text>
          </View>
        )}

        <View style={styles.infoCard} pointerEvents="auto">
          <View style={styles.infoHeader}>
            <View style={styles.statusRow}>
              <View style={styles.liveIndicator} />
              <Text style={styles.statusLabel}>Ride In Progress</Text>
            </View>
            {otherUser && (
              <Text style={styles.withText}>
                with {otherUser.name}
              </Text>
            )}
          </View>

          <View style={styles.infoBody}>
            <View style={styles.destinationRow}>
              <View style={[styles.dot, { backgroundColor: RED }]} />
              <View style={styles.destinationInfo}>
                <Text style={styles.destinationLabel}>Heading to</Text>
                <Text style={styles.destinationAddress} numberOfLines={2}>
                  {dropoffAddress || 'Dropoff location'}
                </Text>
              </View>
            </View>

            {displayDistance != null && (
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Ionicons name="navigate-outline" size={18} color={ACCENT} />
                  <Text style={styles.statValue}>{formatDistance(displayDistance)}</Text>
                  <Text style={styles.statLabel}>remaining</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Ionicons name="time-outline" size={18} color={ACCENT} />
                  <Text style={styles.statValue}>
                    {displayDuration != null
                      ? formatDuration(displayDuration)
                      : formatDuration(displayDistance / 13.4)}
                  </Text>
                  <Text style={styles.statLabel}>ETA</Text>
                </View>
              </View>
            )}

            {/* Directions list for driver */}
            {isDriver && remainingSteps.length > 0 && (
              <View style={styles.directionsSection}>
                <TouchableOpacity
                  style={styles.directionsToggle}
                  onPress={() => setShowAllSteps((v) => !v)}
                >
                  <Ionicons name="list-outline" size={18} color={ACCENT} />
                  <Text style={styles.directionsToggleText}>
                    {showAllSteps
                      ? 'Hide directions'
                      : `Directions (${remainingSteps.length} steps)`}
                  </Text>
                  <Ionicons
                    name={showAllSteps ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={ACCENT}
                  />
                </TouchableOpacity>

                {showAllSteps && (
                  <FlatList
                    data={remainingSteps}
                    keyExtractor={(_, i) => String(i)}
                    style={styles.stepsList}
                    scrollEnabled={true}
                    nestedScrollEnabled={true}
                    renderItem={({ item, index }) => (
                      <View
                        style={[
                          styles.stepRow,
                          index === 0 && styles.stepRowActive,
                        ]}
                      >
                        <Ionicons
                          name={getManeuverIcon(item.maneuverType, item.maneuverModifier) as any}
                          size={20}
                          color={index === 0 ? ACCENT : TEXT_SECONDARY}
                        />
                        <View style={styles.stepContent}>
                          <Text
                            style={[
                              styles.stepInstruction,
                              index === 0 && styles.stepInstructionActive,
                            ]}
                            numberOfLines={2}
                          >
                            {item.instruction}
                          </Text>
                          {item.distance > 30 && (
                            <Text style={styles.stepDist}>
                              {formatStepDistance(item.distance)}
                            </Text>
                          )}
                        </View>
                      </View>
                    )}
                  />
                )}
              </View>
            )}
          </View>

          {isDriver && (
            <View style={styles.driverActions}>
              <TouchableOpacity
                style={[
                  styles.completeButton,
                  hasArrived && styles.completeButtonArrived,
                  (completing || cancelling) && styles.buttonDisabled,
                ]}
                onPress={handleCompleteRide}
                disabled={completing || cancelling}
              >
                {completing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons
                      name={hasArrived ? 'checkmark-circle' : 'flag'}
                      size={20}
                      color="#fff"
                    />
                    <Text style={styles.completeButtonText}>
                      {hasArrived ? "You've Arrived — Complete Ride" : 'Complete Ride'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.cancelButton,
                  (completing || cancelling) && styles.buttonDisabled,
                ]}
                onPress={handleCancelRide}
                disabled={completing || cancelling}
              >
                {cancelling ? (
                  <ActivityIndicator color={RED} size="small" />
                ) : (
                  <>
                    <Ionicons name="close-circle-outline" size={18} color={RED} />
                    <Text style={styles.cancelButtonText}>Cancel Ride</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {!isDriver && (
            <View style={styles.passengerNote}>
              <Ionicons name="car" size={18} color={TEXT_SECONDARY} />
              <Text style={styles.passengerNoteText}>
                {hasArrived
                  ? 'You have arrived — waiting for driver to end the ride.'
                  : 'Sit back and enjoy the ride.'}
              </Text>
            </View>
          )}
        </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: TEXT_SECONDARY,
  },
  errorText: {
    fontSize: 16,
    color: TEXT_SECONDARY,
    textAlign: 'center',
    marginBottom: 16,
  },
  backButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: ACCENT,
    borderRadius: 10,
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },

  mapContainer: {
    flex: 1,
    zIndex: 0,
    elevation: 0,
  },

  uiLayer: {
    ...StyleSheet.absoluteFillObject,
    // Leaflet / map tiles often use z-index ~400; stay above them on web
    zIndex: 1000,
    elevation: 24,
  },

  directionBanner: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 122, 255, 0.95)',
    borderRadius: 16,
    padding: 16,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 10,
  },
  directionTextContainer: {
    flex: 1,
  },
  directionInstruction: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
  directionDistance: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
  },

  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1001,
    elevation: 25,
  },
  arrivedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GREEN,
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
  },
  arrivedText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  infoCard: {
    backgroundColor: CARD_BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: 40,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 26,
    zIndex: 1002,
  },
  infoHeader: {
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: GREEN,
  },
  statusLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },
  withText: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginTop: 4,
  },

  infoBody: {
    gap: 16,
  },
  destinationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 3,
  },
  destinationInfo: {
    flex: 1,
  },
  destinationLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: TEXT_SECONDARY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  destinationAddress: {
    fontSize: 15,
    fontWeight: '500',
    color: TEXT_PRIMARY,
    lineHeight: 21,
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },
  statLabel: {
    fontSize: 12,
    color: TEXT_SECONDARY,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#E5E7EB',
  },

  driverActions: {
    marginTop: 16,
    gap: 10,
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 8,
  },
  completeButtonArrived: {
    backgroundColor: GREEN,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: RED,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 6,
  },
  cancelButtonText: {
    color: RED,
    fontSize: 15,
    fontWeight: '600',
  },

  directionsSection: {
    marginTop: 12,
  },
  directionsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  directionsToggleText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: ACCENT,
  },
  stepsList: {
    maxHeight: 180,
    marginTop: 4,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  stepRowActive: {
    backgroundColor: '#EFF6FF',
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderBottomWidth: 0,
  },
  stepContent: {
    flex: 1,
  },
  stepInstruction: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    lineHeight: 19,
  },
  stepInstructionActive: {
    color: TEXT_PRIMARY,
    fontWeight: '600',
  },
  stepDist: {
    fontSize: 12,
    color: TEXT_MUTED,
    marginTop: 2,
  },

  passengerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  passengerNoteText: {
    flex: 1,
    fontSize: 14,
    color: TEXT_SECONDARY,
    lineHeight: 20,
  },
});
