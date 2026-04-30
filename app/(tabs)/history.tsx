import { useAuth } from '@/context/AuthContext';
import { createNotification } from '@/services/notificationService';
import { cancelRideRequest, confirmRideRequest, denyRideRequest } from '@/services/rideRequestService';
import { createRiderRide, deleteRiderRide, getRiderRides } from '@/services/riderRideService';
import { createScheduleBlock } from '@/services/scheduleBlockService';
import { getUser } from '@/services/userService';
import type { RideRequest } from '@/types/rideRequest';
import type { RiderRide } from '@/types/riderRide';
import type { ScheduleBlock } from '@/types/scheduleBlock';
import type { User } from '@/types/user';
import { calculateDriveTime, formatDriveTime } from '@/utils/driveTime';
import { forwardGeocode } from '@/utils/geocoding';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { db } from '../../config/firebase';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FULL_DAY: Record<string, string> = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday',
  Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
};
const DAY_NUM: Record<number, string> = {
  0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat',
};

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 15) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function format12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const hours = h % 12 === 0 ? 12 : h % 12;
  return `${hours}:${String(m).padStart(2, '0')} ${period}`;
}

function dayMatchesList(day: string, list: string[] | null): boolean {
  if (!list) return false;
  return list.some(d => d.toLowerCase().startsWith(day.toLowerCase().slice(0, 3)));
}

function blockMatchesDay(block: ScheduleBlock, day: string): boolean {
  if (block.repeating) return dayMatchesList(day, block.repeatDays);
  if (block.date) return DAY_NUM[new Date(block.date + 'T00:00:00').getDay()] === day;
  return false;
}

function rideRequestMatchesDay(r: RideRequest, day: string): boolean {
  if (r.repeating) return dayMatchesList(day, r.repeatDays);
  return DAY_NUM[new Date(r.date + 'T00:00:00').getDay()] === day;
}

// ─── Local types ──────────────────────────────────────────────────────────────

interface RiderRideWithId extends RiderRide { id: string }
interface ScheduleBlockWithId extends ScheduleBlock { id: string }
interface RideRequestWithId extends RideRequest { id: string }

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
  const [selectedRide, setSelectedRide] = useState<RideRequestWithId | null>(null);
  // Rider-side modal: detail sheet for a specific riderRide
  const [selectedRiderRide, setSelectedRiderRide] = useState<RiderRideWithId | null>(null);
  // Rider-side modal (rider responds to driver-initiated requests)
  const [selectedIncoming, setSelectedIncoming] = useState<RideRequestWithId | null>(null);
  const [actingOnRide, setActingOnRide] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [pendingCancellation, setPendingCancellation] = useState<{
    requestId: string;
    otherUserId: string;
    riderRideId?: string;
  } | null>(null);
  const [cancellationStatus, setCancellationStatus] = useState<string>('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<string | null>(null);

  // Rider: incoming match requests from drivers and confirmed requests
  const [incomingRequests, setIncomingRequests] = useState<RideRequestWithId[]>([]);
  const [confirmedRiderRequests, setConfirmedRiderRequests] = useState<RideRequestWithId[]>([]);
  const [requestDrivers, setRequestDrivers] = useState<Record<string, User>>({});

  // ── Rider form ──
  const [ridePickup, setRidePickup] = useState('');
  const [rideDropoff, setRideDropoff] = useState('');
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [rideDepartureTime, setRideDepartureTime] = useState('08:00');
  const [rideDays, setRideDays] = useState<string[]>([]);
  const [showDepartureDropdown, setShowDepartureDropdown] = useState(false);

  // ── Driver form ──
  const [availDays, setAvailDays] = useState<string[]>([]);
  const [availStartTime, setAvailStartTime] = useState('08:00');
  const [availEndTime, setAvailEndTime] = useState('17:00');
  const [showStartDropdown, setShowStartDropdown] = useState(false);
  const [showEndDropdown, setShowEndDropdown] = useState(false);

  useEffect(() => { loadAll(); }, [user]);

  const loadAll = useCallback(async (isRefresh = false) => {
    if (!user) return;
    if (!isRefresh) setLoading(true);
    try {
      const profile = await getUser(user.uid);
      setUserProfile(profile);

      if (profile.activeRole === 'rider') {
        const [ridesResult, requestsSnap] = await Promise.all([
          getRiderRides(user.uid),
          getDocs(query(collection(db, 'rideRequests'), where('riderId', '==', user.uid))),
        ]);
        setRiderRides(ridesResult);

        const allRequests: RideRequestWithId[] = requestsSnap.docs
          .map(d => ({ ...(d.data() as RideRequest), id: d.id }));

        const incoming = allRequests.filter(r => r.initiatedBy === 'driver' && r.status === 'pending');
        const confirmed = allRequests.filter(r => r.status === 'confirmed');
        setIncomingRequests(incoming);
        setConfirmedRiderRequests(confirmed);

        const allDriverIds = [...new Set([...incoming, ...confirmed].map(r => r.driverId))];
        const driverProfiles: Record<string, User> = {};
        await Promise.all(allDriverIds.map(async id => {
          try { driverProfiles[id] = await getUser(id); } catch {}
        }));
        setRequestDrivers(driverProfiles);
      } else {
        const [blocksSnap, pendingSnap, confirmedSnap] = await Promise.all([
          getDocs(query(
            collection(db, 'scheduleBlocks'),
            where('userId', '==', user.uid),
            where('role', '==', 'driver'),
            where('status', '==', 'open'),
          )),
          getDocs(query(
            collection(db, 'rideRequests'),
            where('driverId', '==', user.uid),
            where('status', '==', 'pending'),
          )),
          getDocs(query(
            collection(db, 'rideRequests'),
            where('driverId', '==', user.uid),
            where('status', '==', 'confirmed'),
          )),
        ]);

        setDriverBlocks(
          blocksSnap.docs.map(d => ({ ...(d.data() as ScheduleBlock), id: d.id })),
        );

        const allRides: RideRequestWithId[] = [
          ...pendingSnap.docs.map(d => ({ ...(d.data() as RideRequest), id: d.id })),
          ...confirmedSnap.docs.map(d => ({ ...(d.data() as RideRequest), id: d.id })),
        ];
        setDriverRides(allRides);

        const riderIds = [...new Set(allRides.map(r => r.riderId))];
        const profiles: Record<string, User> = {};
        await Promise.all(
          riderIds.map(async id => {
            try { profiles[id] = await getUser(id); } catch {}
          }),
        );
        setOtherUsers(profiles);
      }
    } catch (e) {
      console.error('Error loading schedule:', e);
    } finally {
      if (!isRefresh) setLoading(false);
    }
  }, [user]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const resetForms = () => {
    setRidePickup(''); setRideDropoff('');
    setPickupCoords(null); setDropoffCoords(null);
    setRideDepartureTime('08:00'); setRideDays([]);
    setShowDepartureDropdown(false);
    setAvailDays([]);
    setAvailStartTime('08:00'); setAvailEndTime('17:00');
    setShowStartDropdown(false); setShowEndDropdown(false);
  };

  const closeAddModal = () => { if (!submitting) { setShowAddModal(false); resetForms(); } };

  const toggleFormDay = (day: string, current: string[], setter: (v: string[]) => void) => {
    setter(current.includes(day) ? current.filter(d => d !== day) : [...current, day]);
  };

  // ── Submit: add ride (rider) ───────────────────────────────────────────────

  const handleAddRide = async () => {
    if (!user) return;
    if (!ridePickup.trim() || !rideDropoff.trim()) {
      Alert.alert('Missing info', 'Please enter both pickup and dropoff addresses.');
      return;
    }
    if (rideDays.length === 0) {
      Alert.alert('Missing info', 'Please select at least one day.');
      return;
    }
    setSubmitting(true);
    try {
      const [resolvedPickup, resolvedDropoff] = await Promise.all([
        pickupCoords ? Promise.resolve(pickupCoords) : forwardGeocode(ridePickup.trim()),
        dropoffCoords ? Promise.resolve(dropoffCoords) : forwardGeocode(rideDropoff.trim()),
      ]);
      if (!resolvedPickup || !resolvedDropoff) {
        Alert.alert('Address not found', 'Could not locate one or both addresses. Try adding a city or zip code.');
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
        pickupLat: resolvedPickup.lat, pickupLng: resolvedPickup.lng,
        dropoffLat: resolvedDropoff.lat, dropoffLng: resolvedDropoff.lng,
        departureTime: rideDepartureTime,
        repeating: true,
        repeatDays: rideDays,
        estimatedDurationMinutes: durationMinutes,
      });
      closeAddModal();
      await loadAll(true);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not add ride.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Submit: add availability (driver) ─────────────────────────────────────

  const handleAddAvailability = async () => {
    if (!user) return;
    if (availDays.length === 0) { Alert.alert('Missing info', 'Please select at least one day.'); return; }
    if (availStartTime >= availEndTime) { Alert.alert('Invalid time', 'End time must be after start time.'); return; }
    setSubmitting(true);
    try {
      await createScheduleBlock({
        userId: user.uid, role: 'driver', date: null,
        startTime: availStartTime, endTime: availEndTime,
        status: 'open', repeating: true,
        repeatDays: availDays,
        repeatEndsAt: null, seriesId: null, expiresAt: null, parentBlockId: null,
      });
      closeAddModal();
      await loadAll(true);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save availability.');
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
      Alert.alert('Error', e.message); 
    } finally {
      setActingOnRide(false);
    }
  };

  const handleDeleteBlock = (blockId: string) => {
    Alert.alert('Remove Availability', 'Remove this availability window?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'scheduleBlocks', blockId));
            setDriverBlocks(prev => prev.filter(b => b.id !== blockId));
          } catch (e: any) { Alert.alert('Error', e.message); }
        },
      },
    ]);
  };

  // ── Accept / Deny ride requests ────────────────────────────────────────────

  const handleAcceptRide = async (requestId: string, notifyUserId: string) => {
    setActingOnRide(true);
    try {
      await confirmRideRequest(requestId);
      await createNotification(notifyUserId, 'ride_confirmed', requestId, 'Your ride request has been accepted!');
      await loadAll(true);
      // Use InteractionManager to schedule modal close after state updates are processed
      InteractionManager.runAfterInteractions(() => {
        setSelectedRide(null);
        setSelectedIncoming(null);
        setActingOnRide(false);
      });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not accept the request.');
      setActingOnRide(false);
    }
  };

  const handleDenyRide = async (requestId: string, notifyUserId: string) => {
    setActingOnRide(true);
    try {
      await denyRideRequest(requestId);
      await createNotification(notifyUserId, 'ride_denied', requestId, 'Your ride request was declined.');
      await loadAll(true);
      // Use InteractionManager to schedule modal close after state updates are processed
      InteractionManager.runAfterInteractions(() => {
        setSelectedRide(null);
        setSelectedIncoming(null);
        setActingOnRide(false);
      });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not deny the request.');
      setActingOnRide(false);
    }
  };

  const handleCancelRideRequest = async (requestId: string, otherUserId: string, riderRideId?: string) => {
    setPendingCancellation({ requestId, otherUserId, riderRideId });
    setShowCancelConfirm(true);
  };

  const executeCancellation = async () => {
    setCancellationStatus('Button clicked!');
    if (!pendingCancellation) {
      setCancellationStatus('Error: No pending cancellation');
      return;
    }
    
    const { requestId, otherUserId, riderRideId } = pendingCancellation;
    console.log('🔥 Starting cancellation:', { requestId, otherUserId, riderRideId });
    setCancellationStatus('Starting cancellation...');
    setShowCancelConfirm(false);
    setActingOnRide(true);
    
    try {
      console.log('Step 1: Cancelling ride request...');
      setCancellationStatus('Step 1/4: Cancelling request...');
      await cancelRideRequest(requestId, user?.uid);
      console.log('✅ Ride request cancelled');
      
      console.log('Step 2: Creating notification...');
      setCancellationStatus('Step 2/4: Sending notification...');
      await createNotification(otherUserId, 'ride_cancelled', requestId, 'A ride has been cancelled.');
      console.log('✅ Notification sent');
      
      if (riderRideId && userProfile?.activeRole === 'rider') {
        console.log('Step 3: Deleting rider ride:', riderRideId);
        setCancellationStatus('Step 3/4: Deleting ride...');
        await deleteRiderRide(riderRideId);
        console.log('✅ Rider ride deleted');
      } else {
        console.log('⚠️ Skipping rider ride deletion. riderRideId:', riderRideId, 'role:', userProfile?.activeRole);
        setCancellationStatus('Step 3/4: Skipped (no riderRideId)');
      }
      
      console.log('Step 4: Refreshing data and closing modals...');
      setCancellationStatus('Step 4/4: Refreshing...');
      
      await loadAll(true);
      console.log('✅ Data refreshed. Closing modals...');
      setSelectedRide(null);
      setSelectedRiderRide(null);
      setPendingCancellation(null);
      setCancellationStatus('Complete!');
      setTimeout(() => setCancellationStatus(''), 2000);
    } catch (e: any) {
      console.error('Error during cancellation:', e);
      console.error('Error message:', e.message);
      console.error('Error stack:', e.stack);
      setCancellationStatus('Error: ' + e.message);
      Alert.alert('Error', e.message ?? 'Could not cancel the ride.');
    } finally {
      setActingOnRide(false);
      console.log('🔥 Cancellation process finished');
    }
  };

  const handleViewUserPage = (otherUser: User) => {
    router.push({
      pathname: '../driver-details' as any,
      params: {
        id: otherUser.uid,
        name: otherUser.name,
        rating: (otherUser.starRating ?? 0).toString(),
        totalRides: (otherUser.rideCount ?? 0).toString(),
        bio: otherUser.bio ?? '',
        distance: '0',
        score: '0',
        matchingRides: '[]',
        myRole: userProfile?.activeRole ?? 'rider',
      },
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const isRider = userProfile?.activeRole === 'rider';

  return (
    <View style={styles.container}>

      {/* Debug Status Banner */}
      {cancellationStatus && (
        <View style={{ backgroundColor: '#FF9500', padding: 10, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>{cancellationStatus}</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Schedule</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Day accordion */}
      <ScrollView contentContainerStyle={styles.listContent}>
        {DAYS.map(day => {
          const dayBlocks = isRider ? [] : driverBlocks.filter(b => blockMatchesDay(b, day));
          const dayRequests = isRider
            ? []
            : driverRides
                .filter(r => rideRequestMatchesDay(r, day))
                .sort((a, b) => a.requestedStart.localeCompare(b.requestedStart));
          const dayRides = isRider
            ? riderRides
                .filter(r => r.repeatDays.includes(day))
                .sort((a, b) => a.departureTime.localeCompare(b.departureTime))
            : [];
          const dayIncoming = incomingRequests.filter(r =>
            dayRides.some(ride => ride.id === r.riderRideId),
          );

          return (
            <DaySection
              key={day}
              day={day}
              isOpen={openDay === day}
              onToggle={() => setOpenDay(prev => prev === day ? null : day)}
              hasAvailability={dayBlocks.length > 0}
              hasRides={dayRequests.length > 0 || dayRides.length > 0 || dayIncoming.length > 0}
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
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeAddModal} />
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {isRider ? 'Add Ride' : 'Add Availability'}
              </Text>
              <TouchableOpacity onPress={closeAddModal}>
                <Ionicons name="close" size={26} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {isRider ? (
                <RiderForm
                  pickup={ridePickup}
                  dropoff={rideDropoff}
                  departureTime={rideDepartureTime}
                  setDepartureTime={setRideDepartureTime}
                  days={rideDays}
                  showDepartureDropdown={showDepartureDropdown}
                  setShowDepartureDropdown={setShowDepartureDropdown}
                  onToggleDay={(d) => toggleFormDay(d, rideDays, setRideDays)}
                  onPickupChange={(t) => { setRidePickup(t); setPickupCoords(null); }}
                  onPickupSelect={(a, lat, lng) => { setRidePickup(a); setPickupCoords({ lat, lng }); }}
                  onDropoffChange={(t) => { setRideDropoff(t); setDropoffCoords(null); }}
                  onDropoffSelect={(a, lat, lng) => { setRideDropoff(a); setDropoffCoords({ lat, lng }); }}
                />
              ) : (
                <DriverForm
                  days={availDays}
                  startTime={availStartTime}
                  setStartTime={setAvailStartTime}
                  endTime={availEndTime}
                  setEndTime={setAvailEndTime}
                  showStartDropdown={showStartDropdown}
                  setShowStartDropdown={(v) => { setShowStartDropdown(v); if (v) setShowEndDropdown(false); }}
                  showEndDropdown={showEndDropdown}
                  setShowEndDropdown={(v) => { setShowEndDropdown(v); if (v) setShowStartDropdown(false); }}
                  onToggleDay={(d) => toggleFormDay(d, availDays, setAvailDays)}
                />
              )}

              <TouchableOpacity
                style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                onPress={isRider ? handleAddRide : handleAddAvailability}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={styles.submitButtonText}>
                      {isRider ? 'Add Ride' : 'Save Availability'}
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
        onRequestClose={() => { if (!actingOnRide) setSelectedRide(null); }}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => { if (!actingOnRide) setSelectedRide(null); }}
          />
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            {selectedRide && (() => {
              const ride = selectedRide;
              const riderName = otherUsers[ride.riderId]?.name ?? 'Rider';
              const isPending = ride.status === 'pending';
              // Driver initiated this request — they're waiting for the rider
              const awaitingRider = isPending && ride.initiatedBy === 'driver';
              return (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>
                      {isPending ? 'Ride Request' : 'Confirmed Ride'}
                    </Text>
                    <TouchableOpacity onPress={() => setSelectedRide(null)} disabled={actingOnRide}>
                      <Ionicons name="close" size={26} color="#333" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.detailRow}>
                    <Ionicons name="person-circle-outline" size={20} color="#636366" />
                    <Text style={styles.detailText}>Rider: {riderName}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="calendar-outline" size={20} color="#636366" />
                    <Text style={styles.detailText}>Date: {ride.date}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="time-outline" size={20} color="#636366" />
                    <Text style={styles.detailText}>
                      {format12h(ride.requestedStart)} – {format12h(ride.requestedEnd)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="ellipse-outline" size={20} color="#636366" />
                    <Text style={[
                      styles.detailText,
                      { color: isPending ? '#FF9500' : '#34C759', fontWeight: '600' },
                    ]}>
                      {awaitingRider
                        ? 'Awaiting rider response'
                        : isPending ? 'Pending your response' : 'Confirmed'}
                    </Text>
                  </View>

                  {/* View Rider's Page button */}
                  {(() => {
                    const riderUser = otherUsers[ride.riderId];
                    return riderUser ? (
                      <TouchableOpacity
                        style={styles.viewProfileButton}
                        onPress={() => { setSelectedRide(null); handleViewUserPage(riderUser); }}
                      >
                        <Ionicons name="person-circle-outline" size={18} color="#007AFF" />
                        <Text style={styles.viewProfileText}>View Rider's Page</Text>
                      </TouchableOpacity>
                    ) : null;
                  })()}

                  {isPending && !awaitingRider ? (
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[styles.denyButton, actingOnRide && styles.actionDisabled]}
                        onPress={() => handleDenyRide(ride.id, ride.riderId)}
                        disabled={actingOnRide}
                      >
                        {actingOnRide
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={styles.actionText}>Deny</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.acceptButton, actingOnRide && styles.actionDisabled]}
                        onPress={() => handleAcceptRide(ride.id, ride.riderId)}
                        disabled={actingOnRide}
                      >
                        {actingOnRide
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={styles.actionText}>Accept</Text>}
                      </TouchableOpacity>
                    </View>
                  ) : !isPending ? (
                    <>
                      <View style={styles.confirmedBadge}>
                        <Ionicons name="checkmark-circle" size={18} color="#34C759" />
                        <Text style={styles.confirmedText}>Ride confirmed</Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.denyButton, { marginTop: 12 }, actingOnRide && styles.actionDisabled]}
                        onPress={() => {
                          console.log('🔵 Cancel Ride button pressed (driver modal)', { 
                            rideId: ride.id, 
                            riderId: ride.riderId, 
                            riderRideId: ride.riderRideId,
                            actingOnRide,
                          });
                          handleCancelRideRequest(ride.id, ride.riderId, ride.riderRideId);
                        }}
                        disabled={actingOnRide}
                      >
                        {actingOnRide
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={styles.actionText}>Cancel Ride</Text>}
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
        onRequestClose={() => { if (!actingOnRide) setSelectedRiderRide(null); }}
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
            <View style={{ flex: 1 }}>
              <ScrollView 
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 20 }}
                keyboardShouldPersistTaps="handled"
              >
            {selectedRiderRide && (() => {
              const ride = selectedRiderRide;
              const confirmed = confirmedRiderRequests.find(r => r.riderRideId === ride.id);
              const pendingIncoming = incomingRequests.filter(r => r.riderRideId === ride.id);
              const confirmedDriver = confirmed ? requestDrivers[confirmed.driverId] : null;
              
              return (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Ride Details</Text>
                    <TouchableOpacity onPress={() => setSelectedRiderRide(null)} disabled={actingOnRide}>
                      <Ionicons name="close" size={26} color="#333" />
                    </TouchableOpacity>
                  </View>

                  {/* Route */}
                  <View style={styles.detailRow}>
                    <Ionicons name="location-outline" size={20} color="#34C759" />
                    <Text style={styles.detailText} numberOfLines={2}>{ride.pickupAddress}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="navigate-outline" size={20} color="#FF3B30" />
                    <Text style={styles.detailText} numberOfLines={2}>{ride.dropoffAddress}</Text>
                  </View>

                  {/* Time */}
                  <View style={styles.detailRow}>
                    <Ionicons name="time-outline" size={20} color="#636366" />
                    <Text style={styles.detailText}>
                      {format12h(ride.departureTime)}
                      {ride.estimatedDurationMinutes != null
                        ? `  ·  ${formatDriveTime(ride.estimatedDurationMinutes)}`
                        : ''}
                    </Text>
                  </View>

                  {/* Days */}
                  <View style={styles.detailRow}>
                    <Ionicons name="calendar-outline" size={20} color="#636366" />
                    <Text style={styles.detailText}>{ride.repeatDays?.join(', ') ?? '—'}</Text>
                  </View>

                  {/* Status */}
                  {confirmed ? (
                    <View style={styles.detailRow}>
                      <Ionicons name="checkmark-circle" size={20} color="#34C759" />
                      <Text style={[styles.detailText, { color: '#34C759', fontWeight: '600' }]}>
                        Driver confirmed{confirmedDriver ? `: ${confirmedDriver.name}` : ''}
                      </Text>
                    </View>
                  ) : pendingIncoming.length > 0 ? (
                    <View style={styles.detailRow}>
                      <Ionicons name="car-outline" size={20} color="#007AFF" />
                      <Text style={[styles.detailText, { color: '#007AFF', fontWeight: '600' }]}>
                        {pendingIncoming.length} driver{pendingIncoming.length > 1 ? 's' : ''} want{pendingIncoming.length === 1 ? 's' : ''} to match
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.detailRow}>
                      <Ionicons name="search-outline" size={20} color="#aeaeb2" />
                      <Text style={[styles.detailText, { color: '#aeaeb2' }]}>Searching for a driver…</Text>
                    </View>
                  )}

                  {/* View driver page button */}
                  {confirmedDriver && (
                    <TouchableOpacity
                      style={styles.viewProfileButton}
                      onPress={() => { setSelectedRiderRide(null); handleViewUserPage(confirmedDriver); }}
                    >
                      <Ionicons name="person-circle-outline" size={18} color="#007AFF" />
                      <Text style={styles.viewProfileText}>View Driver's Page</Text>
                    </TouchableOpacity>
                  )}

                  {/* Action buttons */}
                  <View style={styles.actionRow}>
                    {confirmed ? (
                      <TouchableOpacity
                        style={[styles.denyButton, actingOnRide && styles.actionDisabled]}
                        onPress={() => handleCancelRideRequest(confirmed.id, confirmed.driverId, ride.id)}
                        disabled={actingOnRide}
                      >
                        {actingOnRide
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={styles.actionText}>Cancel Ride</Text>}
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.denyButton, actingOnRide && styles.actionDisabled]}
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
        </View>
      </Modal>

      {/* ── Rider modal: respond to driver-initiated requests ───────────────── */}
      <Modal
        visible={selectedIncoming !== null}
        transparent
        animationType="slide"
        onRequestClose={() => { if (!actingOnRide) setSelectedIncoming(null); }}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => { if (!actingOnRide) setSelectedIncoming(null); }}
          />
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            {selectedIncoming && (() => {
              const req = selectedIncoming;
              const driverName = requestDrivers[req.driverId]?.name ?? 'Driver';
              return (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Driver Match Request</Text>
                    <TouchableOpacity onPress={() => setSelectedIncoming(null)} disabled={actingOnRide}>
                      <Ionicons name="close" size={26} color="#333" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.detailRow}>
                    <Ionicons name="person-circle-outline" size={20} color="#636366" />
                    <Text style={styles.detailText}>Driver: {driverName}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="time-outline" size={20} color="#636366" />
                    <Text style={styles.detailText}>
                      {format12h(req.requestedStart)} – {format12h(req.requestedEnd)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="calendar-outline" size={20} color="#636366" />
                    <Text style={styles.detailText}>
                      {req.repeatDays?.join(', ') ?? req.date}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="information-circle-outline" size={20} color="#636366" />
                    <Text style={[styles.detailText, { color: '#FF9500', fontWeight: '600' }]}>
                      This driver would like to drive you
                    </Text>
                  </View>

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[styles.denyButton, actingOnRide && styles.actionDisabled]}
                      onPress={() => handleDenyRide(req.id, req.driverId)}
                      disabled={actingOnRide}
                    >
                      {actingOnRide
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={styles.actionText}>Decline</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.acceptButton, actingOnRide && styles.actionDisabled]}
                      onPress={() => handleAcceptRide(req.id, req.driverId)}
                      disabled={actingOnRide}
                    >
                      {actingOnRide
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={styles.actionText}>Accept</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ── Custom Cancel Confirmation Modal ───────────────────────────────────── */}
      <Modal
        visible={showCancelConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowCancelConfirm(false);
          setPendingCancellation(null);
        }}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>Cancel Ride</Text>
            <Text style={styles.confirmMessage}>
              This will cancel your confirmed ride. Are you sure?
            </Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmKeep]}
                onPress={() => {
                  setShowCancelConfirm(false);
                  setPendingCancellation(null);
                }}
              >
                <Text style={styles.confirmKeepText}>Keep Ride</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmCancel]}
                onPress={() => {
                  console.log('🔴 CANCEL RIDE BUTTON IN DIALOG CLICKED!');
                  executeCancellation();
                }}
              >
                <Text style={styles.confirmCancelText}>Cancel Ride</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Custom Delete Confirmation Modal ───────────────────────────────────── */}
      <Modal
        visible={showDeleteConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowDeleteConfirm(false);
          setPendingDeletion(null);
        }}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>Remove Ride</Text>
            <Text style={styles.confirmMessage}>
              Remove this ride from your schedule? This cannot be undone.
            </Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmKeep]}
                onPress={() => {
                  setShowDeleteConfirm(false);
                  setPendingDeletion(null);
                }}
              >
                <Text style={styles.confirmKeepText}>Keep Ride</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmCancel]}
                onPress={() => {
                  console.log('🔴 DELETE RIDE BUTTON IN DIALOG CLICKED!');
                  executeDelete();
                }}
              >
                <Text style={styles.confirmCancelText}>Remove Ride</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Day accordion section ────────────────────────────────────────────────────

function DaySection({
  day, isOpen, onToggle, hasAvailability, hasRides, children,
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
              {hasAvailability && <View style={[styles.dot, styles.dotGreen]} />}
              {hasRides && <View style={[styles.dot, styles.dotBlue]} />}
            </View>
          )}
        </View>
        <Ionicons
          name={isOpen ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={isOpen ? '#007AFF' : '#aeaeb2'}
        />
      </TouchableOpacity>

      {isOpen && <View style={styles.dayBody}>{children}</View>}
    </View>
  );
}

// ─── Driver day content ───────────────────────────────────────────────────────

function DriverDayContent({
  availabilityBlocks, rides, otherUsers, onRideTap, onDeleteBlock,
}: {
  availabilityBlocks: ScheduleBlockWithId[];
  rides: RideRequestWithId[];
  otherUsers: Record<string, User>;
  onRideTap: (r: RideRequestWithId) => void;
  onDeleteBlock: (id: string) => void;
}) {
  // Rider asked the driver → driver must respond
  const riderInitiated = rides.filter(r => r.status === 'pending' && r.initiatedBy !== 'driver');
  // Driver asked the rider → waiting for rider to respond
  const driverInitiated = rides.filter(r => r.status === 'pending' && r.initiatedBy === 'driver');
  const confirmed = rides.filter(r => r.status === 'confirmed');

  const RideRow = ({ ride }: { ride: RideRequestWithId }) => {
    const isPending = ride.status === 'pending';
    const isAwaiting = isPending && ride.initiatedBy === 'driver';
    const riderName = otherUsers[ride.riderId]?.name ?? 'Rider';
    return (
      <TouchableOpacity
        style={[styles.rideRow, isPending ? styles.rideRowPending : styles.rideRowConfirmed]}
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
          <View style={[styles.statusPill, isAwaiting ? styles.pillAwaiting : isPending ? styles.pillPending : styles.pillConfirmed]}>
            <Text style={styles.statusPillText}>
              {isAwaiting ? 'Awaiting' : isPending ? 'Pending' : 'Confirmed'}
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
        availabilityBlocks.map(block => (
          <View key={block.id} style={styles.availRow}>
            <View style={styles.availDot} />
            <Text style={styles.availText}>
              {format12h(block.startTime)} – {format12h(block.endTime)}
            </Text>
            <TouchableOpacity onPress={() => onDeleteBlock(block.id)} style={styles.availDelete}>
              <Ionicons name="close-circle" size={18} color="#c7c7cc" />
            </TouchableOpacity>
          </View>
        ))
      )}

      {/* Ride Requests — rider asked, driver responds */}
      <Text style={[styles.sectionLabel, { marginTop: 20 }]}>RIDE REQUESTS</Text>
      {riderInitiated.length === 0 ? (
        <Text style={styles.emptyNote}>No pending ride requests</Text>
      ) : (
        riderInitiated.map(ride => <RideRow key={ride.id} ride={ride} />)
      )}

      {/* Awaiting Response — driver asked, waiting for rider */}
      {driverInitiated.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { marginTop: 20 }]}>AWAITING RESPONSE</Text>
          {driverInitiated.map(ride => <RideRow key={ride.id} ride={ride} />)}
        </>
      )}

      {/* Confirmed rides */}
      {confirmed.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { marginTop: 20 }]}>SCHEDULED RIDES</Text>
          {confirmed.map(ride => <RideRow key={ride.id} ride={ride} />)}
        </>
      )}
    </View>
  );
}

// ─── Rider day content ────────────────────────────────────────────────────────

function RiderDayContent({
  rides, incomingRequests, confirmedRequests, requestDrivers, onRideTap, onIncomingTap,
}: {
  rides: RiderRideWithId[];
  incomingRequests: RideRequestWithId[];
  confirmedRequests: RideRequestWithId[];
  requestDrivers: Record<string, User>;
  onRideTap: (r: RiderRideWithId) => void;
  onIncomingTap: (r: RideRequestWithId) => void;
}) {
  if (rides.length === 0) {
    return <Text style={styles.emptyNote}>No rides scheduled for this day</Text>;
  }
  return (
    <View style={{ gap: 10 }}>
      {rides.map(ride => {
        const pendingForRide = incomingRequests.filter(r => r.riderRideId === ride.id);
        const isConfirmed = confirmedRequests.some(r => r.riderRideId === ride.id);
        return (
          <TouchableOpacity
            key={ride.id}
            style={[styles.riderRideCard, isConfirmed && styles.riderRideCardConfirmed]}
            onPress={() => {
              onRideTap(ride);
            }}
            activeOpacity={0.75}
          >
            <View style={styles.riderRideCardRow}>
              <View style={styles.routeViz}>
                <View style={styles.routeDotGreen} />
                <View style={styles.routeVizLine} />
                <Ionicons name="location" size={14} color="#FF3B30" />
              </View>
              <View style={styles.routeInfo}>
                <Text style={styles.routeAddr} numberOfLines={1}>{ride.pickupAddress}</Text>
                <View style={styles.routeTimeBadge}>
                  <Ionicons name="time-outline" size={12} color="#8e8e93" />
                  <Text style={styles.routeTimeTxt}>
                    {format12h(ride.departureTime)}
                    {ride.estimatedDurationMinutes != null
                      ? `  ·  ${formatDriveTime(ride.estimatedDurationMinutes)}`
                      : ''}
                  </Text>
                </View>
                <Text style={styles.routeAddr} numberOfLines={1}>{ride.dropoffAddress}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                {isConfirmed && (
                  <Ionicons name="checkmark-circle" size={18} color="#34C759" />
                )}
                <Ionicons name="chevron-forward" size={16} color="#c7c7cc" />
              </View>
            </View>

            {/* Incoming driver match requests for this ride */}
            {pendingForRide.map(req => {
              const driverName = requestDrivers[req.driverId]?.name ?? 'A driver';
              return (
                <TouchableOpacity
                  key={req.id}
                  style={styles.incomingRequestBanner}
                  onPress={(e) => { e.stopPropagation?.(); onIncomingTap(req); }}
                  activeOpacity={0.8}
                >
                  <View style={styles.incomingRequestLeft}>
                    <Ionicons name="car" size={14} color="#007AFF" />
                    <Text style={styles.incomingRequestText} numberOfLines={1}>
                      {driverName} wants to drive this ride
                    </Text>
                  </View>
                  <View style={styles.incomingRequestAction}>
                    <Text style={styles.incomingRequestActionText}>Respond</Text>
                    <Ionicons name="chevron-forward" size={13} color="#007AFF" />
                  </View>
                </TouchableOpacity>
              );
            })}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Address autocomplete ─────────────────────────────────────────────────────

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
}

function formatSuggestionLabel(item: NominatimResult): string {
  const addr = item.address ?? {};
  const street = [addr.house_number, addr.road].filter(Boolean).join(' ');
  const city = addr.city || addr.town || addr.village || addr.suburb || '';
  const state = addr.state || '';
  const parts = [street, city, state].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : item.display_name;
}

function AddressInput({
  label, value, placeholder, returnKeyType, onChangeText, onSelect,
}: {
  label: string;
  value: string;
  placeholder?: string;
  returnKeyType?: 'next' | 'done';
  onChangeText: (text: string) => void;
  onSelect: (address: string, lat: number, lng: number) => void;
}) {
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [fetching, setFetching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = async (q: string) => {
    if (q.trim().length < 4) { setSuggestions([]); return; }
    setFetching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1`,
        { headers: { 'Accept-Language': 'en', 'User-Agent': 'HuberApp/1.0' } },
      );
      const data = await res.json();
      setSuggestions(Array.isArray(data) ? data : []);
    } catch { setSuggestions([]); }
    finally { setFetching(false); }
  };

  const handleChange = (text: string) => {
    onChangeText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(text), 400);
  };

  const handleSelect = (item: NominatimResult) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onSelect(formatSuggestionLabel(item), parseFloat(item.lat), parseFloat(item.lon));
    setSuggestions([]);
  };

  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.addressInputRow}>
        <TextInput
          style={[styles.textInput, styles.addressTextInput]}
          value={value}
          onChangeText={handleChange}
          placeholder={placeholder}
          placeholderTextColor="#bbb"
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType={returnKeyType}
        />
        {fetching && <ActivityIndicator size="small" color="#007AFF" style={styles.addressSpinner} />}
      </View>
      {suggestions.length > 0 && (
        <View style={styles.suggestionsList}>
          {suggestions.map((item, idx) => (
            <TouchableOpacity
              key={idx}
              style={[styles.suggestionItem, idx === suggestions.length - 1 && styles.suggestionItemLast]}
              onPress={() => handleSelect(item)}
            >
              <Ionicons name="location-outline" size={15} color="#007AFF" />
              <Text style={styles.suggestionText} numberOfLines={2}>
                {formatSuggestionLabel(item)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Form components ──────────────────────────────────────────────────────────

function DayPicker({ selected, onToggle }: { selected: string[]; onToggle: (d: string) => void }) {
  return (
    <View style={styles.daysRow}>
      {DAYS.map(d => (
        <TouchableOpacity
          key={d}
          style={[styles.dayChip, selected.includes(d) && styles.dayChipSelected]}
          onPress={() => onToggle(d)}
        >
          <Text style={[styles.dayChipText, selected.includes(d) && styles.dayChipTextSelected]}>{d}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function TimeDropdown({
  label, value, show, onToggle, onSelect,
}: {
  label: string; value: string; show: boolean;
  onToggle: () => void; onSelect: (t: string) => void;
}) {
  return (
    <>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity style={styles.dropdown} onPress={onToggle}>
        <Text style={styles.dropdownText}>{format12h(value)}</Text>
        <Ionicons name="chevron-down" size={18} color="#666" />
      </TouchableOpacity>
      {show && (
        <ScrollView style={styles.dropdownMenu} nestedScrollEnabled>
          {TIME_OPTIONS.map(t => (
            <TouchableOpacity key={t} style={styles.dropdownItem} onPress={() => onSelect(t)}>
              <Text style={styles.dropdownItemText}>{format12h(t)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </>
  );
}

function RiderForm({
  pickup, dropoff, departureTime, setDepartureTime, days,
  showDepartureDropdown, setShowDepartureDropdown, onToggleDay,
  onPickupChange, onPickupSelect, onDropoffChange, onDropoffSelect,
}: {
  pickup: string; dropoff: string;
  departureTime: string; setDepartureTime: (v: string) => void;
  days: string[];
  showDepartureDropdown: boolean; setShowDepartureDropdown: (v: boolean) => void;
  onToggleDay: (d: string) => void;
  onPickupChange: (text: string) => void;
  onPickupSelect: (address: string, lat: number, lng: number) => void;
  onDropoffChange: (text: string) => void;
  onDropoffSelect: (address: string, lat: number, lng: number) => void;
}) {
  return (
    <>
      <AddressInput
        label="Pickup Address" value={pickup} returnKeyType="next"
        placeholder="e.g. 123 Sesame Street, New York"
        onChangeText={onPickupChange} onSelect={onPickupSelect}
      />
      <AddressInput
        label="Dropoff Address" value={dropoff} returnKeyType="done"
        placeholder="e.g. 456 Allen Blvd, New York"
        onChangeText={onDropoffChange} onSelect={onDropoffSelect}
      />
      <TimeDropdown
        label="Departure Time" value={departureTime}
        show={showDepartureDropdown}
        onToggle={() => setShowDepartureDropdown(!showDepartureDropdown)}
        onSelect={(t) => { setDepartureTime(t); setShowDepartureDropdown(false); }}
      />
      <Text style={styles.fieldLabel}>Days of the Week</Text>
      <DayPicker selected={days} onToggle={onToggleDay} />
    </>
  );
}

function DriverForm({
  days, startTime, setStartTime, endTime, setEndTime,
  showStartDropdown, setShowStartDropdown, showEndDropdown, setShowEndDropdown, onToggleDay,
}: {
  days: string[];
  startTime: string; setStartTime: (v: string) => void;
  endTime: string; setEndTime: (v: string) => void;
  showStartDropdown: boolean; setShowStartDropdown: (v: boolean) => void;
  showEndDropdown: boolean; setShowEndDropdown: (v: boolean) => void;
  onToggleDay: (d: string) => void;
}) {
  return (
    <>
      <Text style={styles.fieldLabel}>Days of the Week</Text>
      <DayPicker selected={days} onToggle={onToggleDay} />
      <TimeDropdown
        label="Available From" value={startTime} show={showStartDropdown}
        onToggle={() => setShowStartDropdown(!showStartDropdown)}
        onSelect={(t) => { setStartTime(t); setShowStartDropdown(false); }}
      />
      <TimeDropdown
        label="Available Until" value={endTime} show={showEndDropdown}
        onToggle={() => setShowEndDropdown(!showEndDropdown)}
        onSelect={(t) => { setEndTime(t); setShowEndDropdown(false); }}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // ── Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e5ea',
  },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#1c1c1e' },
  addButton: {
    backgroundColor: '#007AFF', width: 36, height: 36,
    borderRadius: 18, alignItems: 'center', justifyContent: 'center',
  },

  // ── List
  listContent: { padding: 16, paddingBottom: 48 },

  // ── Day accordion
  daySection: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
    overflow: 'hidden',
  },
  daySectionOpen: {
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  dayHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 16,
  },
  dayHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayName: { fontSize: 16, fontWeight: '600', color: '#1c1c1e' },
  dayNameOpen: { color: '#007AFF' },
  dotRow: { flexDirection: 'row', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotGreen: { backgroundColor: '#34C759' },
  dotBlue: { backgroundColor: '#007AFF' },
  dayBody: {
    paddingHorizontal: 18, paddingBottom: 18,
    borderTopWidth: 1, borderTopColor: '#f2f2f7',
    paddingTop: 16,
  },

  // ── Section labels
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#8e8e93',
    letterSpacing: 0.6, marginBottom: 10,
  },
  emptyNote: {
    fontSize: 13, color: '#aeaeb2', fontStyle: 'italic', marginBottom: 4,
  },

  // ── Availability row (driver)
  availRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#f0fdf4', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    marginBottom: 8, borderWidth: 1, borderColor: '#bbf7d0',
  },
  availDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: '#34C759',
  },
  availText: { flex: 1, fontSize: 14, fontWeight: '500', color: '#16a34a' },
  availDelete: { padding: 2 },

  // ── Ride row (driver)
  rideRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 8, borderWidth: 1,
  },
  rideRowPending: { backgroundColor: '#fff8f0', borderColor: '#fdd9a0' },
  rideRowConfirmed: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  rideRowLeft: { flex: 1, gap: 2 },
  rideRowName: { fontSize: 14, fontWeight: '600', color: '#1c1c1e' },
  rideRowTime: { fontSize: 12, color: '#636366' },
  rideRowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusPill: {
    borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3,
  },
  pillPending: { backgroundColor: '#FF9500' },
  pillAwaiting: { backgroundColor: '#8e8e93' },
  pillConfirmed: { backgroundColor: '#007AFF' },
  statusPillText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // ── Rider ride card
  riderRideCard: {
    backgroundColor: '#f9f9fb',
    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e5e5ea',
  },
  riderRideCardConfirmed: {
    backgroundColor: '#f0fdf4', borderColor: '#bbf7d0',
  },
  riderRideCardRow: {
    flexDirection: 'row', alignItems: 'flex-start',
  },
  routeViz: { alignItems: 'center', marginRight: 12, paddingTop: 2, gap: 3 },
  routeDotGreen: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: '#34C759',
  },
  routeVizLine: { width: 2, height: 18, backgroundColor: '#d1d1d6', marginVertical: 2 },
  routeInfo: { flex: 1, gap: 4 },
  routeAddr: { fontSize: 14, fontWeight: '500', color: '#1c1c1e' },
  routeTimeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginVertical: 2 },
  routeTimeTxt: { fontSize: 12, color: '#8e8e93' },
  riderRideDelete: { padding: 4, marginLeft: 6 },
  incomingRequestBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
    marginTop: 10, borderWidth: 1, borderColor: '#bfdbfe',
  },
  incomingRequestLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  incomingRequestText: { fontSize: 13, color: '#1d4ed8', fontWeight: '500', flex: 1 },
  incomingRequestAction: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 8 },
  incomingRequestActionText: { fontSize: 13, color: '#007AFF', fontWeight: '600' },

  // ── Modals
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingBottom: 20, paddingTop: 12, maxHeight: '88%',
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#d1d1d6',
    alignSelf: 'center', marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 20,
  },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#1c1c1e' },

  // ── Ride detail
  detailRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginBottom: 14,
  },
  detailText: { fontSize: 15, color: '#1c1c1e' },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  denyButton: {
    flex: 1, backgroundColor: '#FF3B30', borderRadius: 12,
    padding: 14, alignItems: 'center',
  },
  acceptButton: {
    flex: 1, backgroundColor: '#34C759', borderRadius: 12,
    padding: 14, alignItems: 'center',
  },
  actionDisabled: { opacity: 0.6 },
  actionText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  confirmedBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: 20, gap: 8,
  },
  confirmedText: { fontSize: 16, fontWeight: '600', color: '#34C759' },
  viewProfileButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 16, paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: 12, borderWidth: 1.5, borderColor: '#007AFF',
    backgroundColor: '#EFF6FF',
  },
  viewProfileText: { fontSize: 15, fontWeight: '600', color: '#007AFF' },

  // ── Form
  fieldLabel: {
    fontSize: 13, fontWeight: '600', color: '#3c3c43', marginBottom: 6, marginTop: 16,
  },
  textInput: {
    backgroundColor: '#f2f2f7', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#1c1c1e', borderWidth: 1, borderColor: '#e5e5ea',
  },
  addressInputRow: { flexDirection: 'row', alignItems: 'center' },
  addressTextInput: { flex: 1 },
  addressSpinner: { position: 'absolute', right: 12 },
  suggestionsList: {
    marginTop: 4, backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1, borderColor: '#e5e5ea', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  suggestionItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingVertical: 11, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: '#f2f2f7',
  },
  suggestionItemLast: { borderBottomWidth: 0 },
  suggestionText: { flex: 1, fontSize: 14, color: '#1c1c1e', lineHeight: 19 },
  dropdown: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#f2f2f7', borderWidth: 1, borderColor: '#e5e5ea',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
  },
  dropdownText: { fontSize: 15, color: '#1c1c1e', flex: 1 },
  dropdownMenu: {
    maxHeight: 180, backgroundColor: '#fff', borderWidth: 1,
    borderColor: '#e5e5ea', borderRadius: 10, marginTop: 4, overflow: 'hidden',
  },
  dropdownItem: {
    paddingVertical: 11, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: '#f2f2f7',
  },
  dropdownItemText: { fontSize: 14, color: '#1c1c1e' },
  daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  dayChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#f2f2f7', borderWidth: 1.5, borderColor: '#e5e5ea',
  },
  dayChipSelected: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  dayChipText: { fontSize: 13, fontWeight: '600', color: '#636366' },
  dayChipTextSelected: { color: '#fff' },
  submitButton: {
    flexDirection: 'row', backgroundColor: '#007AFF', borderRadius: 14,
    padding: 16, alignItems: 'center', justifyContent: 'center',
    marginTop: 28, gap: 8,
  },
  submitButtonDisabled: { opacity: 0.55 },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // ── Custom Confirmation Modal
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  confirmBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1c1c1e',
    marginBottom: 12,
    textAlign: 'center',
  },
  confirmMessage: {
    fontSize: 16,
    color: '#636366',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 22,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmKeep: {
    backgroundColor: '#f2f2f7',
    borderWidth: 1,
    borderColor: '#e5e5ea',
  },
  confirmKeepText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  confirmCancel: {
    backgroundColor: '#FF3B30',
  },
  confirmCancelText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
