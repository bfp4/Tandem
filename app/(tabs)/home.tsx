import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Map from '../../components/Map';

const TEXT_MUTED = '#9CA3AF';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E8EAF2' },
  rideCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 14,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginBottom: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
    marginTop: 12,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: TEXT_MUTED,
    textAlign: 'center',
  },
});

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Map markers={[]} latitude={33.749} longitude={-84.388} />

      <View style={styles.rideCard}>
        <View style={styles.handle} />
        <View style={styles.emptyState}>
          <Ionicons name="car-outline" size={48} color={TEXT_MUTED} />
          <Text style={styles.emptyTitle}>No active rides</Text>
          <Text style={styles.emptySubtitle}>
            Find a driver in the Match tab to get started
          </Text>
        </View>
      </View>
    </View>
  );
}
