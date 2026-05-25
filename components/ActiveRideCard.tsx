import RidePartnerRow from '@/components/RidePartnerRow';
import RouteAddressBlock from '@/components/RouteAddressBlock';
import type { EnrichedRide } from '@/types/enrichedRide';
import {
  ACCENT,
  GREEN,
  RED,
  TEXT_INVERSE,
  TEXT_SECONDARY,
} from '@/utils/constants';
import { format12h } from '@/utils/format12h';
import { formatDistanceKm } from '@/utils/distanceFormat';
import { formatRideDate } from '@/utils/rideDate';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { styles } from '@/app/(tabs)/home.styles';

function estimateETA(minutes: number | null): string {
  if (minutes == null) return '—';
  return `${Math.round(minutes)} min`;
}

interface ActiveRideCardProps {
  ride: EnrichedRide;
  currentUserId?: string;
  actingOnId: string | null;
  distanceToDropoff: number | null;
  etaMinutes: number | null;
  onViewProfile: (ride: EnrichedRide) => void;
  onMarkReady: (ride: EnrichedRide) => void;
  onDenyRide: (ride: EnrichedRide) => void;
  onCancelReady: (ride: EnrichedRide) => void;
  onConfirmPickup: (ride: EnrichedRide) => void;
  onCompleteRide: (ride: EnrichedRide) => void;
  onMessage: (otherUserId: string) => void;
}

export default function ActiveRideCard({
  ride,
  currentUserId,
  actingOnId,
  distanceToDropoff,
  etaMinutes,
  onViewProfile,
  onMarkReady,
  onDenyRide,
  onCancelReady,
  onConfirmPickup,
  onCompleteRide,
  onMessage,
}: ActiveRideCardProps) {
  const busy = actingOnId === ride.confirmation.id;
  const status = ride.confirmation.status;
  const isDriver = ride.confirmation.driverId === currentUserId;
  const iAmReady = isDriver
    ? (ride.confirmation.driverReady ?? false)
    : (ride.confirmation.riderReady ?? false);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.statusBadge}>
          <View
            style={[
              styles.statusDot,
              status === 'in_progress' ? styles.dotGreen : styles.dotOrange,
            ]}
          />
          <Text style={styles.statusText}>
            {status === 'in_progress'
              ? 'In Progress'
              : status === 'both_ready'
                ? 'Waiting for Pickup'
                : 'Starting soon'}
          </Text>
        </View>
        <Text style={styles.cardDate}>
          {formatRideDate(ride.confirmation.nextRideDate)}
        </Text>
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

      <View style={styles.etaRow}>
        <Ionicons name="navigate-outline" size={14} color={TEXT_SECONDARY} />
        <Text style={styles.etaText}>
          {formatDistanceKm(distanceToDropoff)} • {estimateETA(etaMinutes)} away
        </Text>
      </View>

      <RidePartnerRow user={ride.otherUser} onPress={() => onViewProfile(ride)} />

      <View style={styles.cardActions}>
        {status === 'waiting' && !ride.synthetic && (
          <>
            {!iAmReady ? (
              <>
                <TouchableOpacity
                  style={[styles.primaryButton, busy && styles.buttonDisabled]}
                  onPress={() => onMarkReady(ride)}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator color={TEXT_INVERSE} size="small" />
                  ) : (
                    <>
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color={TEXT_INVERSE}
                      />
                      <Text style={styles.primaryButtonText}>Confirm</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.denyButton, busy && styles.buttonDisabled]}
                  onPress={() => onDenyRide(ride)}
                  disabled={busy}
                >
                  <Ionicons name="close-circle" size={16} color={RED} />
                  <Text style={styles.denyButtonText}>Deny</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={[styles.waitingBadge, { flex: 1 }]}>
                  <Ionicons name="checkmark-circle" size={16} color={GREEN} />
                  <Text style={[styles.waitingText, { color: GREEN }]}>
                    {`Waiting for ${isDriver ? 'rider' : 'driver'}...`}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.cancelReadyButton, busy && styles.buttonDisabled]}
                  onPress={() => onCancelReady(ride)}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator color={RED} size="small" />
                  ) : (
                    <Text style={styles.cancelReadyText}>Undo</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        {status === 'both_ready' && (
          <TouchableOpacity
            style={[styles.primaryButton, busy && styles.buttonDisabled]}
            onPress={() => onConfirmPickup(ride)}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={TEXT_INVERSE} size="small" />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color={TEXT_INVERSE}
                />
                <Text style={styles.primaryButtonText}>Confirm Pickup</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {status === 'in_progress' && (
          <TouchableOpacity
            style={[
              styles.primaryButton,
              styles.completeButton,
              busy && styles.buttonDisabled,
            ]}
            onPress={() => onCompleteRide(ride)}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={TEXT_INVERSE} size="small" />
            ) : (
              <>
                <Ionicons name="flag" size={18} color={TEXT_INVERSE} />
                <Text style={styles.primaryButtonText}>Complete Ride</Text>
              </>
            )}
          </TouchableOpacity>
        )}

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
