import MapView, { type MarkerData } from '@/components/Map';
import type { EnrichedRide } from '@/types/enrichedRide';
import { ACCENT, GREEN, RED } from '@/utils/constants';
import { format12h } from '@/utils/format12h';
import { formatRideDate } from '@/utils/rideDate';
import { geoPointToLatLng } from '@/utils/geo';
import React from 'react';
import { View } from 'react-native';

interface UpcomingMapSectionProps {
  upcoming: EnrichedRide[];
  userLocation: { latitude: number; longitude: number } | null;
}

export default function UpcomingMapSection({
  upcoming,
  userLocation,
}: UpcomingMapSectionProps) {
  const upcomingMarkers: MarkerData[] = [];

  if (userLocation) {
    upcomingMarkers.push({
      ...userLocation,
      title: 'You',
      color: ACCENT,
      isUserLocation: true,
      calloutLines: ['📍 Your location'],
    });
  }

  upcoming.forEach((ride) => {
    const pickup = geoPointToLatLng(ride.request.pickupLocation);
    const dropoff = geoPointToLatLng(ride.request.dropoffLocation);

    if (pickup) {
      upcomingMarkers.push({
        ...pickup,
        title: `Pickup – ${ride.otherUser.name}`,
        color: GREEN,
        calloutLines: [
          `📍 Pickup with ${ride.otherUser.name}`,
          ride.pickupAddress,
          formatRideDate(ride.confirmation.nextRideDate),
          format12h(ride.request.requestedStart),
        ],
      });
    }
    if (dropoff) {
      upcomingMarkers.push({
        ...dropoff,
        title: `Dropoff – ${ride.otherUser.name}`,
        color: RED,
        calloutLines: [
          `📍 Dropoff with ${ride.otherUser.name}`,
          ride.dropoffAddress,
          formatRideDate(ride.confirmation.nextRideDate),
          format12h(ride.request.requestedEnd),
        ],
      });
    }
  });

  const centre =
    upcomingMarkers.length > 0
      ? {
          latitude: upcomingMarkers[0].latitude,
          longitude: upcomingMarkers[0].longitude,
        }
      : { latitude: 33.749, longitude: -84.388 };

  if (upcomingMarkers.length === 0) return null;

  return (
    <View style={{ height: 200 }}>
      <MapView
        latitude={centre.latitude}
        longitude={centre.longitude}
        markers={upcomingMarkers}
      />
    </View>
  );
}
