import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface TimeSlot {
  day: string;
  time: string;
  available: boolean;
  requested: boolean;
}

export default function DriverDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const driverName = params.name as string || 'Driver';
  const rating = parseFloat(params.rating as string) || 4.5;
  const totalRides = parseInt(params.totalRides as string) || 0;
  const driverType = params.driverType as string || 'Friendly';
  const bio = params.bio as string || '';
  const distance = params.distance as string || '';

  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const timeSlots = ['8:00 AM', '10:00 AM', '12:00 PM', '2:00 PM', '4:00 PM', '6:00 PM'];

  const [schedule] = useState<TimeSlot[]>([
    { day: 'Mon', time: '8:00 AM', available: true, requested: false },
    { day: 'Mon', time: '10:00 AM', available: false, requested: false },
    { day: 'Mon', time: '12:00 PM', available: true, requested: false },
    { day: 'Mon', time: '2:00 PM', available: true, requested: false },
    { day: 'Mon', time: '4:00 PM', available: false, requested: false },
    { day: 'Mon', time: '6:00 PM', available: true, requested: false },
    
    { day: 'Tue', time: '8:00 AM', available: true, requested: false },
    { day: 'Tue', time: '10:00 AM', available: true, requested: false },
    { day: 'Tue', time: '12:00 PM', available: false, requested: false },
    { day: 'Tue', time: '2:00 PM', available: true, requested: false },
    { day: 'Tue', time: '4:00 PM', available: true, requested: false },
    { day: 'Tue', time: '6:00 PM', available: false, requested: false },
    
    { day: 'Wed', time: '8:00 AM', available: false, requested: false },
    { day: 'Wed', time: '10:00 AM', available: true, requested: false },
    { day: 'Wed', time: '12:00 PM', available: true, requested: false },
    { day: 'Wed', time: '2:00 PM', available: true, requested: false },
    { day: 'Wed', time: '4:00 PM', available: true, requested: false },
    { day: 'Wed', time: '6:00 PM', available: true, requested: false },
    
    { day: 'Thu', time: '8:00 AM', available: true, requested: false },
    { day: 'Thu', time: '10:00 AM', available: false, requested: false },
    { day: 'Thu', time: '12:00 PM', available: true, requested: false },
    { day: 'Thu', time: '2:00 PM', available: false, requested: false },
    { day: 'Thu', time: '4:00 PM', available: true, requested: false },
    { day: 'Thu', time: '6:00 PM', available: true, requested: false },
    
    { day: 'Fri', time: '8:00 AM', available: true, requested: false },
    { day: 'Fri', time: '10:00 AM', available: true, requested: false },
    { day: 'Fri', time: '12:00 PM', available: true, requested: false },
    { day: 'Fri', time: '2:00 PM', available: true, requested: false },
    { day: 'Fri', time: '4:00 PM', available: false, requested: false },
    { day: 'Fri', time: '6:00 PM', available: false, requested: false },
    
    { day: 'Sat', time: '8:00 AM', available: false, requested: false },
    { day: 'Sat', time: '10:00 AM', available: true, requested: false },
    { day: 'Sat', time: '12:00 PM', available: true, requested: false },
    { day: 'Sat', time: '2:00 PM', available: true, requested: false },
    { day: 'Sat', time: '4:00 PM', available: true, requested: false },
    { day: 'Sat', time: '6:00 PM', available: true, requested: false },
    
    { day: 'Sun', time: '8:00 AM', available: true, requested: false },
    { day: 'Sun', time: '10:00 AM', available: false, requested: false },
    { day: 'Sun', time: '12:00 PM', available: false, requested: false },
    { day: 'Sun', time: '2:00 PM', available: true, requested: false },
    { day: 'Sun', time: '4:00 PM', available: true, requested: false },
    { day: 'Sun', time: '6:00 PM', available: true, requested: false },
  ]);

  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  const handleSlotPress = (slot: TimeSlot) => {
    if (!slot.available || slot.requested) {
      Alert.alert('Unavailable', 'This time slot is not available');
      return;
    }

    setSelectedSlot(slot);
    slot.requested = true;
    Alert.alert(
      'Request Ride',
      `Request a ride with ${driverName} on ${slot.day} at ${slot.time}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request',
          onPress: () => {
            setSelectedSlot(slot)
            slot.requested = true;
            Alert.alert('Success', `Ride requested for ${slot.day} at ${slot.time}`);
          }
        }
      ]
    );
  };

  const getSlotForDayAndTime = (day: string, time: string) => {
    return schedule.find(slot => slot.day === day && slot.time === time);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Driver Profile</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView>
        <View style={styles.profileSection}>
          <View style={styles.avatarLarge}>
            <Ionicons name="person" size={48} color="#999" />
          </View>
          
          <Text style={styles.driverName}>{driverName}</Text>
          
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="star" size={20} color="#FFB800" />
              <Text style={styles.statValue}>{rating}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="car" size={20} color="#666" />
              <Text style={styles.statValue}>{totalRides} rides</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="location" size={20} color="#666" />
              <Text style={styles.statValue}>{distance}</Text>
            </View>
          </View>

          <View style={styles.driverTypeBadge}>
            <Ionicons name="volume-medium" size={16} color="#666" />
            <Text style={styles.driverTypeText}>{driverType}</Text>
          </View>

          <Text style={styles.bioText}>{bio}</Text>
        </View>

        <View style={styles.scheduleSection}>
          <Text style={styles.sectionTitle}>Weekly Schedule</Text>
          <Text style={styles.sectionSubtitle}>Select a time to request a ride</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.scheduleGrid}>
              <View style={styles.timeColumn}>
                <View style={styles.dayHeaderCell} />
                {timeSlots.map((time) => (
                  <View key={time} style={styles.timeCell}>
                    <Text style={styles.timeText}>{time}</Text>
                  </View>
                ))}
              </View>

              {daysOfWeek.map((day) => (
                <View key={day} style={styles.dayColumn}>
                  <View style={styles.dayHeaderCell}>
                    <Text style={styles.dayHeaderText}>{day}</Text>
                  </View>
                  {timeSlots.map((time) => {
                    const slot = getSlotForDayAndTime(day, time);
                    return (
                      <TouchableOpacity
                        key={`${day}-${time}`}
                        style={[
                          styles.slotCell,
                          slot?.available ? styles.slotAvailable : styles.slotUnavailable,
                          selectedSlot?.day === day && selectedSlot?.time === time && styles.slotSelected,
                          slot?.requested && styles.slotRequested
                        ]}
                        onPress={() => slot && handleSlotPress(slot)}
                        
                      >
                        {slot?.available && !slot.requested ? (
                          <Ionicons name="checkmark" size={20} color="#34C759" />
                        ) : slot?.requested ? (
                          <Ionicons name="hourglass" size={20} color="#FF9800" />
                        ) : (
                          <Ionicons name="close" size={20} color="#ccc" />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>

          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendBox, styles.legendAvailable]} />
              <Text style={styles.legendText}>Available</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendBox, styles.legendUnavailable]} />
              <Text style={styles.legendText}>Unavailable</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendBox, styles.legendRequested]} />
              <Text style={styles.legendText}>Requested</Text>
            </View>
          </View>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  placeholder: {
    width: 40,
  },
  profileSection: {
    backgroundColor: '#fff',
    padding: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  avatarLarge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  driverName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginLeft: 6,
  },
  statDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#e0e0e0',
  },
  driverTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    marginBottom: 16,
  },
  driverTypeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginLeft: 6,
  },
  bioText: {
    fontSize: 15,
    color: '#666',
    lineHeight: 22,
    textAlign: 'center',
  },
  scheduleSection: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#999',
    marginBottom: 20,
  },
  scheduleGrid: {
    flexDirection: 'row',
  },
  timeColumn: {
    marginRight: 8,
  },
  dayColumn: {
    marginRight: 4,
  },
  dayHeaderCell: {
    height: 40,
    width: 70,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 6,
  },
  dayHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
  },
  timeCell: {
    height: 56,
    width: 90,
    justifyContent: 'center',
    paddingRight: 8,
    marginBottom: 6,
  },
  timeText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
    textAlign: 'right',
  },
  slotCell: {
    height: 56,
    width: 70,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 2,
  },
  slotAvailable: {
    backgroundColor: '#e8f5e9',
    borderColor: '#34C759',
  },
  slotUnavailable: {
    backgroundColor: '#f5f5f5',
    borderColor: '#e0e0e0',
  },
  slotSelected: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FF9800',
  },
  slotRequested: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FF9800',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
    gap: 24,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    marginRight: 8,
    borderWidth: 2,
  },
  legendAvailable: {
    backgroundColor: '#e8f5e9',
    borderColor: '#34C759',
  },
  legendUnavailable: {
    backgroundColor: '#f5f5f5',
    borderColor: '#e0e0e0',
  },
  legendRequested: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FF9800',
  },
  legendText: {
    fontSize: 14,
    color: '#666',
  },
  bottomPadding: {
    height: 32,
  },
});