import { useAuth } from '@/context/AuthContext';
import { getOrCreateConversation } from '@/services/messagingService';
import { createNotification } from '@/services/notificationService';
import { createRideRequest } from '@/services/rideRequestService';
import { calculateDriveTime, formatDriveTime } from '@/utils/driveTime';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GeoPoint, doc, getDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  TouchableOpacity,
  View,
} from 'react-native';
import { db } from '../config/firebase';

interface AddressSuggestion {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

interface ResolvedLocation {
  text: string;
  lat: number;
  lng: number;
}

interface TimeSlot {
  day: string;
  time: string;
  available: boolean;
}

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

/** Returns only the time slots where both schedules are available, trimmed to the range used. */
function getOverlapTimes(scheduleA: TimeSlot[], scheduleB: TimeSlot[]): string[] {
  const setA = new Set(scheduleA.filter(s => s.available).map(s => `${s.day}-${s.time}`));
  const setB = new Set(scheduleB.filter(s => s.available).map(s => `${s.day}-${s.time}`));
  const overlap = new Set([...setA].filter(k => setB.has(k)));
  if (overlap.size === 0) return [];
  return TIME_SLOTS.filter(t =>
    DAYS_OF_WEEK.some(d => overlap.has(`${d}-${t}`))
  );
}

export default function DriverDetailsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams();

  const driverId = params.id as string;
  const driverName = params.name as string || 'Driver';
  const rating = parseFloat(params.rating as string) || 0;
  const totalRides = parseInt(params.totalRides as string) || 0;
  const bio = params.bio as string || '';
  const distance = params.distance as string || '';
  const score = params.score as string || '';
  const scheduleOverlap = params.scheduleOverlap as string || '';

  const [driverSchedule, setDriverSchedule] = useState<TimeSlot[]>([]);
  const [mySchedule, setMySchedule] = useState<TimeSlot[]>([]);
  const [overlapTimes, setOverlapTimes] = useState<string[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(true);

  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [sideBoxVisible, setSideBoxVisible] = useState(false);
  const [pickup, setPickup] = useState<ResolvedLocation | null>(null);
  const [dropoff, setDropoff] = useState<ResolvedLocation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [estimatedDriveTime, setEstimatedDriveTime] = useState<number | null>(null);
  const [calculatingDriveTime, setCalculatingDriveTime] = useState(false);

  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [actionMenuMessage, setActionMenuMessage] = useState('');
  const closeMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Address lookup modal state
  const [addressModalVisible, setAddressModalVisible] = useState(false);
  const [addressModalTarget, setAddressModalTarget] = useState<'pickup' | 'dropoff'>('pickup');
  const [addressQuery, setAddressQuery] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openAddressModal = (target: 'pickup' | 'dropoff') => {
    setAddressModalTarget(target);
    setAddressQuery('');
    setAddressSuggestions([]);
    setAddressModalVisible(true);
  };

  const onAddressQueryChange = useCallback((text: string) => {
    setAddressQuery(text);
    setAddressSuggestions([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 3) return;

    debounceRef.current = setTimeout(async () => {
      setAddressLoading(true);
      try {
        const encoded = encodeURIComponent(text.trim());
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&addressdetails=1&limit=6`,
          { headers: { 'Accept-Language': 'en', 'User-Agent': 'HuberApp/1.0' } },
        );
        const data: AddressSuggestion[] = await res.json();
        setAddressSuggestions(data);
      } catch {
        // ignore
      } finally {
        setAddressLoading(false);
      }
    }, 400);
  }, []);

  const selectSuggestion = (s: AddressSuggestion) => {
    const resolved: ResolvedLocation = {
      text: s.display_name,
      lat: parseFloat(s.lat),
      lng: parseFloat(s.lon),
    };
    if (addressModalTarget === 'pickup') setPickup(resolved);
    else setDropoff(resolved);
    setAddressModalVisible(false);
  };

  useEffect(() => {
    loadSchedules();
  }, [driverId, user]);

  useEffect(() => {
    return () => {
      if (closeMenuTimerRef.current) clearTimeout(closeMenuTimerRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    const calculateEstimate = async () => {
      if (!pickup || !dropoff) {
        setEstimatedDriveTime(null);
        return;
      }

      setCalculatingDriveTime(true);
      try {
        const driveTime = await calculateDriveTime(
          { latitude: pickup.lat, longitude: pickup.lng },
          { latitude: dropoff.lat, longitude: dropoff.lng }
        );
        setEstimatedDriveTime(driveTime);
      } catch {
        setEstimatedDriveTime(null);
      } finally {
        setCalculatingDriveTime(false);
      }
    };

    calculateEstimate();
  }, [pickup, dropoff]);

  const loadSchedules = async () => {
    if (!driverId || !user) return;
    setLoadingSchedule(true);
    try {
      const [driverSnap, mySnap] = await Promise.all([
        getDoc(doc(db, 'users', driverId)),
        getDoc(doc(db, 'users', user.uid)),
      ]);
      const driverSched: TimeSlot[] = driverSnap.exists() ? (driverSnap.data().schedule ?? []) : [];
      const mySched: TimeSlot[] = mySnap.exists() ? (mySnap.data().schedule ?? []) : [];
      setDriverSchedule(driverSched);
      setMySchedule(mySched);
      setOverlapTimes(getOverlapTimes(driverSched, mySched));
    } catch {
    } finally {
      setLoadingSchedule(false);
    }
  };

  const getSlot = (day: string, time: string): TimeSlot | undefined => {
    const driverAvail = driverSchedule.find(s => s.day === day && s.time === time)?.available ?? false;
    const myAvail = mySchedule.find(s => s.day === day && s.time === time)?.available ?? false;
    return { day, time, available: driverAvail && myAvail };
  };

  const handleSlotPress = (slot: TimeSlot) => {
    if (!slot.available) {
      return;
    }
    setSelectedSlot(slot);
    setSideBoxVisible(true);
  };

  const scheduleMenuClose = () => {
    if (closeMenuTimerRef.current) clearTimeout(closeMenuTimerRef.current);
    closeMenuTimerRef.current = setTimeout(() => {
      setActionMenuOpen(false);
      setActionMenuMessage('');
    }, 1500);
  };

  const handleFavorite = () => {
    const id = typeof driverId === 'string' && driverId.trim().length > 0 ? driverId : null;
    setActionMenuMessage(
      id ? 'Favorite is not connected yet.' : 'Unable to complete action because this user is missing an ID.',
    );
    scheduleMenuClose();
  };

  const handleBlock = () => {
    const id = typeof driverId === 'string' && driverId.trim().length > 0 ? driverId : null;
    setActionMenuMessage(
      id ? 'Block is not connected yet.' : 'Unable to complete action because this user is missing an ID.',
    );
    scheduleMenuClose();
  };

  const handleRequestRide = async () => {
    if (!selectedSlot || !user || !driverId) return;
    if (!pickup || !dropoff) {
      return;
    }

    setSubmitting(true);
    try {
      const timeIndex = TIME_SLOTS.indexOf(selectedSlot.time);
      const endIndex = Math.min(timeIndex + 4, TIME_SLOTS.length - 1);
      const requestedStart = to24Hour(selectedSlot.time);
      const requestedEnd = to24Hour(TIME_SLOTS[endIndex]);
      const rideDate = getNextDateForDay(selectedSlot.day);

      const requestId = await createRideRequest({
        scheduleBlockId: `${driverId}_${selectedSlot.day}_${selectedSlot.time}`,
        driverId,
        riderId: user.uid,
        requestedStart,
        requestedEnd,
        date: rideDate,
        pickupLocation: new GeoPoint(pickup.lat, pickup.lng),
        dropoffLocation: new GeoPoint(dropoff.lat, dropoff.lng),
        repeating: false,
        repeatDays: null,
        repeatEndsAt: null,
        seriesId: null,
      });

      await createNotification(
        driverId,
        'ride_requested',
        requestId,
        `You have a new ride request from ${user.displayName || 'a rider'} for ${selectedSlot.day} at ${selectedSlot.time}.`,
      );

      setSideBoxVisible(false);
      setPickup(null);
      setDropoff(null);
      setSelectedSlot(null);
    } catch (e: any) {
    } finally {
      setSubmitting(false);
    }
  };

  const handleMessage = async () => {
    if (!user) {
      return;
    }
    try {
      const { conversationId, isPending } = await getOrCreateConversation(user.uid, driverId);
      router.push({
        pathname: '/conversation/[id]',
        params: { id: conversationId, otherUserId: driverId, pending: isPending ? 'true' : 'false' },
      });
    } catch {
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Driver Profile</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.cardMenuButton}
            onPress={() => {
              setActionMenuMessage('');
              setActionMenuOpen(prev => !prev);
            }}
            accessibilityRole="button"
            accessibilityLabel="Open profile actions"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="ellipsis-vertical" size={18} color="#666" />
          </TouchableOpacity>

          {actionMenuOpen ? (
            <View style={styles.cardActionMenu}>
              <Pressable
                style={({ pressed }) => [
                  styles.cardActionMenuItem,
                  pressed && styles.cardActionMenuItemPressed,
                ]}
                onPress={handleFavorite}
              >
                <Text style={styles.cardActionMenuText}>Favorite</Text>
              </Pressable>
              <View style={styles.cardActionMenuDivider} />
              <Pressable
                style={({ pressed }) => [
                  styles.cardActionMenuItem,
                  pressed && styles.cardActionMenuItemPressed,
                ]}
                onPress={handleBlock}
              >
                <Text style={styles.cardActionMenuText}>Block</Text>
              </Pressable>
              {actionMenuMessage ? (
                <>
                  <View style={styles.cardActionMenuDivider} />
                  <Text style={styles.cardActionMenuMessage}>{actionMenuMessage}</Text>
                </>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView>
        <View style={styles.profileSection}>
          <View style={styles.avatarLarge}>
            <Ionicons name="person" size={48} color="#999" />
          </View>

          <Text style={styles.driverName}>{driverName}</Text>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="star" size={18} color="#FFB800" />
              <Text style={styles.statValue}>{rating.toFixed(1)}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="car" size={18} color="#666" />
              <Text style={styles.statValue}>{totalRides} rides</Text>
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

          {scheduleOverlap ? (
            <View style={styles.overlapBadge}>
              <Ionicons name="time" size={14} color="#34C759" />
              <Text style={styles.overlapBadgeText}>{scheduleOverlap}% schedule overlap</Text>
            </View>
          ) : null}

          {bio ? <Text style={styles.bioText}>{bio}</Text> : null}

          <TouchableOpacity style={styles.messageButton} onPress={handleMessage}>
            <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
            <Text style={styles.messageButtonText}>Message</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.scheduleSection}>
          <Text style={styles.sectionTitle}>Shared Availability</Text>
          <Text style={styles.sectionSubtitle}>
            {overlapTimes.length > 0
              ? 'Green slots are times you both are available — tap one to request a ride'
              : 'No overlapping availability found. Update your schedule to find common times.'}
          </Text>

          {loadingSchedule ? (
            <ActivityIndicator color="#007AFF" style={{ marginVertical: 24 }} />
          ) : (
            <View style={styles.scheduleRow}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.scheduleScroll}
              >
                <View style={styles.scheduleGrid}>
                  <View style={styles.timeColumn}>
                    <View style={styles.dayHeaderCell} />
                    {overlapTimes.map(time => (
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
                      {overlapTimes.map(time => {
                        const slot = getSlot(day, time);
                        const isSelected = selectedSlot?.day === day && selectedSlot?.time === time;
                        return (
                          <TouchableOpacity
                            key={`${day}-${time}`}
                            style={[
                              styles.slotCell,
                              slot?.available ? styles.slotAvailable : styles.slotUnavailable,
                              isSelected && styles.slotSelected,
                            ]}
                            onPress={() => slot && handleSlotPress(slot)}
                          >
                            {slot?.available ? (
                              <Ionicons name={isSelected ? 'checkmark-circle' : 'checkmark'} size={16} color="#34C759" />
                            ) : (
                              <Ionicons name="close" size={14} color="#ccc" />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </ScrollView>

              {sideBoxVisible && selectedSlot && (
                <View style={styles.sideBox}>
                  <View style={styles.sideBoxHeader}>
                    <Text style={styles.sideBoxTitle} numberOfLines={2}>
                      {selectedSlot.day} · {selectedSlot.time}
                    </Text>
                    <TouchableOpacity onPress={() => setSideBoxVisible(false)}>
                      <Ionicons name="close" size={20} color="#666" />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.sideLabel}>Pickup location</Text>
                  <TouchableOpacity
                    style={styles.locationPickerButton}
                    onPress={() => openAddressModal('pickup')}
                  >
                    <Ionicons name="location" size={14} color={pickup ? '#34C759' : '#999'} />
                    <Text
                      style={[styles.locationPickerText, pickup && styles.locationPickerTextSet]}
                      numberOfLines={2}
                    >
                      {pickup ? pickup.text : 'Tap to search address'}
                    </Text>
                  </TouchableOpacity>

                  <Text style={[styles.sideLabel, { marginTop: 8 }]}>Drop-off location</Text>
                  <TouchableOpacity
                    style={styles.locationPickerButton}
                    onPress={() => openAddressModal('dropoff')}
                  >
                    <Ionicons name="location" size={14} color={dropoff ? '#34C759' : '#999'} />
                    <Text
                      style={[styles.locationPickerText, dropoff && styles.locationPickerTextSet]}
                      numberOfLines={2}
                    >
                      {dropoff ? dropoff.text : 'Tap to search address'}
                    </Text>
                  </TouchableOpacity>

                  {pickup && dropoff && (
                    <View style={styles.driveTimeContainer}>
                      <Ionicons name="car-outline" size={14} color="#007AFF" />
                      <Text style={styles.driveTimeLabel}>Est. drive time:</Text>
                      {calculatingDriveTime ? (
                        <ActivityIndicator size="small" color="#007AFF" />
                      ) : (
                        <Text style={styles.driveTimeValue}>
                          {formatDriveTime(estimatedDriveTime)}
                        </Text>
                      )}
                    </View>
                  )}

                  <TouchableOpacity
                    style={[styles.requestButton, submitting && styles.requestButtonDisabled]}
                    onPress={handleRequestRide}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.requestButtonText}>Request ride</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {!loadingSchedule && overlapTimes.length > 0 && (
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendBox, styles.legendAvailable]} />
                <Text style={styles.legendText}>Both available</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendBox, styles.legendUnavailable]} />
                <Text style={styles.legendText}>Not available</Text>
              </View>
            </View>
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Address lookup modal */}
      <Modal
        visible={addressModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setAddressModalVisible(false)}
      >
        <View style={styles.addressModalOverlay}>
          <View style={styles.addressModalContent}>
            <View style={styles.addressModalHeader}>
              <Text style={styles.addressModalTitle}>
                {addressModalTarget === 'pickup' ? 'Pickup location' : 'Drop-off location'}
              </Text>
              <TouchableOpacity onPress={() => setAddressModalVisible(false)}>
                <Ionicons name="close" size={26} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={styles.addressSearchBar}>
              <Ionicons name="search" size={18} color="#999" />
              <TextInput
                style={styles.addressSearchInput}
                placeholder="Search for an address..."
                placeholderTextColor="#999"
                value={addressQuery}
                onChangeText={onAddressQueryChange}
                autoFocus
              />
              {addressLoading && <ActivityIndicator size="small" color="#007AFF" />}
            </View>

            <FlatList
              data={addressSuggestions}
              keyExtractor={item => String(item.place_id)}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                addressQuery.length >= 3 && !addressLoading ? (
                  <Text style={styles.addressEmptyText}>No results found</Text>
                ) : null
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.addressSuggestionItem}
                  onPress={() => selectSuggestion(item)}
                >
                  <Ionicons name="location-outline" size={18} color="#007AFF" />
                  <Text style={styles.addressSuggestionText} numberOfLines={2}>
                    {item.display_name}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Returns the "YYYY-MM-DD" of the next occurrence of a day name (e.g. "Mon"). If today is that day, returns today. */
function getNextDateForDay(dayName: string): string {
  const DAY_INDICES: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const targetDow = DAY_INDICES[dayName];
  const now = new Date();
  const currentDow = now.getDay();
  let daysAhead = targetDow - currentDow;
  if (daysAhead < 0) daysAhead += 7;
  const target = new Date(now);
  target.setDate(now.getDate() + daysAhead);
  return target.toISOString().slice(0, 10);
}

/** Converts "7:30 AM" → "07:30", "12:00 PM" → "12:00", "1:00 PM" → "13:00" */
function to24Hour(time12: string): string {
  const [timePart, period] = time12.split(' ');
  let [hours, minutes] = timePart.split(':').map(Number);
  if (period === 'AM') {
    if (hours === 12) hours = 0;
  } else {
    if (hours !== 12) hours += 12;
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
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
    position: 'relative',
    zIndex: 50,
    elevation: 10,
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
  headerRight: {
    width: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 60,
    elevation: 12,
  },
  cardMenuButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  cardActionMenu: {
    position: 'absolute',
    top: 34,
    right: 0,
    width: 160,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eaeaea',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 24,
    zIndex: 999,
  },
  cardActionMenuItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  cardActionMenuItemPressed: {
    backgroundColor: '#f5f5f5',
  },
  cardActionMenuText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  cardActionMenuDivider: {
    height: 1,
    backgroundColor: '#f0f0f0',
  },
  cardActionMenuMessage: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
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
  overlapBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 12,
    gap: 6,
  },
  overlapBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#34C759',
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
  scheduleSection: {
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
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  scheduleScroll: {
    flex: 1,
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
    height: 28,
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
    height: 28,
    width: 156,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
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
  slotSelected: {
    backgroundColor: '#d0f0db',
    borderColor: '#28a745',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
    gap: 20,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendBox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    marginRight: 6,
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
  legendText: {
    fontSize: 13,
    color: '#666',
  },
  sideBox: {
    width: 160,
    marginLeft: 8,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  sideBoxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 4,
  },
  sideBoxTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#333',
  },
  sideLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  locationPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    paddingHorizontal: 8,
    paddingVertical: 10,
    gap: 6,
  },
  locationPickerText: {
    flex: 1,
    fontSize: 11,
    color: '#999',
  },
  locationPickerTextSet: {
    color: '#333',
  },
  driveTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginTop: 8,
    gap: 6,
  },
  driveTimeLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#007AFF',
  },
  driveTimeValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#007AFF',
    marginLeft: 'auto',
  },
  requestButton: {
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    alignItems: 'center',
  },
  requestButtonDisabled: {
    opacity: 0.6,
  },
  requestButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  addressModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  addressModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  addressModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  addressModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  addressSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 12,
    gap: 8,
  },
  addressSearchInput: {
    flex: 1,
    fontSize: 15,
    color: '#333',
  },
  addressEmptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 14,
    paddingVertical: 24,
  },
  addressSuggestionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 10,
  },
  addressSuggestionText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
});
