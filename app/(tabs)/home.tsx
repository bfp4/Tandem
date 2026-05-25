import { db } from "@/config/firebase";
import { useAuth } from "@/context/AuthContext";
import { getOrCreateConversation } from "@/services/messagingService";
import {
  cancelReady,
  completeRide,
  confirmPickup,
  fetchUserConfirmationsOnce,
  markReady,
  subscribeToUserConfirmations,
  type RideConfirmationWithId,
} from "@/services/rideConfirmationService";
import {
  cancelRideRequest,
  getRideRequestById,
  type RideRequestWithId,
} from "@/services/rideRequestService";
import { getRiderRides } from "@/services/riderRideService";
import { aggregateRatingForUser } from "@/services/ratingService";
import { getUser } from "@/services/userService";
import type { RiderRide } from "@/types/riderRide";
import type { User as AppUser } from "@/types/user";
import { formatRideDate, parseLocalRideStart } from "@/utils/rideDate";
import { isValidTimeHHMM } from "@/utils/validation";
import { reverseGeocode } from "@/utils/geocoding";
import { normalizeProfilePhotoUrl } from "@/utils/profilePhoto";
import {
  ACCENT,
  ERROR_ACTION,
  GREEN,
  parseStarRating,
  RED,
  TEXT_MUTED,
  WARN_TEXT,
} from "@/utils/constants";
import { geoPointToLatLng, getDistanceMeters } from "@/utils/geo";
import { fetchRouteWithSteps } from "@/utils/routing";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  collection,
  getDocs,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import React, {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ActiveRideCard from '@/components/ActiveRideCard';
import EmptyState from '@/components/EmptyState';
import LoadingScreen from '@/components/LoadingScreen';
import RidesListSkeleton from '@/components/RidesListSkeleton';
import ScreenHeader from '@/components/ScreenHeader';
import UpcomingMapSection from '@/components/UpcomingMapSection';
import UpcomingRideCard from '@/components/UpcomingRideCard';
import ViewScheduleLink from '@/components/ViewScheduleLink';
import { useUserLocation } from '@/hooks/useUserLocation';
import type { EnrichedRide } from '@/types/enrichedRide';
import MapView, { type MarkerData, type RouteData } from '../../components/Map';
import { errorBoundaryStyles, styles } from './home.styles';

class HomeErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.error("HomeScreen error boundary caught:", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={errorBoundaryStyles.container}>
          <Text style={errorBoundaryStyles.message}>
            Something went wrong loading rides. Pull down to refresh.
          </Text>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false })}
            style={errorBoundaryStyles.retryButton}
          >
            <Text style={errorBoundaryStyles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

type Tab = "active" | "upcoming";

interface RiderRideWithId extends RiderRide {
  id: string;
}

async function fetchOtherUserForRide(otherId: string): Promise<AppUser> {
  try {
    let u = await getUser(otherId);
    try {
      const agg = await aggregateRatingForUser(otherId);
      if (agg && agg.count > 0) {
        u = { ...u, starRating: agg.average, rideCount: agg.count };
      }
    } catch {
      // keep starRating / rideCount from user doc
    }
    return u;
  } catch {
    return placeholderOtherUser(otherId);
  }
}

function placeholderOtherUser(uid: string): AppUser {
  return {
    uid,
    username: "unknown",
    name: "Unavailable",
    email: "",
    phone: "",
    address: "",
    bio: "",
    profilePhoto: "",
    roles: ["rider"],
    activeRole: "rider",
    starRating: 0,
    rideCount: 0,
    bankInfo: null,
    fcmToken: "",
    profileComplete: false,
    missingFields: [],
    geohash: "",
    createdAt: Timestamp.now(),
    carDetails: null,
  };
}

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

  const [tab, setTab] = useState<Tab>("active");
  const [listenerKey, setListenerKey] = useState(0);
  const [subscriptionStatus, setSubscriptionStatus] = useState<
    "idle" | "connecting" | "live" | "error"
  >("idle");
  const [subscriptionError, setSubscriptionError] = useState<string | null>(
    null,
  );
  const [confirmations, setConfirmations] = useState<RideConfirmationWithId[]>(
    [],
  );
  const [enrichedRides, setEnrichedRides] = useState<EnrichedRide[]>([]);
  const [fallbackUpcoming, setFallbackUpcoming] = useState<EnrichedRide[]>([]);
  const [enriching, setEnriching] = useState(false);
  const [enrichWarnings, setEnrichWarnings] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<AppUser | null>(null);
  const [riderRides, setRiderRides] = useState<RiderRideWithId[]>([]);
  const [activeRoute, setActiveRoute] = useState<RouteData | null>(null);
  const [distanceToDropoff, setDistanceToDropoff] = useState<number | null>(
    null,
  );
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  // Ticks every minute so time-sensitive UI (within30Min, isFuture) stays current
  const [clockTick, setClockTick] = useState(0);

  const requestCache = useRef(new Map<string, RideRequestWithId>());
  const userCache = useRef(new Map<string, AppUser>());
  const addressCache = useRef(new Map<string, string>());
  const navigatedToRideRef = useRef<string | null>(null);
  const enrichGenRef = useRef(0);
  const inProgressNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const confirmationsLengthRef = useRef(0);
  const userLocation = useUserLocation();

  // Tick every 30 seconds so time-sensitive calculations (within30Min, isFuture) stay fresh
  // without needing a Firestore update to trigger a re-render.
  useEffect(() => {
    const id = setInterval(() => setClockTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  confirmationsLengthRef.current = confirmations.length;

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
      .catch(() => {});
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
      .catch(() => {
        if (!cancelled) setRiderRides([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setSubscriptionStatus("idle");
      setSubscriptionError(null);
      setConfirmations([]);
      setFallbackUpcoming([]);
      return;
    }
    setSubscriptionStatus("connecting");
    setSubscriptionError(null);

    const unsub = subscribeToUserConfirmations(
      user.uid,
      (confs) => {
        setSubscriptionStatus("live");
        setSubscriptionError(null);
        setConfirmations(confs);
      },
      (err) => {
        setSubscriptionStatus("error");
        setSubscriptionError(err.message ?? String(err));
      },
    );
    return unsub;
  }, [user, listenerKey]);

  const enrichConfirmedRequestsAsUpcoming =
    useCallback(async (): Promise<void> => {
      if (!user) return;
      try {
        const [riderSnap, driverSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, "rideRequests"),
              where("riderId", "==", user.uid),
              where("status", "==", "confirmed"),
            ),
          ),
          getDocs(
            query(
              collection(db, "rideRequests"),
              where("driverId", "==", user.uid),
              where("status", "==", "confirmed"),
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

          const otherId =
            req.driverId === user.uid ? req.riderId : req.driverId;
          let otherUser = userCache.current.get(otherId);
          if (!otherUser) {
            otherUser = await fetchOtherUserForRide(otherId);
            userCache.current.set(otherId, otherUser);
          }

          const pickupKey = `${pickup.latitude},${pickup.longitude}`;
          let pickupAddr = addressCache.current.get(pickupKey);
          if (!pickupAddr) {
            try {
              pickupAddr = await reverseGeocode(
                pickup.latitude,
                pickup.longitude,
              );
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
              dropoffAddr = await reverseGeocode(
                dropoff.latitude,
                dropoff.longitude,
              );
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
            status: "waiting",
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
          const dateA = parseLocalRideStart(
            a.confirmation.nextRideDate,
            a.request.requestedStart,
          );
          const dateB = parseLocalRideStart(
            b.confirmation.nextRideDate,
            b.request.requestedStart,
          );
          return dateA.getTime() - dateB.getTime();
        });

        setFallbackUpcoming(enriched);
      } catch {
        setFallbackUpcoming([]);
      }
    }, [user]);

  useEffect(() => {
    if (!user) return;
    // Only use fallback when confirmations aren't coming through.
    if (subscriptionStatus !== "live") return;
    if (confirmations.length > 0) {
      setFallbackUpcoming([]);
      return;
    }
    enrichConfirmedRequestsAsUpcoming();
  }, [
    user,
    subscriptionStatus,
    confirmations.length,
    enrichConfirmedRequestsAsUpcoming,
  ]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      if (cancelled) return;
      if (confirmationsLengthRef.current > 0) return;

      try {
        const rows = await fetchUserConfirmationsOnce(user.uid);
        if (cancelled || confirmationsLengthRef.current > 0) return;
        if (rows.length === 0) {
          return;
        }
        setConfirmations(rows);
      } catch {
        // fallback fetch failed — listener may still deliver data
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

      const requestLoads = new Map<string, Promise<RideRequestWithId | null>>();
      const loadRideRequestFresh = async (
        rideRequestId: string,
      ): Promise<RideRequestWithId | null> => {
        let p = requestLoads.get(rideRequestId);
        if (!p) {
          p = (async () => {
            const fetched = await getRideRequestById(rideRequestId);
            if (fetched)
              requestCache.current.set(rideRequestId, fetched);
            else requestCache.current.delete(rideRequestId);
            return fetched;
          })();
          requestLoads.set(rideRequestId, p);
        }
        return p;
      };

      const rows = await Promise.all(
        confs.map(async (conf) => {
          try {
            if (!conf?.rideRequestId || !conf?.driverId || !conf?.riderId) {
              warnings.push(
                `Skipped ${conf?.id ?? "?"}: missing rideRequestId/driverId/riderId`,
              );
              return null;
            }

            const req =
              (await loadRideRequestFresh(conf.rideRequestId)) ?? undefined;
            if (!req) {
              warnings.push(
                `No rideRequest ${conf.rideRequestId} for confirmation ${conf.id}`,
              );
              return null;
            }
            if (req.status !== "confirmed") {
              return null;
            }

            const pickup = geoPointToLatLng(req.pickupLocation);
            const dropoff = geoPointToLatLng(req.dropoffLocation);
            if (!pickup || !dropoff) {
              warnings.push(
                `Missing pickup/dropoff coords (request ${req.id}, confirmation ${conf.id})`,
              );
              return null;
            }

            const otherId =
              conf.driverId === user.uid ? conf.riderId : conf.driverId;
            let otherUser = userCache.current.get(otherId);
            if (!otherUser) {
              otherUser = await fetchOtherUserForRide(otherId);
              userCache.current.set(otherId, otherUser);
            }

            const pickupKey = `${pickup.latitude},${pickup.longitude}`;
            let pickupAddr = addressCache.current.get(pickupKey);
            if (!pickupAddr) {
              try {
                pickupAddr = await reverseGeocode(
                  pickup.latitude,
                  pickup.longitude,
                );
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
                dropoffAddr = await reverseGeocode(
                  dropoff.latitude,
                  dropoff.longitude,
                );
                addressCache.current.set(dropoffKey, dropoffAddr);
              } catch {
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
            return null;
          }
        }),
      );

      if (gen !== enrichGenRef.current) {
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
        return a.confirmation.nextRideDate.localeCompare(
          b.confirmation.nextRideDate,
        );
      });

      setEnrichedRides(enriched);
      setEnrichWarnings(warnings);
    },
    [user],
  );

  useEffect(() => {
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

      let confs = confirmations;
      try {
        const fetched = await fetchUserConfirmationsOnce(user.uid);
        if (fetched.length > 0) {
          confs = fetched;
          setConfirmations(fetched);
        }
      } catch {
        // snapshot fetch skipped
      }

      try {
        const rides = await getRiderRides(user.uid);
        setRiderRides(rides);
      } catch {
        // rider rides fetch skipped
      }

      await enrichRides(confs);
      if (confs.length === 0) {
        await enrichConfirmedRequestsAsUpcoming();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Refresh failed", msg);
    } finally {
      setRefreshing(false);
    }
  }, [user, confirmations, enrichRides, enrichConfirmedRequestsAsUpcoming]);

  const handleRetrySubscription = useCallback(() => {
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
      if (ride.request.status !== "confirmed") {
        continue;
      }

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

      const minutesUntilStart =
        (rideStart.getTime() - now.getTime()) / (1000 * 60);

      // ACTIVE TAB: any ride mid-flight (in_progress / both_ready) OR a 'waiting' ride
      // that's within the 30-min confirmation window (through -60 min grace after start).
      if (st === "in_progress" || st === "both_ready") {
        act.push(ride);
      } else if (
        st === "waiting" &&
        minutesUntilStart <= 30 &&
        minutesUntilStart > -60
      ) {
        act.push(ride);
      }
      // UPCOMING TAB: 'waiting' rides further than 30 min out
      else if (st === "waiting" && minutesUntilStart > 30) {
        up.push(ride);
      }
    }

    const byStartTime = (a: EnrichedRide, b: EnrichedRide): number => {
      const riderRideA = a.request.riderRideId
        ? riderRideById.get(a.request.riderRideId)
        : null;
      const riderRideB = b.request.riderRideId
        ? riderRideById.get(b.request.riderRideId)
        : null;
      const startA = isValidTimeHHMM(a.request.requestedStart)
        ? a.request.requestedStart
        : riderRideA?.departureTime;
      const startB = isValidTimeHHMM(b.request.requestedStart)
        ? b.request.requestedStart
        : riderRideB?.departureTime;
      const dateA = parseLocalRideStart(a.confirmation.nextRideDate, startA);
      const dateB = parseLocalRideStart(b.confirmation.nextRideDate, startB);
      return dateA.getTime() - dateB.getTime();
    };

    up.sort(byStartTime);
    act.sort(byStartTime);

    return { upcoming: up, active: act };
  }, [enrichedRides, riderRideById, riderRides.length, clockTick]);

  const upcomingMerged = useMemo(() => {
    if (fallbackUpcoming.length === 0) return upcoming;
    const seen = new Set(upcoming.map((r) => r.confirmation.rideRequestId));
    const merged = [...upcoming];
    for (const r of fallbackUpcoming) {
      if (!seen.has(r.confirmation.rideRequestId)) merged.push(r);
    }
    merged.sort((a, b) => {
      const dateA = parseLocalRideStart(
        a.confirmation.nextRideDate,
        a.request.requestedStart,
      );
      const dateB = parseLocalRideStart(
        b.confirmation.nextRideDate,
        b.request.requestedStart,
      );
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
    fetchRouteWithSteps(userLocation, dropoff)
      .then((result) => {
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
      })
      .catch((error) => {
        console.warn("Failed to fetch route for ETA:", error);
        // Fallback: use straight-line distance and estimate
        const distance = getDistanceMeters(userLocation, dropoff);
        setDistanceToDropoff(distance);
        const speedMetersPerMin = (35 * 1609) / 60;
        setEtaMinutes(distance / speedMetersPerMin);
      });
  }, [userLocation, active]);

  // Auto-navigate to ride screen when an in_progress ride is detected (delayed so the home list is visible briefly)
  useEffect(() => {
    const inProgress = active.find(
      (r) => r.confirmation.status === "in_progress",
    );
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
    inProgressNavTimerRef.current = setTimeout(() => {
      inProgressNavTimerRef.current = null;
      navigatedToRideRef.current = id;
      router.push({
        pathname: "/ride/[id]",
        params: { id },
      });
    }, 2200);
    return clearTimer;
  }, [active, router]);

  const myRole: "driver" | "rider" | null = useMemo(() => {
    if (!myProfile) return null;
    return myProfile.activeRole;
  }, [myProfile]);

  const handleMarkReady = async (ride: EnrichedRide) => {
    if (!myRole) return;
    setActingOn(ride.confirmation.id);
    try {
      await markReady(ride.confirmation.id, myRole);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not mark ready.");
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
      Alert.alert("Error", e.message ?? "Could not cancel ready status.");
    } finally {
      setActingOn(null);
    }
  };

  const denyRideConfirmed = async (ride: EnrichedRide) => {
    if (!user?.uid) {
      Alert.alert("Sign in required", "You must be logged in to deny a ride.");
      return;
    }
    setActingOn(ride.confirmation.id);
    try {
      await cancelRideRequest(
        ride.confirmation.rideRequestId,
        user.uid,
        ride.confirmation.id,
      );
      requestCache.current.delete(ride.confirmation.rideRequestId);
      setEnrichedRides((prev) =>
        prev.filter(
          (r) =>
            r.confirmation.rideRequestId !== ride.confirmation.rideRequestId,
        ),
      );
      setFallbackUpcoming([]);
      setConfirmations((prev) =>
        prev.filter((c) => c.rideRequestId !== ride.confirmation.rideRequestId),
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Error", msg || "Could not deny the ride.");
    } finally {
      setActingOn(null);
    }
  };

  const handleDenyRide = (ride: EnrichedRide) => {
    Alert.alert(
      "Deny this ride?",
      "This will cancel the ride for both you and the other party. This cannot be undone.",
      [
        { text: "Keep ride", style: "cancel" },
        {
          text: "Deny",
          style: "destructive",
          onPress: () => {
            void denyRideConfirmed(ride);
          },
        },
      ],
    );
  };

  const handleConfirmPickup = async (ride: EnrichedRide) => {
    setActingOn(ride.confirmation.id);
    try {
      await confirmPickup(ride.confirmation.id);
      navigatedToRideRef.current = ride.confirmation.id;
      router.push({
        pathname: "/ride/[id]",
        params: { id: ride.confirmation.id },
      });
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not confirm pickup.");
    } finally {
      setActingOn(null);
    }
  };

  const handleCompleteRide = async (ride: EnrichedRide) => {
    setActingOn(ride.confirmation.id);
    try {
      await completeRide(ride.confirmation.id);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not complete ride.");
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
        pathname: "/conversation/[id]",
        params: {
          id: conversationId,
          otherUserId,
          pending: isPending ? "true" : "false",
        },
      });
    } catch {
      Alert.alert("Error", "Could not open conversation.");
    }
  };

  const handleViewProfile = (ride: EnrichedRide) => {
    const otherUser = ride.otherUser;
    router.push({
      pathname: "/driver-details",
      params: {
        id: otherUser.uid,
        name: otherUser.name,
        rating: String(parseStarRating(otherUser.starRating)),
        totalRides: String(otherUser.rideCount ?? 0),
        bio: otherUser.bio ?? "",
        profilePhoto: normalizeProfilePhotoUrl(otherUser.profilePhoto),
      },
    });
  };

  const renderActiveRides = () => {
    if (active.length === 0) {
      return (
        <EmptyState
          icon="car-outline"
          title="No active rides"
          subtitle="When both you and your match confirm, the ride will appear here"
          iconSize={48}
          iconColor={TEXT_MUTED}
        />
      );
    }

    const first = active[0];
    const pickup = geoPointToLatLng(first.request.pickupLocation);
    const dropoff = geoPointToLatLng(first.request.dropoffLocation);

    const markers: MarkerData[] = [];

    if (userLocation) {
      markers.unshift({
        ...userLocation,
        title: "You",
        color: ACCENT, // blue circle distinguishes you from pickup/dropoff
        isUserLocation: true,
      });
    }

    if (pickup) {
      markers.push({ ...pickup, title: "Pickup", color: GREEN });
    }
    if (dropoff) {
      markers.push({ ...dropoff, title: "Dropoff", color: RED });
    }

    const midLat =
      pickup && dropoff
        ? (pickup.latitude + dropoff.latitude) / 2
        : (pickup?.latitude ?? dropoff?.latitude ?? 33.749);
    const midLng =
      pickup && dropoff
        ? (pickup.longitude + dropoff.longitude) / 2
        : (pickup?.longitude ?? dropoff?.longitude ?? -84.388);

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
            <ActiveRideCard
              key={ride.confirmation.id}
              ride={ride}
              currentUserId={user?.uid}
              actingOnId={actingOn}
              distanceToDropoff={distanceToDropoff}
              etaMinutes={etaMinutes}
              onViewProfile={handleViewProfile}
              onMarkReady={handleMarkReady}
              onDenyRide={handleDenyRide}
              onCancelReady={handleCancelReady}
              onConfirmPickup={handleConfirmPickup}
              onCompleteRide={handleCompleteRide}
              onMessage={handleMessage}
            />
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderUpcomingRides = () => {
    if (upcomingMerged.length === 0) {
      return (
        <EmptyState
          icon="calendar-outline"
          title="No upcoming rides"
          subtitle="Find a driver in the Match tab to get started"
          iconSize={48}
          iconColor={TEXT_MUTED}
        />
      );
    }

    return (
      <>
        <ViewScheduleLink
          onPress={() => router.push({ pathname: "/(tabs)/history" })}
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
          <UpcomingMapSection
            upcoming={upcomingMerged}
            userLocation={userLocation}
          />
          {upcomingMerged.map((ride) => (
            <UpcomingRideCard
              key={ride.confirmation.id}
              ride={ride}
              onViewProfile={handleViewProfile}
              onMessage={handleMessage}
            />
          ))}
        </ScrollView>
      </>
    );
  };

  const showBlockingSkeleton =
    Boolean(user) && subscriptionStatus === "connecting";
  const showEnrichSkeleton =
    Boolean(user) &&
    subscriptionStatus === "live" &&
    enriching &&
    confirmations.length > 0 &&
    enrichedRides.length === 0;

  if (authLoading) {
    return <LoadingScreen color={ACCENT} message="Signing you in…" />;
  }

  if (!user) {
    return (
      <EmptyState
        icon="log-in-outline"
        title="Sign in required"
        subtitle="Log in to view and manage your rides."
        iconSize={48}
        iconColor={TEXT_MUTED}
      >
        <TouchableOpacity
          style={[
            styles.primaryButton,
            { marginTop: 24, paddingHorizontal: 28 },
          ]}
          onPress={() => router.push("/login")}
          accessibilityRole="button"
          accessibilityLabel="Go to login"
        >
          <Text style={styles.primaryButtonText}>Go to login</Text>
        </TouchableOpacity>
      </EmptyState>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="My Rides"
        showBorder={false}
        style={styles.header}
        right={
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
        }
      />

      {subscriptionError ? (
        <View style={styles.errorBanner}>
          <Ionicons name="cloud-offline-outline" size={22} color={ERROR_ACTION} />
          <View style={styles.errorBannerBody}>
            <Text style={styles.errorBannerTitle}>Could not sync rides</Text>
            <Text style={styles.errorBannerText} numberOfLines={5}>
              {subscriptionError}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.errorBannerRetry}
            onPress={handleRetrySubscription}
          >
            <Text style={styles.errorBannerRetryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {enrichWarnings.length > 0 ? (
        <View style={styles.warnBanner}>
          <Ionicons name="warning-outline" size={18} color={WARN_TEXT} />
          <Text style={styles.warnBannerText} numberOfLines={3}>
            {enrichWarnings.length} confirmation(s) skipped or partially loaded.
            Pull down to retry.
          </Text>
        </View>
      ) : null}

      {showBlockingSkeleton ? (
        <RidesListSkeleton count={4} />
      ) : (
        <>
          <View style={styles.toggleBar}>
            <TouchableOpacity
              style={[
                styles.toggleTab,
                tab === "active" && styles.toggleTabActive,
              ]}
              onPress={() => setTab("active")}
            >
              <Text
                style={[
                  styles.toggleText,
                  tab === "active" && styles.toggleTextActive,
                ]}
              >
                Active
              </Text>
              {active.length > 0 && (
                <View
                  style={[
                    styles.badge,
                    tab === "active" && styles.badgeOnActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      tab === "active" && styles.badgeTextOnActive,
                    ]}
                  >
                    {active.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toggleTab,
                tab === "upcoming" && styles.toggleTabActive,
              ]}
              onPress={() => setTab("upcoming")}
            >
              <Text
                style={[
                  styles.toggleText,
                  tab === "upcoming" && styles.toggleTextActive,
                ]}
              >
                Upcoming
              </Text>
              {upcoming.length > 0 && (
                <View
                  style={[
                    styles.badge,
                    tab === "upcoming" && styles.badgeOnActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      tab === "upcoming" && styles.badgeTextOnActive,
                    ]}
                  >
                    {upcoming.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {showEnrichSkeleton ? (
            <RidesListSkeleton count={3} />
          ) : tab === "active" ? (
            renderActiveRides()
          ) : (
            renderUpcomingRides()
          )}
        </>
      )}
    </View>
  );
}
