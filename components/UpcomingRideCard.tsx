import RidePartnerRow from '@/components/RidePartnerRow';
import RidePricingInfo from '@/components/RidePricingInfo';
import RouteAddressBlock from '@/components/RouteAddressBlock';
import type { EnrichedRide } from '@/types/enrichedRide';
import { ACCENT, TEXT_MUTED, TEXT_SECONDARY } from '@/utils/constants';
import { format12h } from '@/utils/format12h';
import { formatRideDate } from '@/utils/rideDate';
import { geoPointToLatLng, getDistanceMeters } from '@/utils/geo';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { styles } from '@/app/(tabs)/home.styles';

interface UpcomingRideCardProps {
  ride: EnrichedRide;
  onViewProfile: (ride: EnrichedRide) => void;
  onMessage: (otherUserId: string) => void;
}

export default function UpcomingRideCard({
  ride,
  onViewProfile,
  onMessage,
}: UpcomingRideCardProps) {
  const pickup = geoPointToLatLng(ride.request.pickupLocation);
  const dropoff = geoPointToLatLng(ride.request.dropoffLocation);
  const rideDistanceMeters =
    pickup && dropoff ? getDistanceMeters(pickup, dropoff) : null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardDateLarge}>
          {formatRideDate(ride.confirmation.nextRideDate)}
        </Text>
        <View style={styles.statusBadge}>
          <Ionicons name="time-outline" size={14} color={TEXT_MUTED} />
          <Text style={styles.statusText}>
            {ride.synthetic ? 'Scheduled (syncing…)' : 'Scheduled'}
          </Text>
        </View>
      </View>

      <View style={styles.cardTime}>
        <Ionicons name="time-outline" size={16} color={TEXT_SECONDARY} />
        <Text style={styles.cardTimeText}>
          {format12h(ride.request.requestedStart)} –{' '}
          {format12h(ride.request.requestedEnd)}
        </Text>
      </View>

      <RouteAddressBlock
        pickup={ride.pickupAddress}
        dropoff={ride.dropoffAddress}
        style={styles.locationBlock}
      />

      <RidePricingInfo
        request={ride.request}
        rideDistanceMeters={rideDistanceMeters}
      />

      <RidePartnerRow user={ride.otherUser} onPress={() => onViewProfile(ride)} />

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.messageChip}
          onPress={() => onMessage(ride.otherUser.uid)}
        >
          <Ionicons name="chatbubble-ellipses" size={16} color={ACCENT} />
          <Text style={styles.messageChipText}>Message</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
