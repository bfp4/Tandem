import { useAuth } from '@/context/AuthContext';
import { createNotification } from '@/services/notificationService';
import { confirmRideRequest, denyRideRequest } from '@/services/rideRequestService';
import { getUser } from '@/services/userService';
import type { RideRequest } from '@/types/rideRequest';
import type { User } from '@/types/user';
import { Ionicons } from '@expo/vector-icons';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { db } from '../../config/firebase';

interface TimeSlot {
  day: string;
  time: string;
  available: boolean;
}

interface RideRequestWithId extends RideRequest {
  id: string;
}

type SlotState = 'available' | 'unavailable' | 'requested' | 'booked';

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TIME_SLOTS = [
  '12:00 AM','12:15 AM','12:30 AM','12:45 AM',
  '1:00 AM','1:15 AM','1:30 AM','1:45 AM',
  '2:00 AM','2:15 AM','2:30 AM','2:45 AM',
  '3:00 AM','3:15 AM','3:30 AM','3:45 AM',
  '4:00 AM','4:15 AM','4:30 AM','4:45 AM',
  '5:00 AM','5:15 AM','5:30 AM','5:45 AM',
  '6:00 AM','6:15 AM','6:30 AM','6:45 AM',
  '7:00 AM','7:15 AM','7:30 AM','7:45 AM',
  '8:00 AM','8:15 AM','8:30 AM','8:45 AM',
  '9:00 AM','9:15 AM','9:30 AM','9:45 AM',
  '10:00 AM','10:15 AM','10:30 AM','10:45 AM',
  '11:00 AM','11:15 AM','11:30 AM','11:45 AM',
  '12:00 PM','12:15 PM','12:30 PM','12:45 PM',
  '1:00 PM','1:15 PM','1:30 PM','1:45 PM',
  '2:00 PM','2:15 PM','2:30 PM','2:45 PM',
  '3:00 PM','3:15 PM','3:30 PM','3:45 PM',
  '4:00 PM','4:15 PM','4:30 PM','4:45 PM',
  '5:00 PM','5:15 PM','5:30 PM','5:45 PM',
  '6:00 PM','6:15 PM','6:30 PM','6:45 PM',
  '7:00 PM','7:15 PM','7:30 PM','7:45 PM',
  '8:00 PM','8:15 PM','8:30 PM','8:45 PM',
  '9:00 PM','9:15 PM','9:30 PM','9:45 PM',
  '10:00 PM','10:15 PM','10:30 PM','10:45 PM',
  '11:00 PM','11:15 PM','11:30 PM','11:45 PM',
];

function buildEmptySchedule(): TimeSlot[] {
  const slots: TimeSlot[] = [];
  DAYS_OF_WEEK.forEach(day => {
    TIME_SLOTS.forEach(time => {
      slots.push({ day, time, available: false });
    });
  });
  return slots;
}

/** Converts "07:30" → index in TIME_SLOTS array, approximating the nearest slot. */
function timeStringToSlotLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const hours = h % 12 === 0 ? 12 : h % 12;
  const period = h < 12 ? 'AM' : 'PM';
  const minutes = String(m).padStart(2, '0');
  return `${hours}:${minutes} ${period}`;
}

export default function ScheduleScreen() {
  const { user } = useAuth();

  const [schedule, setSchedule] = useState<TimeSlot[]>(buildEmptySchedule);
  const [pendingRequests, setPendingRequests] = useState<RideRequestWithId[]>([]);
  const [confirmedRequests, setConfirmedRequests] = useState<RideRequestWithId[]>([]);
  const [otherUsers, setOtherUsers] = useState<Record<string, User>>({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actingOnRequest, setActingOnRequest] = useState<string | null>(null);

  const [selectedModal, setSelectedModal] = useState<{
    type: 'requested' | 'booked';
    request: RideRequestWithId;
  } | null>(null);

  useEffect(() => {
    loadAll();
  }, [user]);

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [userSnap, pendingSnap, confirmedSnap] = await Promise.all([
        getDoc(doc(db, 'users', user.uid)),
        getDocs(query(
          collection(db, 'rideRequests'),
          where('status', '==', 'pending'),
          where('driverId', '==', user.uid),
        )),
        getDocs(query(
          collection(db, 'rideRequests'),
          where('status', '==', 'confirmed'),
          where('driverId', '==', user.uid),
        )),
      ]);

      // Also load pending/confirmed where user is the rider
      const [pendingAsRiderSnap, confirmedAsRiderSnap] = await Promise.all([
        getDocs(query(
          collection(db, 'rideRequests'),
          where('status', '==', 'pending'),
          where('riderId', '==', user.uid),
        )),
        getDocs(query(
          collection(db, 'rideRequests'),
          where('status', '==', 'confirmed'),
          where('riderId', '==', user.uid),
        )),
      ]);

      if (userSnap.exists() && userSnap.data().schedule) {
        setSchedule(userSnap.data().schedule as TimeSlot[]);
      }

      const allPending: RideRequestWithId[] = [
        ...pendingSnap.docs.map(d => ({ ...(d.data() as RideRequest), id: d.id })),
        ...pendingAsRiderSnap.docs.map(d => ({ ...(d.data() as RideRequest), id: d.id })),
      ];
      const allConfirmed: RideRequestWithId[] = [
        ...confirmedSnap.docs.map(d => ({ ...(d.data() as RideRequest), id: d.id })),
        ...confirmedAsRiderSnap.docs.map(d => ({ ...(d.data() as RideRequest), id: d.id })),
      ];

      setPendingRequests(allPending);
      setConfirmedRequests(allConfirmed);

      // Pre-load other user profiles for display in modals
      const otherIds = new Set<string>();
      for (const r of [...allPending, ...allConfirmed]) {
        const otherId = r.driverId === user.uid ? r.riderId : r.driverId;
        otherIds.add(otherId);
      }
      const profiles: Record<string, User> = {};
      await Promise.all(
        [...otherIds].map(async id => {
          try {
            profiles[id] = await getUser(id);
          } catch {}
        })
      );
      setOtherUsers(profiles);
    } catch (e) {
      console.error('Error loading schedule data:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const handleSaveSchedule = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'users', user.uid), { schedule }, { merge: true });
      Alert.alert('Saved', 'Your availability has been saved.');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleSlot = (day: string, time: string) => {
    const state = getSlotState(day, time);
    if (state === 'requested' || state === 'booked') return;
    setSchedule(prev =>
      prev.map(s =>
        s.day === day && s.time === time ? { ...s, available: !s.available } : s
      )
    );
  };

  /** Determines which rideRequest (if any) covers a given day+time slot. */
  function getRequestForSlot(day: string, time: string): RideRequestWithId | null {
    const DAY_MAP: Record<number, string> = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };
    const timeIdx = TIME_SLOTS.indexOf(time);
    if (timeIdx === -1) return null;

    const allRequests = [...pendingRequests, ...confirmedRequests];
    for (const r of allRequests) {
      // Check if the day matches
      const requestDate = new Date(r.date + 'T00:00:00');
      const requestDay = DAY_MAP[requestDate.getDay()];
      if (requestDay !== day && !r.repeating) continue;

      // Check if the time falls within the requested window
      const startLabel = timeStringToSlotLabel(r.requestedStart);
      const endLabel = timeStringToSlotLabel(r.requestedEnd);
      const startIdx = TIME_SLOTS.indexOf(startLabel);
      const endIdx = TIME_SLOTS.indexOf(endLabel);

      if (startIdx === -1 || endIdx === -1) continue;
      if (timeIdx >= startIdx && timeIdx <= endIdx) return r;
    }
    return null;
  }

  function getSlotState(day: string, time: string): SlotState {
    // Check for requests first — a slot with a request should show as requested/booked
    // even if the base schedule doesn't show it as available on this user's side
    const req = getRequestForSlot(day, time);
    if (req) {
      if (req.status === 'pending') return 'requested';
      if (req.status === 'confirmed') return 'booked';
    }

    const base = schedule.find(s => s.day === day && s.time === time);
    if (!base?.available) return 'unavailable';
    return 'available';
  }

  const handleSlotPress = (day: string, time: string) => {
    const state = getSlotState(day, time);
    if (state === 'requested' || state === 'booked') {
      const req = getRequestForSlot(day, time);
      if (req) setSelectedModal({ type: state, request: req });
      return;
    }
    toggleSlot(day, time);
  };

  const handleAccept = async (requestId: string, riderId: string) => {
    setActingOnRequest(requestId);
    try {
      await confirmRideRequest(requestId);
      await createNotification(riderId, 'ride_confirmed', requestId, 'Your ride request has been accepted!');
      setSelectedModal(null);
      await loadAll();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not accept the request.');
    } finally {
      setActingOnRequest(null);
    }
  };

  const handleDeny = async (requestId: string, riderId: string) => {
    setActingOnRequest(requestId);
    try {
      await denyRideRequest(requestId);
      await createNotification(riderId, 'ride_denied', requestId, 'Your ride request was declined.');
      setSelectedModal(null);
      await loadAll();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not deny the request.');
    } finally {
      setActingOnRequest(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const pendingCount = pendingRequests.length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Schedule</Text>
        {pendingCount > 0 && (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>{pendingCount} pending</Text>
          </View>
        )}
      </View>

      <ScrollView>
        <View style={styles.scheduleSection}>
          <Text style={styles.scheduleTitle}>My Availability</Text>
          <Text style={styles.scheduleSubtitle}>
            Tap a slot to toggle availability. Orange = pending request. Blue = booked ride.
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.scheduleGrid}>
              <View style={styles.timeColumn}>
                <View style={styles.dayHeaderCell} />
                {TIME_SLOTS.map(time => (
                  <View key={time} style={styles.timeCell}>
                    <Text style={styles.timeText}>{time}</Text>
                  </View>
                ))}
              </View>

              {DAYS_OF_WEEK.map(day => (
                <View key={day} style={styles.dayColumn}>
                  <View style={styles.dayHeaderCell}>
                    <Text style={styles.dayHeaderText}>{day}</Text>
                  </View>
                  {TIME_SLOTS.map(time => {
                    const state = getSlotState(day, time);
                    return (
                      <TouchableOpacity
                        key={`${day}-${time}`}
                        style={[
                          styles.slotCell,
                          state === 'available' && styles.slotAvailable,
                          state === 'unavailable' && styles.slotUnavailable,
                          state === 'requested' && styles.slotRequested,
                          state === 'booked' && styles.slotBooked,
                        ]}
                        onPress={() => handleSlotPress(day, time)}
                      >
                        {state === 'available' && <Ionicons name="checkmark" size={14} color="#34C759" />}
                        {state === 'requested' && <Ionicons name="hourglass" size={14} color="#FF9500" />}
                        {state === 'booked' && <Ionicons name="car" size={14} color="#007AFF" />}
                        {state === 'unavailable' && <View style={styles.emptySlot} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>

          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendBox, styles.legendAvailable]} />
              <Text style={styles.legendText}>Available</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendBox, styles.legendUnavailable]} />
              <Text style={styles.legendText}>Unavailable</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendBox, styles.legendRequested]} />
              <Text style={styles.legendText}>Requested</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendBox, styles.legendBooked]} />
              <Text style={styles.legendText}>Booked</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSaveSchedule}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="save" size={20} color="#fff" />
                <Text style={styles.saveButtonText}>Save Schedule</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Request detail modal */}
      <Modal
        visible={selectedModal !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedModal && (() => {
              const req = selectedModal.request;
              const isDriver = req.driverId === user?.uid;
              const otherId = isDriver ? req.riderId : req.driverId;
              const otherUser = otherUsers[otherId];
              const startLabel = timeStringToSlotLabel(req.requestedStart);
              const endLabel = timeStringToSlotLabel(req.requestedEnd);

              return (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>
                      {selectedModal.type === 'requested' ? 'Ride Request' : 'Booked Ride'}
                    </Text>
                    <TouchableOpacity onPress={() => setSelectedModal(null)}>
                      <Ionicons name="close" size={26} color="#333" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.rideDetailRow}>
                    <Ionicons name="person-circle" size={20} color="#666" />
                    <Text style={styles.rideDetailText}>
                      {isDriver ? 'Rider' : 'Driver'}: {otherUser?.name ?? otherId}
                    </Text>
                  </View>
                  <View style={styles.rideDetailRow}>
                    <Ionicons name="calendar" size={20} color="#666" />
                    <Text style={styles.rideDetailText}>Date: {req.date}</Text>
                  </View>
                  <View style={styles.rideDetailRow}>
                    <Ionicons name="time" size={20} color="#666" />
                    <Text style={styles.rideDetailText}>{startLabel} – {endLabel}</Text>
                  </View>

                  {selectedModal.type === 'requested' && isDriver && (
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[styles.denyButton, actingOnRequest === req.id && styles.actionButtonDisabled]}
                        onPress={() => handleDeny(req.id, req.riderId)}
                        disabled={actingOnRequest === req.id}
                      >
                        {actingOnRequest === req.id ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={styles.actionButtonText}>Deny</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.acceptButton, actingOnRequest === req.id && styles.actionButtonDisabled]}
                        onPress={() => handleAccept(req.id, req.riderId)}
                        disabled={actingOnRequest === req.id}
                      >
                        {actingOnRequest === req.id ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={styles.actionButtonText}>Accept</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}

                  {selectedModal.type === 'requested' && !isDriver && (
                    <Text style={styles.pendingNote}>
                      Waiting for the driver to accept or deny your request.
                    </Text>
                  )}

                  {selectedModal.type === 'booked' && (
                    <View style={styles.bookedBadge}>
                      <Ionicons name="checkmark-circle" size={18} color="#34C759" />
                      <Text style={styles.bookedBadgeText}>Ride confirmed</Text>
                    </View>
                  )}
                </>
              );
            })()}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  pendingBadge: {
    backgroundColor: '#FF9500',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pendingBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  scheduleSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    margin: 16,
    padding: 16,
  },
  scheduleTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  scheduleSubtitle: {
    fontSize: 12,
    color: '#999',
    marginBottom: 16,
    lineHeight: 17,
  },
  scheduleGrid: {
    flexDirection: 'row',
  },
  timeColumn: {
    marginRight: 8,
  },
  dayColumn: {
    marginRight: 4,
  },
  dayHeaderCell: {
    height: 36,
    width: 66,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 4,
  },
  dayHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#333',
  },
  timeCell: {
    height: 16,
    width: 88,
    justifyContent: 'center',
    paddingRight: 8,
    marginBottom: 4,
  },
  timeText: {
    fontSize: 10,
    color: '#666',
    fontWeight: '500',
    textAlign: 'right',
  },
  slotCell: {
    height: 16,
    width: 156,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 5,
    marginBottom: 4,
    borderWidth: 1.5,
  },
  slotAvailable: {
    backgroundColor: '#e8f5e9',
    borderColor: '#34C759',
  },
  slotUnavailable: {
    backgroundColor: '#f5f5f5',
    borderColor: '#e0e0e0',
  },
  slotRequested: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FF9500',
  },
  slotBooked: {
    backgroundColor: '#EBF4FF',
    borderColor: '#007AFF',
  },
  emptySlot: {
    width: 12,
    height: 12,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 16,
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendBox: {
    width: 14,
    height: 14,
    borderRadius: 3,
    marginRight: 5,
    borderWidth: 1.5,
  },
  legendAvailable: {
    backgroundColor: '#e8f5e9',
    borderColor: '#34C759',
  },
  legendUnavailable: {
    backgroundColor: '#f5f5f5',
    borderColor: '#e0e0e0',
  },
  legendRequested: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FF9500',
  },
  legendBooked: {
    backgroundColor: '#EBF4FF',
    borderColor: '#007AFF',
  },
  legendText: {
    fontSize: 12,
    color: '#666',
  },
  saveButton: {
    flexDirection: 'row',
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    gap: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  rideDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  rideDetailText: {
    fontSize: 15,
    color: '#333',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  denyButton: {
    flex: 1,
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  acceptButton: {
    flex: 1,
    backgroundColor: '#34C759',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  pendingNote: {
    marginTop: 20,
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  bookedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    gap: 8,
  },
  bookedBadgeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#34C759',
  },
});
