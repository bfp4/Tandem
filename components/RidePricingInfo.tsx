import type { RideRequestWithId } from '@/services/rideRequestService';
import { TEXT_SECONDARY } from '@/utils/constants';
import {
  formatDurationMinutes,
  getRideDurationMinutes,
} from '@/utils/rideDate';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface RidePricingInfoProps {
  request: RideRequestWithId;
  rideDistanceMeters?: number | null;
}

export default function RidePricingInfo({
  request,
  rideDistanceMeters,
}: RidePricingInfoProps) {
  const duration = getRideDurationMinutes(
    request.requestedStart,
    request.requestedEnd,
  );

  const fare =
    request.pricingSnapshot?.totalPrice ??
    request.pricingSnapshot?.baseFare ??
    (duration > 0
      ? Math.round(
          (2.5 + duration * 0.4 + ((rideDistanceMeters ?? 0) / 1609.34) * 1.2) *
            2,
        ) / 2
      : null);

  const isEstimate =
    request.pricingSnapshot?.totalPrice == null &&
    request.pricingSnapshot?.baseFare == null;

  return (
    <View style={styles.row}>
      <View style={styles.item}>
        <Ionicons name="time-outline" size={14} color={TEXT_SECONDARY} />
        <Text style={styles.label}>Duration</Text>
        <Text style={styles.value}>{formatDurationMinutes(duration)}</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.item}>
        <Ionicons name="cash-outline" size={14} color={TEXT_SECONDARY} />
        <Text style={styles.label}>{isEstimate ? 'Est. Fare' : 'Fare'}</Text>
        <Text style={styles.value}>
          {fare != null ? `$${fare.toFixed(2)}` : '—'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
