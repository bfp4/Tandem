import { getBlocksByUser } from '@/services/scheduleBlockService';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { getFinalSchedule } from './(tabs)/history';

interface TimeSlot {
  day: string;
  time: string;
  available: boolean;
  requested: boolean;
}

export default function DriverDetailsScreen() {
  var finalSchedule = getFinalSchedule();
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const id = params.id as string || 'id'
  const driverName = params.name as string || 'Driver';
  const rating = parseFloat(params.rating as string) || 4.5;
  const totalRides = parseInt(params.totalRides as string) || 0;
  const driverType = params.driverType as string || 'Friendly';
  const bio = params.bio as string || '';
  const distance = params.distance as string || '';
  var minTimeIndex = 0;
  var maxTimeIndex = 0;

  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const timeSlots = ['12:00 AM','12:15 AM','12:30 AM','12:45 AM','1:00 AM','1:15 AM','1:30 AM','1:45 AM'
    ,'2:00 AM','2:15 AM','2:30 AM','2:45 AM','3:00 AM','3:15 AM','3:30 AM','3:45 AM'
    ,'4:00 AM','4:15 AM','4:30 AM','4:45 AM','5:00 AM','5:15 AM','5:30 AM','5:45 AM'
    ,'6:00 AM','6:15 AM','6:30 AM','6:45 AM','7:00 AM','7:15 AM','7:30 AM','7:45 AM'
    ,'8:00 AM','8:15 AM','8:30 AM','8:45 AM','9:00 AM','9:15 AM','9:30 AM','9:45 AM'
    ,'10:00 AM','10:15 AM','10:30 AM','10:45 AM','11:00 AM','11:15 AM','11:30 AM','11:45 AM'
    ,'12:00 PM','12:15 PM','12:30 PM','12:45 PM','1:00 PM','1:15 PM','1:30 PM','1:45 PM'
    ,'2:00 PM','2:15 PM','2:30 PM','2:45 PM','3:00 PM','3:15 PM','3:30 PM','3:45 PM'
    ,'4:00 PM','4:15 PM','4:30 PM','4:45 PM','5:00 PM','5:15 PM','5:30 PM','5:45 PM'
    ,'6:00 PM','6:15 PM','6:30 PM','6:45 PM','7:00 PM','7:15 PM','7:30 PM','7:45 PM'
    ,'8:00 PM','8:15 PM','8:30 PM','8:45 PM','9:00 PM','9:15 PM','9:30 PM','9:45 PM'
    ,'10:00 PM','10:15 PM','10:30 PM','10:45 PM','11:00 PM','11:15 PM','11:30 PM','11:45 PM'];

  const blocks = getBlocksByUser(id);

  const [schedule] = useState<TimeSlot[]>([
    { day: 'Mon', time: '8:00 AM', available: true, requested: false },
    { day: 'Mon', time: '12:00 PM', available: true, requested: false },
    { day: 'Mon', time: '2:00 PM', available: true, requested: false },
    { day: 'Mon', time: '6:00 PM', available: true, requested: false },
    
    { day: 'Tue', time: '8:00 AM', available: true, requested: false },
    { day: 'Tue', time: '10:00 AM', available: true, requested: false },
    { day: 'Tue', time: '2:00 PM', available: true, requested: false },
    { day: 'Tue', time: '4:00 PM', available: true, requested: false },
    
    { day: 'Wed', time: '10:00 AM', available: true, requested: false },
    { day: 'Wed', time: '12:00 PM', available: true, requested: false },
    { day: 'Wed', time: '2:00 PM', available: true, requested: false },
    { day: 'Wed', time: '4:00 PM', available: true, requested: false },
    { day: 'Wed', time: '6:00 PM', available: true, requested: false },
    
    { day: 'Thu', time: '8:00 AM', available: true, requested: false },
    { day: 'Thu', time: '12:00 PM', available: true, requested: false },
    { day: 'Thu', time: '4:00 PM', available: true, requested: false },
    { day: 'Thu', time: '6:00 PM', available: true, requested: false },
    
    { day: 'Fri', time: '8:00 AM', available: true, requested: false },
    { day: 'Fri', time: '10:00 AM', available: true, requested: false },
    { day: 'Fri', time: '12:00 PM', available: true, requested: false },
    { day: 'Fri', time: '2:00 PM', available: true, requested: false },
    
    { day: 'Sat', time: '10:00 AM', available: true, requested: false },
    { day: 'Sat', time: '12:00 PM', available: true, requested: false },
    { day: 'Sat', time: '2:00 PM', available: true, requested: false },
    { day: 'Sat', time: '4:00 PM', available: true, requested: false },
    { day: 'Sat', time: '6:00 PM', available: true, requested: false },
    
    { day: 'Sun', time: '8:00 AM', available: true, requested: false },
    { day: 'Sun', time: '2:00 PM', available: true, requested: false },
    { day: 'Sun', time: '4:00 PM', available: true, requested: false },
    { day: 'Sun', time: '6:00 PM', available: true, requested: false },
  ]);

  var [scheduleCopy] = useState<TimeSlot[]>([]);

  const arrayIncludes = (element: TimeSlot) => {
    finalSchedule = getFinalSchedule();
      for(var i = 0; i < finalSchedule.length; i++){
        if(finalSchedule[i].time == element.time && finalSchedule[i].day == element.day)
          return true;
      }
      return false;
  }

  const remove = (array: TimeSlot[], element: TimeSlot) => {
      let toReturn: TimeSlot[] = [];
      for(var i = 0; i < array.length; i++){
        if(array[i].time != element.time || array[i].day != element.day)
          toReturn.push(element);
      }
      return toReturn;
      // var indexToRemove = -1;
      // for(var i = 0; i < array.length; i++){
      //   if(array[i].time == element.time && array[i].day == element.day){
      //     indexToRemove = i;
      //     console.log("Hello");
      //     break;
      //   }
      // }
      // var toReturn = subArray(array, 0, indexToRemove);
      // toReturn.push(subArray(array, indexToRemove + 1, array.length));
      // return toReturn;
  }

  const findMinAndMaxTimes = (schedule: TimeSlot[]) => {
      var minIndex = timeSlots.length;
      var maxIndex = 0;
      var index = 0;
      schedule.forEach((element: TimeSlot) => {
        if(arrayIncludes(element)){
          index = timeSlots.indexOf(element.time);
          if(index > maxIndex) maxIndex = index;
          if(index < minIndex) minIndex = index;
          scheduleCopy.push(element);
        }
      })
      minTimeIndex = minIndex;
      maxTimeIndex = maxIndex;
  }

  const subArray = (list: any[], startIndex: number, endIndex: number) => {
      let toReturn: any[] = [];
      for(var i = startIndex; i < endIndex; i++) toReturn.push(list[i]);
      return toReturn;
  }

  const limitSchedule = (schedule: TimeSlot[]) => {
      finalSchedule = getFinalSchedule()
      for(var i = 0; i < scheduleCopy.length; i++)
        scheduleCopy.pop();
      findMinAndMaxTimes(schedule);
      return subArray(timeSlots, minTimeIndex, maxTimeIndex+1);
  }


  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [sideBoxVisible, setSideBoxVisible] = useState(false);
  const [sideBoxText1, setSideBoxText1] = useState('');
  const [sideBoxText2, setSideBoxText2] = useState('');

  const handleSlotPress = (slot: TimeSlot) => {
    if (!slot.available || slot.requested) {
      Alert.alert('Unavailable', 'This time slot is not available');
      return;
    }

    setSelectedSlot(slot);
    slot.requested = true;
    setSideBoxVisible(true);
  };

  const hideSideBox = () => {
    setSideBoxVisible(false);
  };

  const confirmRideRequest = (selectedSlot: TimeSlot) => {
    if(!selectedSlot) return;
    setSideBoxVisible(false);

    // if (!selectedSlot) return;
    // Alert.alert(
    //   'Request Ride',
    //   `Request a ride with ${driverName} on ${selectedSlot.day} at ${selectedSlot.time}?`,
    //   [
    //     { text: 'Cancel', style: 'cancel' },
    //     {
    //       text: 'Request',
    //       onPress: () => {
            setSelectedSlot(selectedSlot)
            selectedSlot.requested = true;
    //         Alert.alert('Success', `Ride requested for ${selectedSlot.day} at ${selectedSlot.time}`);
    //       },
    //     },
    //   ]
    // );
  };

  const getSlotForDayAndTime = (day: string, time: string) => {
    return scheduleCopy.find(slot => slot.day === day && slot.time === time);
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

          <View style={styles.scheduleRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.scheduleScroll}
              contentContainerStyle={styles.scheduleScrollContent}
            >
              <View style={styles.scheduleGrid}>
                <View style={styles.timeColumn}>
                  <View style={styles.dayHeaderCell} />
                  {limitSchedule(schedule).map((time) => (
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
                    {limitSchedule(schedule).map((time) => {
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

            {sideBoxVisible && (
              <View style={styles.scheduleSideBox}>
                <View style={styles.scheduleSideBoxHeader}>
                  <Text style={styles.scheduleSideBoxTitle} numberOfLines={2}>
                    {selectedSlot
                      ? `${selectedSlot.day} · ${selectedSlot.time}`
                      : 'Ride details'}
                  </Text>
                  <TouchableOpacity
                    onPress={hideSideBox}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Close details panel"
                  >
                    <Ionicons name="close" size={22} color="#666" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.sideInputLabel}>Pickup location</Text>
                <TextInput
                  style={styles.sideTextInput}
                  placeholder="Insert pickup location"
                  placeholderTextColor="#999"
                  value={sideBoxText1}
                  onChangeText={setSideBoxText1}
                  multiline
                />

                <Text style={[styles.sideInputLabel, styles.sideInputLabelSecond]}>
                  Drop off location
                </Text>
                <TextInput
                  style={styles.sideTextInput}
                  placeholder="Insert Drop off location"
                  placeholderTextColor="#999"
                  value={sideBoxText2}
                  onChangeText={setSideBoxText2}
                  multiline
                />

                <TouchableOpacity
                  style={styles.sideBoxRequestButton}
                  // onPress={() => slot && handleSlotPress(slot)}
                  onPress={() => selectedSlot && confirmRideRequest(selectedSlot)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.sideBoxRequestButtonText}>Request ride</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

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
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  scheduleScroll: {
    flex: 1,
    minWidth: 0,
  },
  scheduleScrollContent: {
    flexGrow: 1,
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
    height: 30,
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
    height: 30,
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
  scheduleSideBox: {
    width: 168,
    marginRight: 500,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  scheduleSideBoxHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  scheduleSideBoxTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#333',
  },
  sideInputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  sideInputLabelSecond: {
    marginTop: 8,
  },
  sideTextInput: {
    minHeight: 56,
    maxHeight: 88,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: '#333',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    textAlignVertical: 'top',
  },
  sideBoxRequestButton: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    alignItems: 'center',
  },
  sideBoxRequestButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  bottomPadding: {
    height: 32,
  },
});