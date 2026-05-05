import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';

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

function WebMap({
  latitude,
  longitude,
  markers,
  route,
}: Required<MapComponentProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const markerRefsRef = useRef<any[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    import('leaflet').then((L) => {
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

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

      markerRefsRef.current.forEach((m) => m.remove());
      markerRefsRef.current = [];

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

      if (polylineRef.current) {
        polylineRef.current.remove();
        polylineRef.current = null;
      }

      if (route.coordinates.length >= 2) {
        const latlngs = route.coordinates.map(
          (c) => [c.latitude, c.longitude] as [number, number]
        );
        polylineRef.current = L.polyline(latlngs, {
          color: '#007AFF',
          weight: 4,
          opacity: 0.85,
        }).addTo(map);
        map.fitBounds(polylineRef.current.getBounds(), { padding: [40, 40] });
      } else if (markers.length >= 2) {
        const bounds = L.latLngBounds(
          markers.map((m) => [m.latitude, m.longitude] as [number, number])
        );
        map.fitBounds(bounds, { padding: [60, 60] });
      }
    });
  }, [latitude, longitude, markers, route]);

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

export default function Map(props: MapComponentProps) {
  const {
    latitude = 37.78825,
    longitude = -122.4324,
    markers = [],
    route = { coordinates: [] },
  } = props ?? {};

  return (
    <View style={{ flex: 1 }}>
      <WebMap
        latitude={latitude}
        longitude={longitude}
        markers={markers}
        route={route}
      />
    </View>
  );
}
