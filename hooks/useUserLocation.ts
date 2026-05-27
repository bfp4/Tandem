import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

export function useUserLocation() {
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const initial = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setUserLocation({
        latitude: initial.coords.latitude,
        longitude: initial.coords.longitude,
      });

      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 20 },
        (loc) =>
          setUserLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          }),
      );
    })();

    return () => {
      sub?.remove();
    };
  }, []);

  return userLocation;
}
