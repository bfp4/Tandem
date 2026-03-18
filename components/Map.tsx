import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

let MapView: any;
let Marker: any;
let PROVIDER_GOOGLE: any;

if (Platform.OS !== 'web') {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Marker = Maps.Marker;
  PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
}

interface MarkerData {
  latitude: number;
  longitude: number;
  title?: string;
  description?: string;
  color?: string;
}

interface MapComponentProps {
  latitude?: number;
  longitude?: number;
  markers?: MarkerData[];
}

export default function Map({ 
  latitude = 37.78825, 
  longitude = -122.4324,
  markers = []
}: MapComponentProps) {
  if (Platform.OS === 'web') {
    let markerParams = '';
    if (markers.length > 0) {
      markers.forEach((marker, index) => {
        markerParams += `&marker=${marker.latitude},${marker.longitude}`;
      });
    }
    
    return (
      <View style={styles.container}>
        <iframe
          width="100%"
          height="100%"
          style={{ border: 0 }}
          loading="lazy"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${longitude-0.02},${latitude-0.02},${longitude+0.02},${latitude+0.02}&layer=mapnik${markerParams}`}
        />
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
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={region}
      >
        {markers.map((marker, index) => (
          <Marker
            key={index}
            coordinate={{
              latitude: marker.latitude,
              longitude: marker.longitude,
            }}
            title={marker.title}
            description={marker.description}
            pinColor={marker.color || 'red'}
          />
        ))}
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
