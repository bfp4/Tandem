import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useAuth } from '../../context/AuthContext';

interface TimeSlot {
  day: string;
  time: string;
  available: boolean;
}

var finalSchedule: TimeSlot[] = [];

export function getFinalSchedule(): TimeSlot[] {
  return finalSchedule;
}

export default function ScheduleScreen(){
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
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
  const [schedule, setSchedule] = useState<TimeSlot[]>(() => {
    const initialSchedule: TimeSlot[] = [];
    daysOfWeek.forEach(day => {
      timeSlots.forEach(time => {
        initialSchedule.push({ day, time, available: false });
      });
    });
    return initialSchedule;
  });

  const getSlotForDayAndTime = (day: string, time: string) => {
    return schedule.find(slot => slot.day === day && slot.time === time);
  };

  const toggleSlot = (day: string, time: string) => {
    setSchedule(prevSchedule => 
      prevSchedule.map(slot => 
        slot.day === day && slot.time === time 
          ? { ...slot, available: !slot.available }
          : slot
      )
    );
  };

  const handleSaveSchedule = () => {
    finalSchedule = [];
    schedule.forEach((element: TimeSlot) => {
      if(element.available) finalSchedule.push(element);
    })
  }
  


  return (
    <ScrollView style={styles.container}>
      <View style={styles.scheduleSection}>
          <Text style={styles.scheduleTitle}>My Availability Schedule</Text>
          <Text style={styles.scheduleSubtitle}>Tap slots to set your available times</Text>

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
                        ]}
                        onPress={() => toggleSlot(day, time)}
                      >
                        {slot?.available ? (
                          <Ionicons name="checkmark" size={20} color="#34C759" />
                        ) : (
                          <View style={styles.emptySlot} />
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
          </View>

        <TouchableOpacity 
          style={styles.saveButton} 
          onPress={handleSaveSchedule}
          disabled={loading}
        >
          <Ionicons name="save" size={20} color="#fff" />
          <Text style={styles.saveButtonText}>
            {loading ? 'Saving...' : 'Save Schedule'}
          </Text>
        </TouchableOpacity>
        </View>
    </ScrollView>  
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 16,
  },
  scheduleSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  scheduleTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  scheduleSubtitle: {
    fontSize: 13,
    color: '#999',
    marginBottom: 16,
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
    fontSize: 13,
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
    fontSize: 11,
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
  emptySlot: {
    width: 20,
    height: 20,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
    gap: 20,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendBox: {
    width: 18,
    height: 18,
    borderRadius: 6,
    marginRight: 6,
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
  legendText: {
    fontSize: 13,
    color: '#666',
  },
  saveButton: {
    flexDirection: 'row',
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    marginTop: 24,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  }
});

