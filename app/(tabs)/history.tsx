import { useAuth } from "@/context/AuthContext";
import { createNotification } from "@/services/notificationService";
import {
  cancelRideRequest,
  confirmRideRequest,
  denyRideRequest,
} from "@/services/rideRequestService";
import {
  createRiderRide,
  deleteRiderRide,
  getRiderRides,
} from "@/services/riderRideService";
import { createScheduleBlock } from "@/services/scheduleBlockService";
import { getUser } from "@/services/userService";
import type { RideRequest } from "@/types/rideRequest";
import type { RiderRide } from "@/types/riderRide";
import type { ScheduleBlock } from "@/types/scheduleBlock";
import type { User } from "@/types/user";
import { calculateDriveTime, formatDriveTime } from "@/utils/driveTime";
import { format12h } from "@/utils/format12h";
import { forwardGeocode } from "@/utils/geocoding";
import { normalizeProfilePhotoUrl } from "@/utils/profilePhoto";
import {
  blockMatchesDay,
  DAYS,
  FULL_DAY,
  rideRequestMatchesDay,
} from "@/utils/scheduleDays";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { styles } from "./history.styles";
import { db } from "../../config/firebase";
import LoadingScreen from "@/components/LoadingScreen";
import ConfirmDialog from "@/components/ConfirmDialog";
import DriverScheduleForm from "@/components/schedule/DriverScheduleForm";
import RiderScheduleForm from "@/components/schedule/RiderScheduleForm";
import ScreenHeader from "@/components/ScreenHeader";
import { ACCENT, GREEN, ORANGE, RED, TEXT_INVERSE, TEXT_PRIMARY } from '@/utils/constants';

// ─── Local types ──────────────────────────────────────────────────────────────

interface RiderRideWithId extends RiderRide {
  id: string;
}
interface ScheduleBlockWithId extends ScheduleBlock {
  id: string;
}
interface RideRequestWithId extends RideRequest {
  id: string;
}

type PendingCancellation = {
  requestId: string;
  otherUserId: string;
  riderRideId?: string;
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ScheduleScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [riderRides, setRiderRides] = useState<RiderRideWithId[]>([]);
  const [driverBlocks, setDriverBlocks] = useState<ScheduleBlockWithId[]>([]);
  const [driverRides, setDriverRides] = useState<RideRequestWithId[]>([]);
  const [otherUsers, setOtherUsers] = useState<Record<string, User>>({});

  const [loading, setLoading] = useState(true);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Driver-side modal (driver responds to rider-initiated requests)
  const [selectedRide, setSelectedRide] = useState<RideRequestWithId | null>(
    null,
  );
  // Rider-side modal: detail sheet for a specific riderRide
  const [selectedRiderRide, setSelectedRiderRide] =
    useState<RiderRideWithId | null>(null);
  // Rider-side modal (rider responds to driver-initiated requests)
  const [selectedIncoming, setSelectedIncoming] =
    useState<RideRequestWithId | null>(null);
  const [actingOnRide, setActingOnRide] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [pendingCancellation, setPendingCancellation] =
    useState<PendingCancellation | null>(null);
  const pendingCancellationRef = useRef<PendingCancellation | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<string | null>(null);

  // Rider: incoming match requests from drivers and confirmed requests
  const [incomingRequests, setIncomingRequests] = useState<RideRequestWithId[]>(
    [],
  );
  const [confirmedRiderRequests, setConfirmedRiderRequests] = useState<
    RideRequestWithId[]
  >([]);
  const [requestDrivers, setRequestDrivers] = useState<Record<string, User>>(
    {},
  );

  // ── Rider form ──
  const [ridePickup, setRidePickup] = useState("");
  const [rideDropoff, setRideDropoff] = useState("");
  const [pickupCoords, setPickupCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [rideDepartureTime, setRideDepartureTime] = useState("08:00");
  const [rideDays, setRideDays] = useState<string[]>([]);
  const [showDepartureDropdown, setShowDepartureDropdown] = useState(false);

  // ── Driver form ──
  const [availDays, setAvailDays] = useState<string[]>([]);
  const [availStartTime, setAvailStartTime] = useState("08:00");
  const [availEndTime, setAvailEndTime] = useState("17:00");
  const [showStartDropdown, setShowStartDropdown] = useState(false);
  const [showEndDropdown, setShowEndDropdown] = useState(false);

  useEffect(() => {
    loadAll();
  }, [user]);

  const loadAll = useCallback(
    async (isRefresh = false) => {
      if (!user) return;
      if (!isRefresh) setLoading(true);
      try {
        const profile = await getUser(user.uid);
        setUserProfile(profile);

        if (profile.activeRole === "rider") {
          const [ridesResult, requestsSnap] = await Promise.all([
            getRiderRides(user.uid),
            getDocs(
              query(
                collection(db, "rideRequests"),
                where("riderId", "==", user.uid),
              ),
            ),
          ]);
          setRiderRides(ridesResult);

          const allRequests: RideRequestWithId[] = requestsSnap.docs.map(
            (d) => ({ ...(d.data() as RideRequest), id: d.id }),
          );

          const incoming = allRequests.filter(
            (r) => r.initiatedBy === "driver" && r.status === "pending",
          );
          const confirmed = allRequests.filter((r) => r.status === "confirmed");
          setIncomingRequests(incoming);
          setConfirmedRiderRequests(confirmed);

          const allDriverIds = [
            ...new Set([...incoming, ...confirmed].map((r) => r.driverId)),
          ];
          const driverProfiles: Record<string, User> = {};
          await Promise.all(
            allDriverIds.map(async (id) => {
              try {
                driverProfiles[id] = await getUser(id);
              } catch {}
            }),
          );
          setRequestDrivers(driverProfiles);
        } else {
          const [blocksSnap, pendingSnap, confirmedSnap] = await Promise.all([
            getDocs(
              query(
                collection(db, "scheduleBlocks"),
                where("userId", "==", user.uid),
                where("role", "==", "driver"),
                where("status", "==", "open"),
              ),
            ),
            getDocs(
              query(
                collection(db, "rideRequests"),
                where("driverId", "==", user.uid),
                where("status", "==", "pending"),
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

          setDriverBlocks(
            blocksSnap.docs.map((d) => ({
              ...(d.data() as ScheduleBlock),
              id: d.id,
            })),
          );

          const allRides: RideRequestWithId[] = [
            ...pendingSnap.docs.map((d) => ({
              ...(d.data() as RideRequest),
              id: d.id,
            })),
            ...confirmedSnap.docs.map((d) => ({
              ...(d.data() as RideRequest),
              id: d.id,
            })),
          ];
          setDriverRides(allRides);

          const riderIds = [...new Set(allRides.map((r) => r.riderId))];
          const profiles: Record<string, User> = {};
          await Promise.all(
            riderIds.map(async (id) => {
              try {
                profiles[id] = await getUser(id);
              } catch {}
            }),
          );
          setOtherUsers(profiles);
        }
      } catch (e) {
        console.error("Error loading schedule:", e);
      } finally {
        if (!isRefresh) setLoading(false);
      }
    },
    [user],
  );

  // ── Helpers ────────────────────────────────────────────────────────────────

  const resetForms = () => {
    setRidePickup("");
    setRideDropoff("");
    setPickupCoords(null);
    setDropoffCoords(null);
    setRideDepartureTime("08:00");
    setRideDays([]);
    setShowDepartureDropdown(false);
    setAvailDays([]);
    setAvailStartTime("08:00");
    setAvailEndTime("17:00");
    setShowStartDropdown(false);
    setShowEndDropdown(false);
  };

  const closeAddModal = () => {
    if (!submitting) {
      setShowAddModal(false);
      resetForms();
    }
  };

  const toggleFormDay = (
    day: string,
    current: string[],
    setter: (v: string[]) => void,
  ) => {
    setter(
      current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day],
    );
  };

  // ── Submit: add ride (rider) ───────────────────────────────────────────────

  const handleAddRide = async () => {
    if (!user) return;
    if (!ridePickup.trim() || !rideDropoff.trim()) {
      Alert.alert(
        "Missing info",
        "Please enter both pickup and dropoff addresses.",
      );
      return;
    }
    if (rideDays.length === 0) {
      Alert.alert("Missing info", "Please select at least one day.");
      return;
    }
    setSubmitting(true);
    try {
      const [resolvedPickup, resolvedDropoff] = await Promise.all([
        pickupCoords
          ? Promise.resolve(pickupCoords)
          : forwardGeocode(ridePickup.trim()),
        dropoffCoords
          ? Promise.resolve(dropoffCoords)
          : forwardGeocode(rideDropoff.trim()),
      ]);
      if (!resolvedPickup || !resolvedDropoff) {
        Alert.alert(
          "Address not found",
          "Could not locate one or both addresses. Try adding a city or zip code.",
        );
        return;
      }
      const durationMinutes = await calculateDriveTime(
        { latitude: resolvedPickup.lat, longitude: resolvedPickup.lng },
        { latitude: resolvedDropoff.lat, longitude: resolvedDropoff.lng },
      );
      await createRiderRide({
        userId: user.uid,
        pickupAddress: ridePickup.trim(),
        dropoffAddress: rideDropoff.trim(),
        pickupLat: resolvedPickup.lat,
        pickupLng: resolvedPickup.lng,
        dropoffLat: resolvedDropoff.lat,
        dropoffLng: resolvedDropoff.lng,
        departureTime: rideDepartureTime,
        repeating: true,
        repeatDays: rideDays,
        estimatedDurationMinutes: durationMinutes,
      });
      closeAddModal();
      await loadAll(true);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not add ride.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Submit: add availability (driver) ─────────────────────────────────────

  const handleAddAvailability = async () => {
    if (!user) return;
    if (availDays.length === 0) {
      Alert.alert("Missing info", "Please select at least one day.");
      return;
    }
    if (availStartTime >= availEndTime) {
      Alert.alert("Invalid time", "End time must be after start time.");
      return;
    }
    setSubmitting(true);
    try {
      await createScheduleBlock({
        userId: user.uid,
        role: "driver",
        date: null,
        startTime: availStartTime,
        endTime: availEndTime,
        status: "open",
        repeating: true,
        repeatDays: availDays,
        repeatEndsAt: null,
        seriesId: null,
        expiresAt: null,
        parentBlockId: null,
      });
      closeAddModal();
      await loadAll(true);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not save availability.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDeleteRide = (rideId: string) => {
    setPendingDeletion(rideId);
    setShowDeleteConfirm(true);
  };

  const executeDelete = async () => {
    if (!pendingDeletion) return;
    setShowDeleteConfirm(false);
    setActingOnRide(true);
    try {
      await deleteRiderRide(pendingDeletion);
      await loadAll(true);
      setSelectedRiderRide(null);
      setPendingDeletion(null);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setActingOnRide(false);
    }
  };

  const handleDeleteBlock = (blockId: string) => {
    Alert.alert("Remove Availability", "Remove this availability window?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "scheduleBlocks", blockId));
            setDriverBlocks((prev) => prev.filter((b) => b.id !== blockId));
          } catch (e: any) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);
  };

  // ── Accept / Deny ride requests ────────────────────────────────────────────

  const handleAcceptRide = async (requestId: string, notifyUserId: string) => {
    setActingOnRide(true);
    try {
      await confirmRideRequest(requestId);
      await createNotification(
        notifyUserId,
        "ride_confirmed",
        requestId,
        "Your ride request has been accepted!",
      );
      await loadAll(true);
      // Use InteractionManager to schedule modal close after state updates are processed
      InteractionManager.runAfterInteractions(() => {
        setSelectedRide(null);
        setSelectedIncoming(null);
        setSelectedRiderRide(null);
        setActingOnRide(false);
      });
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not accept the request.");
      setActingOnRide(false);
    }
  };

  const handleDenyRide = async (requestId: string, notifyUserId: string) => {
    setActingOnRide(true);
    try {
      await denyRideRequest(requestId);
      await createNotification(
        notifyUserId,
        "ride_denied",
        requestId,
        "Your ride request was declined.",
      );
      await loadAll(true);
      // Use InteractionManager to schedule modal close after state updates are processed
      InteractionManager.runAfterInteractions(() => {
        setSelectedRide(null);
        setSelectedIncoming(null);
        setSelectedRiderRide(null);
        setActingOnRide(false);
      });
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not deny the request.");
      setActingOnRide(false);
    }
  };

  const handleCancelRideRequest = (
    requestId: string,
    otherUserId: string,
    riderRideId?: string,
  ) => {
    const payload: PendingCancellation = {
      requestId,
      otherUserId,
      riderRideId,
    };
    pendingCancellationRef.current = payload;
    setPendingCancellation(payload);

    // Nested Modal + Modal breaks touch handling on native; use system alert instead.
    if (Platform.OS !== "web") {
      Alert.alert(
        "Cancel Ride",
        "This will cancel your confirmed ride. Are you sure?",
        [
          {
            text: "Keep Ride",
            style: "cancel",
            onPress: () => {
              pendingCancellationRef.current = null;
              setPendingCancellation(null);
            },
          },
          {
            text: "Cancel Ride",
            style: "destructive",
            onPress: () => void runCancellation(payload),
          },
        ],
      );
      return;
    }

    setShowCancelConfirm(true);
  };

  const runCancellation = async (payload: PendingCancellation | null) => {
    if (!payload) return;

    const { requestId, otherUserId, riderRideId } = payload;
    setShowCancelConfirm(false);
    setActingOnRide(true);

    try {
      await cancelRideRequest(requestId, user?.uid);
      await createNotification(
        otherUserId,
        "ride_cancelled",
        requestId,
        "A ride has been cancelled.",
      );

      if (riderRideId && userProfile?.activeRole === "rider") {
        await deleteRiderRide(riderRideId);
      }

      await loadAll(true);
      setSelectedRide(null);
      setSelectedRiderRide(null);
      pendingCancellationRef.current = null;
      setPendingCancellation(null);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not cancel the ride.");
    } finally {
      setActingOnRide(false);
    }
  };

  const executeCancellation = () => {
    const payload =
      pendingCancellationRef.current ?? pendingCancellation;
    void runCancellation(payload);
  };

  const handleViewUserPage = (otherUser: User) => {
    router.push({
      pathname: "../driver-details" as any,
      params: {
        id: otherUser.uid,
        name: otherUser.name,
        rating: (otherUser.starRating ?? 0).toString(),
        totalRides: (otherUser.rideCount ?? 0).toString(),
        bio: otherUser.bio ?? "",
        profilePhoto: normalizeProfilePhotoUrl(otherUser.profilePhoto),
        distance: "0",
        score: "0",
        matchingRides: "[]",
        myRole: userProfile?.activeRole ?? "rider",
      },
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return <LoadingScreen />;
  }

  const isRider = userProfile?.activeRole === "rider";

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="My Schedule"
        right={
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowAddModal(true)}
          >
            <Ionicons name="add" size={22} color={TEXT_INVERSE} />
          </TouchableOpacity>
        }
      />

      {/* Day accordion */}
      <ScrollView contentContainerStyle={styles.listContent}>
        {DAYS.map((day) => {
          const dayBlocks = isRider
            ? []
            : driverBlocks.filter((b) => blockMatchesDay(b, day));
          const dayRequests = isRider
            ? []
            : driverRides
                .filter((r) => rideRequestMatchesDay(r, day))
                .sort((a, b) =>
                  a.requestedStart.localeCompare(b.requestedStart),
                );
          const dayRides = isRider
            ? riderRides
                .filter((r) => r.repeatDays.includes(day))
                .sort((a, b) => a.departureTime.localeCompare(b.departureTime))
            : [];
          const dayIncoming = incomingRequests.filter((r) =>
            dayRides.some((ride) => ride.id === r.riderRideId),
          );

          return (
            <DaySection
              key={day}
              day={day}
              isOpen={openDay === day}
              onToggle={() => setOpenDay((prev) => (prev === day ? null : day))}
              hasAvailability={dayBlocks.length > 0}
              hasRides={
                dayRequests.length > 0 ||
                dayRides.length > 0 ||
                dayIncoming.length > 0
              }
            >
              {isRider ? (
                <RiderDayContent
                  rides={dayRides}
                  incomingRequests={incomingRequests}
                  confirmedRequests={confirmedRiderRequests}
                  requestDrivers={requestDrivers}
                  onRideTap={setSelectedRiderRide}
                  onIncomingTap={setSelectedIncoming}
                />
              ) : (
                <DriverDayContent
                  availabilityBlocks={dayBlocks}
                  rides={dayRequests}
                  otherUsers={otherUsers}
                  onRideTap={setSelectedRide}
                  onDeleteBlock={handleDeleteBlock}
                />
              )}
            </DaySection>
          );
        })}
      </ScrollView>

      {/* ── Add modal ─────────────────────────────────────────────────────── */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={closeAddModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={closeAddModal}
          />
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {isRider ? "Add Ride" : "Add Availability"}
              </Text>
              <TouchableOpacity onPress={closeAddModal}>
                <Ionicons name="close" size={26} color={TEXT_PRIMARY} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {isRider ? (
                <RiderScheduleForm
                  pickup={ridePickup}
                  dropoff={rideDropoff}
                  departureTime={rideDepartureTime}
                  setDepartureTime={setRideDepartureTime}
                  days={rideDays}
                  showDepartureDropdown={showDepartureDropdown}
                  setShowDepartureDropdown={setShowDepartureDropdown}
                  onToggleDay={(d) => toggleFormDay(d, rideDays, setRideDays)}
                  onPickupChange={(t) => {
                    setRidePickup(t);
                    setPickupCoords(null);
                  }}
                  onPickupSelect={(a, lat, lng) => {
                    setRidePickup(a);
                    setPickupCoords({ lat, lng });
                  }}
                  onDropoffChange={(t) => {
                    setRideDropoff(t);
                    setDropoffCoords(null);
                  }}
                  onDropoffSelect={(a, lat, lng) => {
                    setRideDropoff(a);
                    setDropoffCoords({ lat, lng });
                  }}
                />
              ) : (
                <DriverScheduleForm
                  days={availDays}
                  startTime={availStartTime}
                  setStartTime={setAvailStartTime}
                  endTime={availEndTime}
                  setEndTime={setAvailEndTime}
                  showStartDropdown={showStartDropdown}
                  setShowStartDropdown={(v) => {
                    setShowStartDropdown(v);
                    if (v) setShowEndDropdown(false);
                  }}
                  showEndDropdown={showEndDropdown}
                  setShowEndDropdown={(v) => {
                    setShowEndDropdown(v);
                    if (v) setShowStartDropdown(false);
                  }}
                  onToggleDay={(d) => toggleFormDay(d, availDays, setAvailDays)}
                />
              )}

              <TouchableOpacity
                style={[
                  styles.submitButton,
                  submitting && styles.submitButtonDisabled,
                ]}
                onPress={isRider ? handleAddRide : handleAddAvailability}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={TEXT_INVERSE} />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color={TEXT_INVERSE} />
                    <Text style={styles.submitButtonText}>
                      {isRider ? "Add Ride" : "Save Availability"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Driver modal: respond to rider-initiated requests ──────────────── */}
      <Modal
        visible={selectedRide !== null}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!actingOnRide) setSelectedRide(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => {
              if (!actingOnRide) setSelectedRide(null);
            }}
          />
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            {selectedRide &&
              (() => {
                const ride = selectedRide;
                const riderName = otherUsers[ride.riderId]?.name ?? "Rider";
                const isPending = ride.status === "pending";
                // Driver initiated this request — they're waiting for the rider
                const awaitingRider =
                  isPending && ride.initiatedBy === "driver";
                return (
                  <>
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>
                        {isPending ? "Ride Request" : "Confirmed Ride"}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setSelectedRide(null)}
                        disabled={actingOnRide}
                      >
                        <Ionicons name="close" size={26} color={TEXT_PRIMARY} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.detailRow}>
                      <Ionicons
                        name="person-circle-outline"
                        size={20}
                        color="#636366"
                      />
                      <Text style={styles.detailText}>Rider: {riderName}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Ionicons
                        name="calendar-outline"
                        size={20}
                        color="#636366"
                      />
                      <Text style={styles.detailText}>Date: {ride.date}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Ionicons name="time-outline" size={20} color="#636366" />
                      <Text style={styles.detailText}>
                        {format12h(ride.requestedStart)} –{" "}
                        {format12h(ride.requestedEnd)}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Ionicons
                        name="ellipse-outline"
                        size={20}
                        color="#636366"
                      />
                      <Text
                        style={[
                          styles.detailText,
                          {
                            color: isPending ? "#FF9500" : "#34C759",
                            fontWeight: "600",
                          },
                        ]}
                      >
                        {awaitingRider
                          ? "Awaiting rider response"
                          : isPending
                            ? "Pending your response"
                            : "Confirmed"}
                      </Text>
                    </View>

                    {/* View Rider's Page button */}
                    {(() => {
                      const riderUser = otherUsers[ride.riderId];
                      return riderUser ? (
                        <TouchableOpacity
                          style={styles.viewProfileButton}
                          onPress={() => {
                            setSelectedRide(null);
                            handleViewUserPage(riderUser);
                          }}
                        >
                          <Ionicons
                            name="person-circle-outline"
                            size={18}
                            color={ACCENT}
                          />
                          <Text style={styles.viewProfileText}>
                            View Rider's Page
                          </Text>
                        </TouchableOpacity>
                      ) : null;
                    })()}

                    {isPending && !awaitingRider ? (
                      <View style={styles.actionRow}>
                        <TouchableOpacity
                          style={[
                            styles.denyButton,
                            actingOnRide && styles.actionDisabled,
                          ]}
                          onPress={() => handleDenyRide(ride.id, ride.riderId)}
                          disabled={actingOnRide}
                        >
                          {actingOnRide ? (
                            <ActivityIndicator color={TEXT_INVERSE} size="small" />
                          ) : (
                            <Text style={styles.actionText}>Deny</Text>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.acceptButton,
                            actingOnRide && styles.actionDisabled,
                          ]}
                          onPress={() =>
                            handleAcceptRide(ride.id, ride.riderId)
                          }
                          disabled={actingOnRide}
                        >
                          {actingOnRide ? (
                            <ActivityIndicator color={TEXT_INVERSE} size="small" />
                          ) : (
                            <Text style={styles.actionText}>Accept</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    ) : !isPending ? (
                      <>
                        <View style={styles.confirmedBadge}>
                          <Ionicons
                            name="checkmark-circle"
                            size={18}
                            color={GREEN}
                          />
                          <Text style={styles.confirmedText}>
                            Ride confirmed
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[
                            styles.denyButton,
                            { marginTop: 12 },
                            actingOnRide && styles.actionDisabled,
                          ]}
                          onPress={() => {
                            handleCancelRideRequest(
                              ride.id,
                              ride.riderId,
                              ride.riderRideId,
                            );
                          }}
                          disabled={actingOnRide}
                        >
                          {actingOnRide ? (
                            <ActivityIndicator color={TEXT_INVERSE} size="small" />
                          ) : (
                            <Text style={styles.actionText}>Cancel Ride</Text>
                          )}
                        </TouchableOpacity>
                      </>
                    ) : null}
                  </>
                );
              })()}
          </View>
        </View>
      </Modal>

      {/* ── Rider ride detail modal ────────────────────────────────────────── */}
      <Modal
        visible={selectedRiderRide !== null}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!actingOnRide) setSelectedRiderRide(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => {
              if (!actingOnRide) setSelectedRiderRide(null);
            }}
          />
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 20 }}
              keyboardShouldPersistTaps="handled"
            >
              {selectedRiderRide &&
                (() => {
                  const ride = selectedRiderRide;
                  const confirmed = confirmedRiderRequests.find(
                    (r) => r.riderRideId === ride.id,
                  );
                  const pendingIncoming = incomingRequests.filter(
                    (r) => r.riderRideId === ride.id,
                  );
                  const confirmedDriver = confirmed
                    ? requestDrivers[confirmed.driverId]
                    : null;

                  return (
                    <>
                      <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Ride Details</Text>
                        <TouchableOpacity
                          onPress={() => setSelectedRiderRide(null)}
                          disabled={actingOnRide}
                        >
                          <Ionicons name="close" size={26} color={TEXT_PRIMARY} />
                        </TouchableOpacity>
                      </View>

                      {/* Route */}
                      <View style={styles.detailRow}>
                        <Ionicons
                          name="location-outline"
                          size={20}
                          color={GREEN}
                        />
                        <Text style={styles.detailText} numberOfLines={2}>
                          {ride.pickupAddress}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Ionicons
                          name="navigate-outline"
                          size={20}
                          color={RED}
                        />
                        <Text style={styles.detailText} numberOfLines={2}>
                          {ride.dropoffAddress}
                        </Text>
                      </View>

                      {/* Time */}
                      <View style={styles.detailRow}>
                        <Ionicons
                          name="time-outline"
                          size={20}
                          color="#636366"
                        />
                        <Text style={styles.detailText}>
                          {format12h(ride.departureTime)}
                          {ride.estimatedDurationMinutes != null
                            ? `  ·  ${formatDriveTime(ride.estimatedDurationMinutes)}`
                            : ""}
                        </Text>
                      </View>

                      {/* Days */}
                      <View style={styles.detailRow}>
                        <Ionicons
                          name="calendar-outline"
                          size={20}
                          color="#636366"
                        />
                        <Text style={styles.detailText}>
                          {ride.repeatDays?.join(", ") ?? "—"}
                        </Text>
                      </View>

                      {/* Status */}
                      {confirmed ? (
                        <View style={styles.detailRow}>
                          <Ionicons
                            name="checkmark-circle"
                            size={20}
                            color={GREEN}
                          />
                          <Text
                            style={[
                              styles.detailText,
                              { color: GREEN, fontWeight: "600" },
                            ]}
                          >
                            Driver confirmed
                            {confirmedDriver ? `: ${confirmedDriver.name}` : ""}
                          </Text>
                        </View>
                      ) : pendingIncoming.length > 0 ? (
                        <View style={styles.detailRow}>
                          <Ionicons
                            name="car-outline"
                            size={20}
                            color={ACCENT}
                          />
                          <Text
                            style={[
                              styles.detailText,
                              { color: ACCENT, fontWeight: "600" },
                            ]}
                          >
                            {pendingIncoming.length} driver
                            {pendingIncoming.length > 1 ? "s" : ""} want
                            {pendingIncoming.length === 1 ? "s" : ""} to match
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.detailRow}>
                          <Ionicons
                            name="search-outline"
                            size={20}
                            color="#aeaeb2"
                          />
                          <Text
                            style={[styles.detailText, { color: "#aeaeb2" }]}
                          >
                            Searching for a driver…
                          </Text>
                        </View>
                      )}

                      {/* View driver page button */}
                      {confirmedDriver && (
                        <TouchableOpacity
                          style={styles.viewProfileButton}
                          onPress={() => {
                            setSelectedRiderRide(null);
                            handleViewUserPage(confirmedDriver);
                          }}
                        >
                          <Ionicons
                            name="person-circle-outline"
                            size={18}
                            color={ACCENT}
                          />
                          <Text style={styles.viewProfileText}>
                            View Driver's Page
                          </Text>
                        </TouchableOpacity>
                      )}

                      {/* Driver-initiated pending requests: accept/decline (also reachable if list "Respond" was flaky) */}
                      {!confirmed && pendingIncoming.length > 0 && (
                        <View style={{ gap: 14, marginTop: 6 }}>
                          {pendingIncoming.map((req) => {
                            const dName =
                              requestDrivers[req.driverId]?.name ?? "Driver";
                            return (
                              <View
                                key={req.id}
                                style={{
                                  borderWidth: 1,
                                  borderColor: "#bfdbfe",
                                  borderRadius: 12,
                                  padding: 12,
                                  backgroundColor: "#EFF6FF",
                                }}
                              >
                                <Text
                                  style={[
                                    styles.detailText,
                                    { fontWeight: "600", marginBottom: 10 },
                                  ]}
                                >
                                  {dName} wants to drive this ride
                                </Text>
                                <View
                                  style={[styles.actionRow, { marginTop: 0 }]}
                                >
                                  <TouchableOpacity
                                    style={[
                                      styles.denyButton,
                                      actingOnRide && styles.actionDisabled,
                                    ]}
                                    onPress={() =>
                                      handleDenyRide(req.id, req.driverId)
                                    }
                                    disabled={actingOnRide}
                                  >
                                    {actingOnRide ? (
                                      <ActivityIndicator
                                        color={TEXT_INVERSE}
                                        size="small"
                                      />
                                    ) : (
                                      <Text style={styles.actionText}>
                                        Decline
                                      </Text>
                                    )}
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={[
                                      styles.acceptButton,
                                      actingOnRide && styles.actionDisabled,
                                    ]}
                                    onPress={() =>
                                      handleAcceptRide(req.id, req.driverId)
                                    }
                                    disabled={actingOnRide}
                                  >
                                    {actingOnRide ? (
                                      <ActivityIndicator
                                        color={TEXT_INVERSE}
                                        size="small"
                                      />
                                    ) : (
                                      <Text style={styles.actionText}>
                                        Accept
                                      </Text>
                                    )}
                                  </TouchableOpacity>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      )}

                      {/* Action buttons */}
                      <View style={styles.actionRow}>
                        {confirmed ? (
                          <TouchableOpacity
                            style={[
                              styles.denyButton,
                              actingOnRide && styles.actionDisabled,
                            ]}
                            onPress={() =>
                              handleCancelRideRequest(
                                confirmed.id,
                                confirmed.driverId,
                                ride.id,
                              )
                            }
                            disabled={actingOnRide}
                          >
                            {actingOnRide ? (
                              <ActivityIndicator color={TEXT_INVERSE} size="small" />
                            ) : (
                              <Text style={styles.actionText}>Cancel Ride</Text>
                            )}
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            style={[
                              styles.denyButton,
                              actingOnRide && styles.actionDisabled,
                            ]}
                            onPress={() => handleDeleteRide(ride.id)}
                            disabled={actingOnRide}
                          >
                            <Text style={styles.actionText}>Remove Ride</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </>
                  );
                })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Rider modal: respond to driver-initiated requests ───────────────── */}
      <Modal
        visible={selectedIncoming !== null}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!actingOnRide) setSelectedIncoming(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => {
              if (!actingOnRide) setSelectedIncoming(null);
            }}
          />
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            {selectedIncoming &&
              (() => {
                const req = selectedIncoming;
                const driverName =
                  requestDrivers[req.driverId]?.name ?? "Driver";
                return (
                  <>
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>
                        Driver Match Request
                      </Text>
                      <TouchableOpacity
                        onPress={() => setSelectedIncoming(null)}
                        disabled={actingOnRide}
                      >
                        <Ionicons name="close" size={26} color={TEXT_PRIMARY} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.detailRow}>
                      <Ionicons
                        name="person-circle-outline"
                        size={20}
                        color="#636366"
                      />
                      <Text style={styles.detailText}>
                        Driver: {driverName}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Ionicons name="time-outline" size={20} color="#636366" />
                      <Text style={styles.detailText}>
                        {format12h(req.requestedStart)} –{" "}
                        {format12h(req.requestedEnd)}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Ionicons
                        name="calendar-outline"
                        size={20}
                        color="#636366"
                      />
                      <Text style={styles.detailText}>
                        {req.repeatDays?.join(", ") ?? req.date}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Ionicons
                        name="information-circle-outline"
                        size={20}
                        color="#636366"
                      />
                      <Text
                        style={[
                          styles.detailText,
                          { color: ORANGE, fontWeight: "600" },
                        ]}
                      >
                        This driver would like to drive you
                      </Text>
                    </View>

                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[
                          styles.denyButton,
                          actingOnRide && styles.actionDisabled,
                        ]}
                        onPress={() => handleDenyRide(req.id, req.driverId)}
                        disabled={actingOnRide}
                      >
                        {actingOnRide ? (
                          <ActivityIndicator color={TEXT_INVERSE} size="small" />
                        ) : (
                          <Text style={styles.actionText}>Decline</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.acceptButton,
                          actingOnRide && styles.actionDisabled,
                        ]}
                        onPress={() => handleAcceptRide(req.id, req.driverId)}
                        disabled={actingOnRide}
                      >
                        {actingOnRide ? (
                          <ActivityIndicator color={TEXT_INVERSE} size="small" />
                        ) : (
                          <Text style={styles.actionText}>Accept</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </>
                );
              })()}
          </View>
        </View>
      </Modal>

      {/* ── Custom Cancel Confirmation Modal ───────────────────────────────────── */}
      <ConfirmDialog
        visible={showCancelConfirm}
        title="Cancel Ride"
        message="This will cancel your confirmed ride. Are you sure?"
        confirmLabel="Cancel Ride"
        cancelLabel="Keep Ride"
        onConfirm={() => {
          executeCancellation();
        }}
        onCancel={() => {
          pendingCancellationRef.current = null;
          setShowCancelConfirm(false);
          setPendingCancellation(null);
        }}
      />

      {/* ── Custom Delete Confirmation Modal ───────────────────────────────────── */}
      <ConfirmDialog
        visible={showDeleteConfirm}
        title="Remove Ride"
        message="Remove this ride from your schedule? This cannot be undone."
        confirmLabel="Remove Ride"
        cancelLabel="Keep Ride"
        onConfirm={() => {
          executeDelete();
        }}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setPendingDeletion(null);
        }}
      />
    </View>
  );
}

// ─── Day accordion section ────────────────────────────────────────────────────

function DaySection({
  day,
  isOpen,
  onToggle,
  hasAvailability,
  hasRides,
  children,
}: {
  day: string;
  isOpen: boolean;
  onToggle: () => void;
  hasAvailability: boolean;
  hasRides: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.daySection, isOpen && styles.daySectionOpen]}>
      <TouchableOpacity
        style={styles.dayHeader}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        <View style={styles.dayHeaderLeft}>
          <Text style={[styles.dayName, isOpen && styles.dayNameOpen]}>
            {FULL_DAY[day]}
          </Text>
          {(hasAvailability || hasRides) && (
            <View style={styles.dotRow}>
              {hasAvailability && (
                <View style={[styles.dot, styles.dotGreen]} />
              )}
              {hasRides && <View style={[styles.dot, styles.dotBlue]} />}
            </View>
          )}
        </View>
        <Ionicons
          name={isOpen ? "chevron-up" : "chevron-down"}
          size={18}
          color={isOpen ? "#007AFF" : "#aeaeb2"}
        />
      </TouchableOpacity>

      {isOpen && <View style={styles.dayBody}>{children}</View>}
    </View>
  );
}

// ─── Driver day content ───────────────────────────────────────────────────────

function DriverDayContent({
  availabilityBlocks,
  rides,
  otherUsers,
  onRideTap,
  onDeleteBlock,
}: {
  availabilityBlocks: ScheduleBlockWithId[];
  rides: RideRequestWithId[];
  otherUsers: Record<string, User>;
  onRideTap: (r: RideRequestWithId) => void;
  onDeleteBlock: (id: string) => void;
}) {
  // Rider asked the driver → driver must respond
  const riderInitiated = rides.filter(
    (r) => r.status === "pending" && r.initiatedBy !== "driver",
  );
  // Driver asked the rider → waiting for rider to respond
  const driverInitiated = rides.filter(
    (r) => r.status === "pending" && r.initiatedBy === "driver",
  );
  const confirmed = rides.filter((r) => r.status === "confirmed");

  const RideRow = ({ ride }: { ride: RideRequestWithId }) => {
    const isPending = ride.status === "pending";
    const isAwaiting = isPending && ride.initiatedBy === "driver";
    const riderName = otherUsers[ride.riderId]?.name ?? "Rider";
    return (
      <TouchableOpacity
        style={[
          styles.rideRow,
          isPending ? styles.rideRowPending : styles.rideRowConfirmed,
        ]}
        onPress={() => onRideTap(ride)}
        activeOpacity={0.75}
      >
        <View style={styles.rideRowLeft}>
          <Text style={styles.rideRowName}>{riderName}</Text>
          <Text style={styles.rideRowTime}>
            {format12h(ride.requestedStart)} – {format12h(ride.requestedEnd)}
          </Text>
        </View>
        <View style={styles.rideRowRight}>
          <View
            style={[
              styles.statusPill,
              isAwaiting
                ? styles.pillAwaiting
                : isPending
                  ? styles.pillPending
                  : styles.pillConfirmed,
            ]}
          >
            <Text style={styles.statusPillText}>
              {isAwaiting ? "Awaiting" : isPending ? "Pending" : "Confirmed"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={15} color="#c7c7cc" />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View>
      {/* Availability */}
      <Text style={styles.sectionLabel}>AVAILABILITY</Text>
      {availabilityBlocks.length === 0 ? (
        <Text style={styles.emptyNote}>No availability set for this day</Text>
      ) : (
        availabilityBlocks.map((block) => (
          <View key={block.id} style={styles.availRow}>
            <View style={styles.availDot} />
            <Text style={styles.availText}>
              {format12h(block.startTime)} – {format12h(block.endTime)}
            </Text>
            <TouchableOpacity
              onPress={() => onDeleteBlock(block.id)}
              style={styles.availDelete}
            >
              <Ionicons name="close-circle" size={18} color="#c7c7cc" />
            </TouchableOpacity>
          </View>
        ))
      )}

      {/* Ride Requests — rider asked, driver responds */}
      <Text style={[styles.sectionLabel, { marginTop: 20 }]}>
        RIDE REQUESTS
      </Text>
      {riderInitiated.length === 0 ? (
        <Text style={styles.emptyNote}>No pending ride requests</Text>
      ) : (
        riderInitiated.map((ride) => <RideRow key={ride.id} ride={ride} />)
      )}

      {/* Awaiting Response — driver asked, waiting for rider */}
      {driverInitiated.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { marginTop: 20 }]}>
            AWAITING RESPONSE
          </Text>
          {driverInitiated.map((ride) => (
            <RideRow key={ride.id} ride={ride} />
          ))}
        </>
      )}

      {/* Confirmed rides */}
      {confirmed.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { marginTop: 20 }]}>
            SCHEDULED RIDES
          </Text>
          {confirmed.map((ride) => (
            <RideRow key={ride.id} ride={ride} />
          ))}
        </>
      )}
    </View>
  );
}

// ─── Rider day content ────────────────────────────────────────────────────────

function RiderDayContent({
  rides,
  incomingRequests,
  confirmedRequests,
  requestDrivers,
  onRideTap,
  onIncomingTap,
}: {
  rides: RiderRideWithId[];
  incomingRequests: RideRequestWithId[];
  confirmedRequests: RideRequestWithId[];
  requestDrivers: Record<string, User>;
  onRideTap: (r: RiderRideWithId) => void;
  onIncomingTap: (r: RideRequestWithId) => void;
}) {
  if (rides.length === 0) {
    return (
      <Text style={styles.emptyNote}>No rides scheduled for this day</Text>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      {rides.map((ride) => {
        const pendingForRide = incomingRequests.filter(
          (r) => r.riderRideId === ride.id,
        );
        const isConfirmed = confirmedRequests.some(
          (r) => r.riderRideId === ride.id,
        );
        return (
          <View
            key={ride.id}
            style={[
              styles.riderRideCard,
              isConfirmed && styles.riderRideCardConfirmed,
            ]}
          >
            <TouchableOpacity
              onPress={() => {
                onRideTap(ride);
              }}
              activeOpacity={0.75}
            >
              <View style={styles.riderRideCardRow}>
                <View style={styles.routeViz}>
                  <View style={styles.routeDotGreen} />
                  <View style={styles.routeVizLine} />
                  <Ionicons name="location" size={14} color={RED} />
                </View>
                <View style={styles.routeInfo}>
                  <Text style={styles.routeAddr} numberOfLines={1}>
                    {ride.pickupAddress}
                  </Text>
                  <View style={styles.routeTimeBadge}>
                    <Ionicons name="time-outline" size={12} color="#8e8e93" />
                    <Text style={styles.routeTimeTxt}>
                      {format12h(ride.departureTime)}
                      {ride.estimatedDurationMinutes != null
                        ? `  ·  ${formatDriveTime(ride.estimatedDurationMinutes)}`
                        : ""}
                    </Text>
                  </View>
                  <Text style={styles.routeAddr} numberOfLines={1}>
                    {ride.dropoffAddress}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  {isConfirmed && (
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={GREEN}
                    />
                  )}
                  <Ionicons name="chevron-forward" size={16} color="#c7c7cc" />
                </View>
              </View>
            </TouchableOpacity>

            {/* Incoming driver match requests for this ride */}
            {pendingForRide.map((req) => {
              const driverName =
                requestDrivers[req.driverId]?.name ?? "A driver";
              return (
                <TouchableOpacity
                  key={req.id}
                  style={styles.incomingRequestBanner}
                  onPress={() => {
                    onIncomingTap(req);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.incomingRequestLeft}>
                    <Ionicons name="car" size={14} color={ACCENT} />
                    <Text style={styles.incomingRequestText} numberOfLines={1}>
                      {driverName} wants to drive this ride
                    </Text>
                  </View>
                  <View style={styles.incomingRequestAction}>
                    <Text style={styles.incomingRequestActionText}>
                      Respond
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={13}
                      color={ACCENT}
                    />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}
