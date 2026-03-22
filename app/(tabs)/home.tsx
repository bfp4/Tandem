import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Map from '../../components/Map';

export default function HomeScreen() {
  const pickupLocation = {
    latitude: 37.78825,
    longitude: -122.4324,
  };
  
  const dropoffLocation = {
    latitude: 37.79825,
    longitude: -122.4224,
  };

  const centerLocation = {
    latitude: (pickupLocation.latitude + dropoffLocation.latitude) / 2,
    longitude: (pickupLocation.longitude + dropoffLocation.longitude) / 2,
  };

  const markers = [
    {
      latitude: pickupLocation.latitude,
      longitude: pickupLocation.longitude,
      title: 'Pickup',
      description: '123 Main St',
      color: 'green',
    },
    {
      latitude: dropoffLocation.latitude,
      longitude: dropoffLocation.longitude,
      title: 'Dropoff',
      description: '456 Market St',
      color: 'red',
    },
  ];

  const [isReady, setIsReady] = useState(false);

  const handleReadyPress = () => {
    setIsReady(!isReady);
    Alert.alert(
      isReady ? 'Status Updated' : 'Ready!',
      isReady ? 'You are no longer ready' : 'You are now ready for pickup'
    );
  };

  return (
    <View style={styles.container}>
      <Map 
        latitude={centerLocation.latitude} 
        longitude={centerLocation.longitude}
        markers={markers}
      />
      
      <View style={styles.rideCard}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.driverSection}>
            <Text style={styles.sectionTitle}>Your Driver</Text>
            <View style={styles.driverInfo}>
              <View style={styles.driverAvatar}>
                <Ionicons name="person" size={32} color="#666" />
              </View>
              <View style={styles.driverDetails}>
                <Text style={styles.driverName}>John Smith</Text>
                <View style={styles.ratingContainer}>
                  <Ionicons name="star" size={16} color="#FFB800" />
                  <Text style={styles.rating}>4.9</Text>
                  <Text style={styles.ratingCount}>(234 rides)</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.callButton}>
                <Ionicons name="call" size={20} color="#007AFF" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.separator} />

          <View style={styles.locationSection}>
            <Text style={styles.sectionTitle}>Route Details</Text>
            
            <View style={styles.locationItem}>
              <View style={styles.locationIconContainer}>
                <Ionicons name="ellipse" size={12} color="#34C759" />
              </View>
              <View style={styles.locationDetails}>
                <Text style={styles.locationType}>Pickup</Text>
                <Text style={styles.locationAddress}>123 Main St, San Francisco</Text>
              </View>
            </View>

            <View style={styles.routeLine} />

            <View style={styles.locationItem}>
              <View style={styles.locationIconContainer}>
                <Ionicons name="location" size={16} color="#FF3B30" />
              </View>
              <View style={styles.locationDetails}>
                <Text style={styles.locationType}>Dropoff</Text>
                <Text style={styles.locationAddress}>456 Market St, San Francisco</Text>
              </View>
            </View>
          </View>

          <View style={styles.separator} />

          <View style={styles.scheduleSection}>
            <Text style={styles.sectionTitle}>Schedule</Text>
            
            <View style={styles.timeContainer}>
              <View style={styles.timeItem}>
                <Ionicons name="time-outline" size={20} color="#007AFF" />
                <View style={styles.timeDetails}>
                  <Text style={styles.timeLabel}>Pickup Time</Text>
                  <Text style={styles.timeValue}>2:30 PM</Text>
                </View>
              </View>

              <View style={styles.timeItem}>
                <Ionicons name="flag-outline" size={20} color="#34C759" />
                <View style={styles.timeDetails}>
                  <Text style={styles.timeLabel}>Est. Arrival</Text>
                  <Text style={styles.timeValue}>2:45 PM</Text>
                </View>
              </View>
            </View>

            <View style={styles.durationBadge}>
              <Ionicons name="car-sport" size={16} color="#666" />
              <Text style={styles.durationText}>15 min ride • 3.2 miles</Text>
            </View>
          </View>

          <TouchableOpacity 
            style={[styles.readyButton, isReady && styles.readyButtonActive]} 
            onPress={handleReadyPress}
          >
            <Ionicons 
              name={isReady ? "checkmark-circle" : "checkmark-circle-outline"} 
              size={24} 
              color="#fff" 
            />
            <Text style={styles.readyButtonText}>
              {isReady ? "I'm Ready!" : "Mark as Ready"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  rideCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '65%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  separator: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: 16,
  },
  driverSection: {
    marginBottom: 8,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  driverDetails: {
    flex: 1,
  },
  driverName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rating: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginLeft: 4,
  },
  ratingCount: {
    fontSize: 12,
    color: '#999',
    marginLeft: 4,
  },
  callButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f0f7ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationSection: {
    marginBottom: 8,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  locationIconContainer: {
    width: 24,
    alignItems: 'center',
    paddingTop: 2,
  },
  routeLine: {
    width: 2,
    height: 20,
    backgroundColor: '#e0e0e0',
    marginLeft: 11,
    marginVertical: 4,
  },
  locationDetails: {
    flex: 1,
    marginLeft: 12,
  },
  locationType: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  locationAddress: {
    fontSize: 15,
    color: '#333',
    lineHeight: 20,
  },
  scheduleSection: {
    marginBottom: 8,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  timeItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 12,
    marginHorizontal: 4,
  },
  timeDetails: {
    marginLeft: 8,
  },
  timeLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 2,
  },
  timeValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f0f0',
    padding: 10,
    borderRadius: 20,
  },
  durationText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 6,
    fontWeight: '500',
  },
  readyButton: {
    flexDirection: 'row',
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  readyButtonActive: {
    backgroundColor: '#34C759',
  },
  readyButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 8,
  },
});
