import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Map from '../../components/Map';

const MOCK_CURRENT_USER = {
  uid: 'user_rider_01',
  name: 'Ari Huber',
  activeRole: 'rider',
  starRating: 4.5,
  rideCount: 10,
};

const MOCK_ACTIVE_RIDE_REQUEST= {
  riderId: 'user_rider_01',
  requestedStart: '14:30',
  requestedEnd: '14:45',
  date: '2026-03-22',
  pickupLocation: { latitude: 37.78825, longitude: -122.4324, address: '456 Mission St, Atlanta, GA' },
  dropoffLocation: { latitude: 37.79825, longitude: -122.4224, address: '123 Market Ave, Atlanta, GA' },
  status: 'confirmed',
  pricingSnapshot: {
    baseFare: 3.50,
    perMileRate: 2.80,
    calculatedDistance: 3.2,
    totalPrice: 12.46,
  },
};


const MOCK_ACTIVE_CONFIRMATION = {
  id: 'conf_abc123',
  rideRequestId: 'req_abc123',
  driverId: 'user_driver_01',
  riderId: 'user_rider_01',
  active: true,
  riderReady: false,
  driverReady: true,
  pickupConfirmed: false,
  status: 'waiting',
};

const MOCK_DRIVER = {
  uid: 'user_driver_01',
  name: 'John Smith',
  starRating: 4.9,
  rideCount: 234,
  phone: 'tel:+14155550100',
  profilePhoto: null,
  carDetails: {
    model: 'Toyota Camry',
    licensePlate: '7ABC123',
  },
};

const MOCK_NEXT_RIDE_REQUEST = {
  id: 'req_def456',
  driverId: 'user_driver_02',
  riderId: 'user_rider_01',
  requestedStart: '17:00',
  requestedEnd: '17:20',
  date: '2026-03-22',
  pickupLocation: { latitude: 37.7609, longitude: -122.435, address: '123 Market Ave, Atlanta, GA'},
  dropoffLocation: { latitude: 37.7648, longitude: -122.4215, address: '456 Mission St, Atlanta, GA' },
  status: 'confirmed',
  pricingSnapshot: {
    baseFare: 3.50,
    perMileRate: 2.80,
    calculatedDistance: 4.1,
    totalPrice: 15.00,
  },
};

const MOCK_NEXT_DRIVER = {
  uid: 'user_driver_02',
  name: 'Maria Garcia',
  starRating: 4.8,
  rideCount: 312,
  phone: 'tel:+14155550200',
  profilePhoto: null,
  carDetails: null,
};

const MOCK_LOCATIONS = {

};

//           Helper functions

function formatTime(hhMm) {
  if (!hhMm) return '';
  const [h, m] = hhMm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

function formatDist(miles) {
  return `${miles.toFixed(1)} mi`;
}

function estimateDuration(miles) {
  return Math.round(miles * 3.5 + 4);
}

function formatPrice(amount) {
  return `$${amount.toFixed(2)}`;
}

const INDIGO = '#6366F1';
const SURFACE = '#F9FAFB';
const BORDER = '#F0F0F5';
const TEXT_PRIMARY = '#111827';
const TEXT_SECONDARY = '#6B7280';
const TEXT_MUTED = '#9CA3AF';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E8EAF2' },
  modeLabel: { position: 'absolute', top: 56, left: 16, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 4, zIndex: 10 },
  modeDot: { width: 8, height: 8, borderRadius: 4 },
  modeLabelText: { fontSize: 12, fontWeight: '600', color: TEXT_SECONDARY },
  toggleBtn: { position: 'absolute', top: 56, right: 16, width: 42, height: 42, borderRadius: 21, backgroundColor: INDIGO, justifyContent: 'center', alignItems: 'center', shadowColor: INDIGO, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8, zIndex: 10 },
  rideCard: { position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '64%', backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28, shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.07, shadowRadius: 16, elevation: 14 },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 14 },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: INDIGO, marginBottom: 2 },
  panelTitle: { fontSize: 21, fontWeight: '800', color: TEXT_PRIMARY, letterSpacing: -0.4 },
  scheduleBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  scheduleBtnText: { fontSize: 12, fontWeight: '600', color: INDIGO },
  pillRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  pillIndigo: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  pillIndigoText: { fontSize: 11, fontWeight: '600', color: INDIGO },
  pillGray: { backgroundColor: SURFACE, borderWidth: 0.5, borderColor: BORDER, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  pillGrayText: { fontSize: 11, fontWeight: '500', color: TEXT_SECONDARY },
  dateBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  dateBadgeText: { fontSize: 13, fontWeight: '500', color: TEXT_SECONDARY },
  routeWrap: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  routeDots: { flexDirection: 'column', alignItems: 'center', paddingTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  routeLine: { width: 2, flex: 1, minHeight: 16, backgroundColor: BORDER, marginVertical: 3 },
  routeAddrs: { flex: 1, gap: 12 },
  routeLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1, color: TEXT_MUTED, marginBottom: 1, textTransform: 'uppercase' },
  routeAddr: { fontSize: 13, color: TEXT_PRIMARY, lineHeight: 18 },
  divider: { height: 0.5, backgroundColor: BORDER, marginVertical: 12 },
  sectionLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2, color: TEXT_MUTED, marginBottom: 8, textTransform: 'uppercase' },
  priceWrap: { backgroundColor: SURFACE, borderRadius: 12, borderWidth: 0.5, borderColor: BORDER, padding: 12, gap: 6 },
  priceItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceLabel: { fontSize: 12, color: TEXT_SECONDARY },
  priceValue: { fontSize: 13, fontWeight: '600', color: TEXT_PRIMARY },
  priceDivider: { height: 0.5, backgroundColor: BORDER },
  simpleFareRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: SURFACE, borderRadius: 10, borderWidth: 0.5, borderColor: BORDER, paddingHorizontal: 14, paddingVertical: 10 },
  simpleFareLabel: { fontSize: 13, color: TEXT_SECONDARY },
  simpleFareValue: { fontSize: 16, fontWeight: '800', color: '#059669' },
  detailsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 0.5, borderColor: BORDER, borderRadius: 12, paddingVertical: 12, marginTop: 10 },
  detailsBtnText: { fontSize: 14, fontWeight: '600', color: INDIGO },
  starsRow: { flexDirection: 'row', gap: 2 },
  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  driverCardCompact: { padding: 10 },
  avatar: {
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '600' },
  driverMeta: { flex: 1, marginLeft: 12 },
  driverName: { fontSize: 16, fontWeight: '600', color: '#111' },
  driverNameSm: { fontSize: 14 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  ratingNum: { fontSize: 12, color: '#111', fontWeight: '500' },
  ratingTotal: { fontSize: 12, color: '#6B7280' },
  ridesTogether: { fontSize: 11, color: '#6366F1', marginTop: 2 },
  carDetails: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  driverActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { padding: 6 },
  waitingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  waitingText: { fontSize: 13, color: '#6366F1' },
  confirmRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  confirmBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  confirmBadgeOn: { backgroundColor: '#D1FAE5' },
  confirmConnector: {
    flex: 1,
    height: 2,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 8,
  },
  confirmConnectorOn: { backgroundColor: '#34D399' },
  confirmLabel: { fontSize: 13, color: '#6B7280' },
  confirmLabelOn: { color: '#059669', fontWeight: '500' },
  otherSideBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  otherSideText: { fontSize: 12, color: '#6366F1' },
  allSetBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D1FAE5',
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  allSetText: { fontSize: 12, color: '#059669', fontWeight: '500' },
  readyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6366F1',
    padding: 14,
    borderRadius: 10,
  },
  readyBtnOn: { backgroundColor: '#34D399' },
  readyBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

// ─── Sub-components (simplified versions) ────────────────────────────────────

function StarRating({ rating }) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  return (
    <View style={styles.starsRow}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Ionicons
          key={i}
          name={i < full ? 'star' : half && i === full ? 'star-half' : 'star-outline'}
          size={12}
          color="#F5A623"
        />
      ))}
    </View>
  );
}

function DriverCard({ driver, ridesTogther = 0, compact = false }) {
  const callDriver = () => {
    if (driver.phone) Linking.openURL(driver.phone);
    else Alert.alert('No phone on file', `${driver.name} has not added a phone number.`);
  };
  const messageDriver = () => Alert.alert('Message', `Opening chat with ${driver.name}…`);
  const viewProfile = () => Alert.alert('Profile', `Navigating to ${driver.name}'s profile…`);

  return (
    <TouchableOpacity
      style={[styles.driverCard, compact && styles.driverCardCompact]}
      onPress={viewProfile}
      activeOpacity={0.85}
    >
      <View style={[styles.avatar, { width: compact ? 40 : 48, height: compact ? 40 : 48, borderRadius: compact ? 20 : 24 }]}>
        <Text style={[styles.avatarText, { fontSize: compact ? 14 : 17 }]}>
          {driver.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
        </Text>
      </View>
      <View style={styles.driverMeta}>
        <Text style={[styles.driverName, compact && styles.driverNameSm]}>{driver.name}</Text>
        <View style={styles.ratingRow}>
          <StarRating rating={driver.starRating} />
          <Text style={styles.ratingNum}>{driver.starRating.toFixed(1)}</Text>
          <Text style={styles.ratingTotal}>· {driver.rideCount} rides</Text>
        </View>
        {ridesTogther > 0 && (
          <Text style={styles.ridesTogether}>
            {ridesTogther} ride{ridesTogther !== 1 ? 's' : ''} together
          </Text>
        )}
        {driver.carDetails && (
          <Text style={styles.carDetails}>
            {driver.carDetails.model} · {driver.carDetails.licensePlate}
          </Text>
        )}
      </View>
      <View style={styles.driverActions}>
        <TouchableOpacity style={styles.iconBtn} onPress={callDriver}>
          <Ionicons name="call" size={17} color="#6366F1" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={messageDriver}>
          <Ionicons name="chatbubble-ellipses" size={16} color="#6366F1" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function ConfirmationStatus({ confirmation, onMarkReady, loading }) {
  const { active, riderReady, driverReady } = confirmation;
  const bothReady = riderReady && driverReady;

  if (!active) {
    return (
      <View style={styles.waitingBanner}>
        <Ionicons name="time-outline" size={14} color="#6366F1" />
        <Text style={styles.waitingText}>
          Ready button unlocks 30 min before pickup
        </Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.confirmRow}>
        <View style={[styles.confirmBadge, riderReady && styles.confirmBadgeOn]}>
          <Ionicons
            name={riderReady ? 'checkmark-circle' : 'ellipse-outline'}
            size={15}
            color={riderReady ? '#34D399' : '#9CA3AF'}
          />
          <Text style={[styles.confirmLabel, riderReady && styles.confirmLabelOn]}>You</Text>
        </View>
        <View style={[styles.confirmConnector, bothReady && styles.confirmConnectorOn]} />
        <View style={[styles.confirmBadge, driverReady && styles.confirmBadgeOn]}>
          <Ionicons
            name={driverReady ? 'checkmark-circle' : 'ellipse-outline'}
            size={15}
            color={driverReady ? '#34D399' : '#9CA3AF'}
          />
          <Text style={[styles.confirmLabel, driverReady && styles.confirmLabelOn]}>Driver</Text>
        </View>
      </View>

      {driverReady && !riderReady && (
        <View style={styles.otherSideBanner}>
          <Ionicons name="notifications" size={13} color="#6366F1" />
          <Text style={styles.otherSideText}>Driver is ready — waiting for you</Text>
        </View>
      )}

      {bothReady && (
        <View style={styles.allSetBanner}>
          <Ionicons name="checkmark-done-circle" size={15} color="#34D399" />
          <Text style={styles.allSetText}>Both confirmed — ride is set!</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.readyBtn, riderReady && styles.readyBtnOn]}
        onPress={onMarkReady}
        disabled={loading}
        activeOpacity={0.88}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Ionicons
              name={riderReady ? 'checkmark-circle' : 'checkmark-circle-outline'}
              size={21}
              color="#fff"
            />
            <Text style={styles.readyBtnText}>
              {riderReady ? "I'm Ready ✓" : 'Mark as Ready'}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}


function showRideDetails(ride, isActive) {
  const details = `
Ride Details:
${isActive ? 'Active Ride' : 'Upcoming Ride'}
Date: ${new Date(ride.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
Time: ${formatTime(ride.requestedStart)} - ${formatTime(ride.requestedEnd)}
Distance: ${formatDist(ride.pricingSnapshot.calculatedDistance)}
Duration: ${estimateDuration(ride.pricingSnapshot.calculatedDistance)} min
Total Fare: ${formatPrice(ride.pricingSnapshot.totalPrice)}
  `;
  
  Alert.alert('Ride Details', details);
}




export default function HomeScreen() {

  const [mode, setMode] = useState('active');
  const [localConf, setLocalConf] = useState(MOCK_ACTIVE_CONFIRMATION);
  const [loading, setLoading] = useState(false);
  const isActive = mode === 'active';
  const activeRide = MOCK_ACTIVE_RIDE_REQUEST
  const nextRide = MOCK_NEXT_RIDE_REQUEST;
  const driver = isActive ? MOCK_DRIVER : MOCK_NEXT_DRIVER;
  const ride = isActive ? activeRide : nextRide;

  const handleMarkReady = async () => {
    setLoading(true);
    // Simulate API call 
    try {
      await new Promise(r => setTimeout(r, 600));
      setLocalConf(prev => {
        const next = { ...prev, riderReady: !prev.riderReady };
        if (next.riderReady && next.driverReady) next.status = 'both_ready';
        return next;
      });
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const centerLocation = {
    latitude: (ride.pickupLocation.latitude + ride.dropoffLocation.latitude) / 2,
    longitude: (ride.pickupLocation.longitude + ride.dropoffLocation.longitude) / 2,
  };

  const markers = isActive ? [
    {
      ...ride.pickupLocation,
          title: 'Pickup',
          description: `Pick up at ${formatTime(ride.requestedStart)}`,
          color: 'green',
    },
    {
      ...ride.dropoffLocation,
      title: 'Drop-off',
      description: `Drop-off at ${formatTime(ride.requestedEnd)}`,
      color: 'red',
    },
    // Current user location
    { latitude: 37.786, longitude: -122.435, title: 'You', color: 'blue' },
  ]
  : [
    {
      ...nextRide.pickupLocation,
      title: 'UpcomingPickup',
      description: `${formatTime(nextRide.requestedStart)} on ${nextRide.date}`,
      color: 'green',
    },
    {
      ...nextRide.dropoffLocation,
      title: 'Upcoming Drop-off',
      description: `${formatTime(nextRide.requestedEnd)}`,
      color: 'red',
    },
  ]
  const duration = estimateDuration(ride.pricingSnapshot.calculatedDistance);

  return (
    <View style={styles.container}>
      <Map 
      markers={markers} 
      latitude={centerLocation.latitude} 
      longitude={centerLocation.longitude} 
      />

      {/* Mode Label */}
      <View style={styles.modeLabel}>
        <View style={[styles.modeDot, { backgroundColor: isActive ? '#34D399' : '#6366F1' }]}>
          <Text style={styles.modeLabelText}>{isActive ? 'AR' : 'NR'}</Text>
        </View>
      </View>

      {/* Toggle Mode Button */}
        <TouchableOpacity
          style={styles.toggleBtn}
          onPress={() => setMode(isActive ? 'upcoming' : 'active')}
          activeOpacity={0.88}
        >
          <Ionicons name={isActive ? 'calendar-outline' : 'car-sport'} size={17} color="#fff" />
        </TouchableOpacity>

      {/* Bottom sheet */}
      <View style={styles.rideCard}>
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.panelHeader}>
            <View>
              <Text style={styles.eyebrow}>{isActive ? 'ACTIVE RIDE' : 'NEXT UP'}</Text>
              <Text style={styles.panelTitle}>
                {isActive ? `In ${duration} min` : 'Upcoming Ride'}
              </Text>
            </View>
            {!isActive && (
              <TouchableOpacity
                style={styles.scheduleBtn}
                onPress={() => Alert.alert('Schedule', 'Opening full schedule…')}
              >
                <Ionicons name="calendar-outline" size={15} color="#6366F1" />
                <Text style={styles.scheduleBtnText}>Schedule</Text>
              </TouchableOpacity>
            )}
          </View>

      {/* Time and distance pills */}
      <View style={styles.pillRow}>
            <View style={styles.pillIndigo}>
              <Ionicons name="time-outline" size={13} color="#6366F1" />
              <Text style={styles.pillIndigoText}>
                {formatTime(ride.requestedStart)} → {formatTime(ride.requestedEnd)}
              </Text>
            </View>
            <View style={styles.pillGray}>
              <Text style={styles.pillGrayText}>
                {duration} min · {formatDist(ride.pricingSnapshot.calculatedDistance)}
              </Text>
            </View>
          </View>

      
      {/* Date for upcoming rides */}
      {!isActive && (
            <View style={styles.dateBadge}>
              <Ionicons name="calendar" size={13} color="#6B7280" />
              <Text style={styles.dateBadgeText}>
                {new Date(ride.date).toLocaleDateString('en-US', {
                  weekday: 'long', month: 'long', day: 'numeric',
                })}
              </Text>
            </View>
          )}


      {/* Route details */}
      <View style={styles.routeWrap}>
            <View style={styles.routeDots}>
              <View style={[styles.dot, { backgroundColor: '#34D399' }]} />
              <View style={styles.routeLine} />
              <View style={[styles.dot, { backgroundColor: '#F87171' }]} />
            </View>
            <View style={styles.routeAddrs}>
              <View>
                <Text style={styles.routeLabel}>PICKUP</Text>
                <Text style={styles.routeAddr}>
                  {ride.pickupLocation.address || 'Address not avalible'}
                </Text>
              </View>
              <View>
                <Text style={styles.routeLabel}>DROP-OFF</Text>
                <Text style={styles.routeAddr}>
                  {ride.dropoffLocation.address|| 'Address not avalible'}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />


      {/* Driver section */}
      <Text style={styles.sectionLabel}>DRIVER</Text>
          <DriverCard 
            driver={driver} 
            ridesTogther={isActive ? 7 : 0}
            compact={!isActive}
          />

          <View style={styles.divider} />

    
      {/* Fare section */}
      <Text style={styles.sectionLabel}>
            {isActive ? 'FARE BREAKDOWN' : 'ESTIMATED FARE'}
          </Text>
          
          {isActive ? (
            <View style={styles.priceWrap}>
              <View style={styles.priceItem}>
                <Text style={styles.priceLabel}>Base fare</Text>
                <Text style={styles.priceValue}>{formatPrice(ride.pricingSnapshot.baseFare)}</Text>
              </View>
              <View style={styles.priceItem}>
                <Text style={styles.priceLabel}>
                  {formatDist(ride.pricingSnapshot.calculatedDistance)} × {formatPrice(ride.pricingSnapshot.perMileRate)}/mi
                </Text>
                <Text style={styles.priceValue}>
                  {formatPrice(ride.pricingSnapshot.perMileRate * ride.pricingSnapshot.calculatedDistance)}
                </Text>
              </View>
              <View style={styles.priceDivider} />
              <View style={styles.priceItem}>
                <Text style={[styles.priceLabel, { fontWeight: '700', color: '#111827' }]}>Total</Text>
                <Text style={[styles.priceValue, { fontWeight: '800', fontSize: 17, color: '#059669' }]}>
                  {formatPrice(ride.pricingSnapshot.totalPrice)}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.simpleFareRow}>
              <Text style={styles.simpleFareLabel}>
                {formatDist(ride.pricingSnapshot.calculatedDistance)} ride
              </Text>
              <Text style={styles.simpleFareValue}>
                {formatPrice(ride.pricingSnapshot.totalPrice)}
              </Text>
            </View>
          )}

          {isActive && (
            <>
              <View style={styles.divider} />
              <Text style={styles.sectionLabel}>READY STATUS</Text>
              <ConfirmationStatus
                confirmation={localConf}
                onMarkReady={handleMarkReady}
                loading={loading}
              />
            </>
          )}

          {!isActive && (
            <TouchableOpacity
              style={styles.detailsBtn}
              onPress={() => showRideDetails(ride, isActive)}
            >
              <Text style={styles.detailsBtnText}>View Full Details</Text>
              <Ionicons name="chevron-forward" size={15} color="#6366F1" />
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </View>
  );
}