import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';


let NativeMapView: any;
let Marker: any;
let Polyline: any;
let PROVIDER_GOOGLE: any;
let Callout: any;

if (Platform.OS !== 'web') {
  try {
    const Maps = require('react-native-maps');
    NativeMapView = Maps.default;
    Marker = Maps.Marker;
    Polyline = Maps.Polyline;
    PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
    Callout = Maps.Callout;
  } catch {
    // react-native-maps is not available in Expo Go — a development build is required.
  }
}

export interface MarkerData {
  latitude: number;
  longitude: number;
  title?: string;
  description?: string;
  color?: string;
  isUserLocation?: boolean;
  calloutLines?: string[]; 
}

export interface RouteData {
  coordinates: { latitude: number; longitude: number }[];
}

interface MapComponentProps {
  latitude?: number;
  longitude?: number;
  markers?: MarkerData[];
  route?: RouteData;
}

// ─── Web: Leaflet map with polyline support ───────────────────────────────────

function WebMap({ latitude, longitude, markers, route }: Required<MapComponentProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const markerRefsRef = useRef<any[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Dynamically import Leaflet to avoid SSR issues
    import('leaflet').then((L) => {
      // Inject Leaflet CSS once
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      // Fix default icon paths broken by webpack
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      // Create map only once
      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current!, {
          zoomControl: true,
          scrollWheelZoom: false,
        }).setView([latitude, longitude], 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
        }).addTo(mapRef.current);
      }

      const map = mapRef.current;

      // Clear existing markers
      markerRefsRef.current.forEach((m) => m.remove());
      markerRefsRef.current = [];

      // Add markers
      markers.forEach((m) => {
        const color = m.color === '#34C759' ? 'green' : m.color === '#FF3B30' ? 'red' : 'blue';
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        const marker = L.marker([m.latitude, m.longitude], { icon });
        if (m.title) marker.bindPopup(m.title);
        marker.addTo(map);
        markerRefsRef.current.push(marker);
      });

      // Draw or clear polyline
      if (polylineRef.current) {
        polylineRef.current.remove();
        polylineRef.current = null;
      }

      if (route.coordinates.length >= 2) {
        const latlngs = route.coordinates.map((c) => [c.latitude, c.longitude] as [number, number]);
        polylineRef.current = L.polyline(latlngs, {
          color: '#007AFF',
          weight: 4,
          opacity: 0.85,
        }).addTo(map);

        // Fit map to show the full route
        map.fitBounds(polylineRef.current.getBounds(), { padding: [40, 40] });
      } else if (markers.length >= 2) {
        const bounds = L.latLngBounds(markers.map((m) => [m.latitude, m.longitude] as [number, number]));
        map.fitBounds(bounds, { padding: [60, 60] });
      }
    });
  }, [latitude, longitude, markers, route]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', minHeight: 240 }}
    />
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function Map(props: MapComponentProps) {
  const {
    latitude = 37.78825,
    longitude = -122.4324,
    markers = [],
    route = { coordinates: [] },
  } = props ?? {};

  const mapRef = useRef<any>(null);

  // Native: auto-fit to route/markers
  useEffect(() => {
    if (Platform.OS === 'web' || !mapRef.current) return;
    const allCoords = [
      ...route.coordinates,
      ...markers.map((m) => ({ latitude: m.latitude, longitude: m.longitude })),
    ];
    if (allCoords.length < 2) return;
    setTimeout(() => {
      mapRef.current?.fitToCoordinates(allCoords, {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: true,
      });
    }, 300);
  }, [route, markers]);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <WebMap
          latitude={latitude}
          longitude={longitude}
          markers={markers}
          route={route}
        />
      </View>
    );
  }

  if (!NativeMapView) {
    return (
      <View style={[styles.container, styles.mapUnavailable]}>
        <Text style={styles.mapUnavailableText}>
          Map requires a development build.{'\n'}Run: npx expo run:android / run:ios
        </Text>
      </View>
    );
  }

  const region = {
    latitude,
    longitude,
    latitudeDelta: 0.03,
    longitudeDelta: 0.03,
  };

  return (
    <View style={styles.container}>
      <NativeMapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={region}
      >
        {markers.map((marker, index) => (
  <Marker
    key={index}
    coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
    pinColor={marker.color}
  >
    {marker.isUserLocation && (
      <View style={{
        width: 18, height: 18, borderRadius: 9,
        backgroundColor: '#007AFF',
        borderWidth: 3, borderColor: '#fff',
        shadowColor: '#000', shadowOpacity: 0.3,
        shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
      }} />
    )}
    {marker.calloutLines && marker.calloutLines.length > 0 && (
      <Callout tooltip={false}>
        <View style={{ padding: 8, maxWidth: 200 }}>
          {marker.calloutLines.map((line, i) => (
            <Text key={i} style={{ fontSize: 12, color: '#1C1C1E', marginBottom: 2 }}>
              {line}
            </Text>
          ))}
        </View>
      </Callout>
    )}
  </Marker>
))}


        {route.coordinates.length >= 2 && (
          <Polyline
            coordinates={route.coordinates}
            strokeColor="#007AFF"
            strokeWidth={4}
          />
        )}
      </NativeMapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  mapUnavailable: {
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  mapUnavailableText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
});
