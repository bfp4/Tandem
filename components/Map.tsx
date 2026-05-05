import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Callout, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

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

export default function Map(props: MapComponentProps) {
  const {
    latitude = 37.78825,
    longitude = -122.4324,
    markers = [],
    route = { coordinates: [] },
  } = props ?? {};

  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (!mapRef.current) return;
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

  const region = {
    latitude,
    longitude,
    latitudeDelta: 0.03,
    longitudeDelta: 0.03,
  };

  return (
    <View style={styles.container}>
      <MapView
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
      </MapView>
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
});
