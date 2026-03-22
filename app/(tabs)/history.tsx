import { Ionicons } from '@expo/vector-icons';
import { doc, setDoc } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';

interface TimeSlot {
  day: string;
  time: string;
  available: boolean;
}

export default function ScheduleScreen(){
  const functions = getFunctions();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  // const timeSlots = ['7:00 AM' ,'8:00 AM', '10:00 AM', '12:00 PM', '2:00 PM', '4:00 PM', '6:00 PM'];
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

  const handleSaveSchedule = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const docRef = doc(db, 'users', user.uid);
      await setDoc(docRef, { 
        schedule: schedule,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      Alert.alert('Success', 'Profile and schedule saved to Firebase!');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

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

// interface RideHistory {
//   id: string;
//   driverName: string;
//   date: string;
//   time: string;
//   pickup: string;
//   dropoff: string;
//   status: 'completed' | 'cancelled' | 'scheduled';
//   price: string;
//   rating?: number;
// }

// export default function HistoryScreen() {
//   const [rides] = useState<RideHistory[]>([
//     { 
//       id: '1', 
//       driverName: 'Alex Johnson', 
//       date: 'Feb 20, 2026',
//       time: '2:30 PM',
//       pickup: '123 Main St',
//       dropoff: '456 Market St',
//       status: 'completed',
//       price: '$15.50',
//       rating: 5
//     },
//     { 
//       id: '2', 
//       driverName: 'Sam Martinez', 
//       date: 'Feb 18, 2026',
//       time: '4:00 PM',
//       pickup: '789 Oak Ave',
//       dropoff: '321 Pine St',
//       status: 'completed',
//       price: '$22.00',
//       rating: 4
//     },
//     { 
//       id: '3', 
//       driverName: 'Jordan Lee', 
//       date: 'Feb 25, 2026',
//       time: '9:00 AM',
//       pickup: '555 Elm St',
//       dropoff: '777 Broadway',
//       status: 'scheduled',
//       price: '$18.75'
//     },
//     { 
//       id: '4', 
//       driverName: 'Taylor Smith', 
//       date: 'Feb 15, 2026',
//       time: '1:15 PM',
//       pickup: '111 First St',
//       dropoff: '222 Second Ave',
//       status: 'cancelled',
//       price: '$12.00'
//     },
//   ]);

//   const getStatusColor = (status: string) => {
//     switch (status) {
//       case 'completed':
//         return '#34C759';
//       case 'scheduled':
//         return '#007AFF';
//       case 'cancelled':
//         return '#FF3B30';
//       default:
//         return '#999';
//     }
//   };

//   const getStatusText = (status: string) => {
//     switch (status) {
//       case 'completed':
//         return 'Completed';
//       case 'scheduled':
//         return 'Upcoming';
//       case 'cancelled':
//         return 'Cancelled';
//       default:
//         return status;
//     }
//   };

//   const renderRide = ({ item }: { item: RideHistory }) => (
//     <TouchableOpacity style={styles.rideCard}>
//       <View style={styles.cardHeader}>
//         <View style={styles.driverSection}>
//           <View style={styles.driverAvatar}>
//             <Ionicons name="person" size={24} color="#999" />
//           </View>
//           <View>
//             <Text style={styles.driverLabel}>Driver</Text>
//             <Text style={styles.driverName}>{item.driverName}</Text>
//           </View>
//         </View>
//         <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
//           <Text style={styles.statusText}>{getStatusText(item.status)}</Text>
//         </View>
//       </View>

//       <View style={styles.detailsGrid}>
//         <View style={styles.detailItem}>
//           <Ionicons name="calendar" size={20} color="#007AFF" />
//           <View style={styles.detailContent}>
//             <Text style={styles.detailLabel}>Date</Text>
//             <Text style={styles.detailValue}>{item.date}</Text>
//           </View>
//         </View>

//         <View style={styles.detailItem}>
//           <Ionicons name="time" size={20} color="#007AFF" />
//           <View style={styles.detailContent}>
//             <Text style={styles.detailLabel}>Time</Text>
//             <Text style={styles.detailValue}>{item.time}</Text>
//           </View>
//         </View>

//         <View style={styles.detailItem}>
//           <Ionicons name="cash" size={20} color="#34C759" />
//           <View style={styles.detailContent}>
//             <Text style={styles.detailLabel}>Amount Paid</Text>
//             <Text style={styles.detailValue}>{item.price}</Text>
//           </View>
//         </View>
//       </View>

//       <View style={styles.separator} />

//       <View style={styles.routeContainer}>
//         <View style={styles.routeItem}>
//           <View style={styles.pickupDot} />
//           <View style={styles.routeDetails}>
//             <Text style={styles.routeLabel}>Pickup</Text>
//             <Text style={styles.routeAddress}>{item.pickup}</Text>
//           </View>
//         </View>

//         <View style={styles.routeLine} />

//         <View style={styles.routeItem}>
//           <View style={styles.dropoffPin}>
//             <Ionicons name="location" size={14} color="#FF3B30" />
//           </View>
//           <View style={styles.routeDetails}>
//             <Text style={styles.routeLabel}>Dropoff</Text>
//             <Text style={styles.routeAddress}>{item.dropoff}</Text>
//           </View>
//         </View>
//       </View>

//       {item.status === 'completed' && item.rating && (
//         <View style={styles.ratingFooter}>
//           <Text style={styles.ratingLabel}>Your Rating:</Text>
//           <View style={styles.ratingContainer}>
//             <Ionicons name="star" size={16} color="#FFB800" />
//             <Text style={styles.ratingText}>{item.rating}.0</Text>
//           </View>
//         </View>
//       )}

//       {item.status === 'completed' && !item.rating && (
//         <TouchableOpacity style={styles.rateButton}>
//           <Text style={styles.rateButtonText}>Rate This Ride</Text>
//         </TouchableOpacity>
//       )}

//       {item.status === 'scheduled' && (
//         <TouchableOpacity style={styles.cancelButton}>
//           <Ionicons name="close-circle" size={18} color="#FF3B30" />
//           <Text style={styles.cancelButtonText}>Cancel Ride</Text>
//         </TouchableOpacity>
//       )}
//     </TouchableOpacity>
//   );

//   return (
//     <View style={styles.container}>
//       <View style={styles.header}>
//         <Text style={styles.headerTitle}>Ride History</Text>
//       </View>

//       {rides.length === 0 ? (
//         <View style={styles.emptyState}>
//           <Ionicons name="car-outline" size={64} color="#ccc" />
//           <Text style={styles.emptyText}>No rides yet</Text>
//           <Text style={styles.emptySubtext}>
//             Your ride history will appear here
//           </Text>
//         </View>
//       ) : (
//         <FlatList
//           data={rides}
//           renderItem={renderRide}
//           keyExtractor={(item) => item.id}
//           contentContainerStyle={styles.listContent}
//         />
//       )}
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: '#f5f5f5',
//   },
//   header: {
//     padding: 16,
//     paddingTop: 60,
//     backgroundColor: '#fff',
//     borderBottomWidth: 1,
//     borderBottomColor: '#e0e0e0',
//   },
//   headerTitle: {
//     fontSize: 28,
//     fontWeight: 'bold',
//     color: '#333',
//   },
//   listContent: {
//     padding: 16,
//   },
//   rideCard: {
//     backgroundColor: '#fff',
//     borderRadius: 16,
//     padding: 16,
//     marginBottom: 12,
//     shadowColor: '#000',
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.1,
//     shadowRadius: 4,
//     elevation: 2,
//   },
//   cardHeader: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     alignItems: 'center',
//     marginBottom: 16,
//   },
//   driverSection: {
//     flexDirection: 'row',
//     alignItems: 'center',
//   },
//   driverAvatar: {
//     width: 44,
//     height: 44,
//     borderRadius: 22,
//     backgroundColor: '#f0f0f0',
//     justifyContent: 'center',
//     alignItems: 'center',
//     marginRight: 12,
//   },
//   driverLabel: {
//     fontSize: 11,
//     color: '#999',
//     textTransform: 'uppercase',
//     fontWeight: '600',
//     marginBottom: 2,
//   },
//   driverName: {
//     fontSize: 16,
//     fontWeight: '600',
//     color: '#333',
//   },
//   statusBadge: {
//     paddingHorizontal: 12,
//     paddingVertical: 6,
//     borderRadius: 12,
//   },
//   statusText: {
//     fontSize: 12,
//     fontWeight: '600',
//     color: '#fff',
//   },
//   detailsGrid: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     marginBottom: 16,
//     gap: 8,
//   },
//   detailItem: {
//     flex: 1,
//     flexDirection: 'row',
//     backgroundColor: '#f8f9fa',
//     padding: 12,
//     borderRadius: 12,
//     alignItems: 'center',
//   },
//   detailContent: {
//     marginLeft: 8,
//     flex: 1,
//   },
//   detailLabel: {
//     fontSize: 10,
//     color: '#999',
//     textTransform: 'uppercase',
//     fontWeight: '600',
//     marginBottom: 2,
//   },
//   detailValue: {
//     fontSize: 13,
//     fontWeight: '600',
//     color: '#333',
//   },
//   separator: {
//     height: 1,
//     backgroundColor: '#f0f0f0',
//     marginBottom: 16,
//   },
//   routeContainer: {
//     marginBottom: 12,
//   },
//   routeItem: {
//     flexDirection: 'row',
//     alignItems: 'flex-start',
//   },
//   pickupDot: {
//     width: 12,
//     height: 12,
//     borderRadius: 6,
//     backgroundColor: '#34C759',
//     marginTop: 4,
//   },
//   dropoffPin: {
//     width: 12,
//     height: 16,
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
//   routeLine: {
//     width: 2,
//     height: 16,
//     backgroundColor: '#e0e0e0',
//     marginLeft: 5,
//     marginVertical: 4,
//   },
//   routeDetails: {
//     flex: 1,
//     marginLeft: 12,
//   },
//   routeLabel: {
//     fontSize: 11,
//     color: '#999',
//     textTransform: 'uppercase',
//     fontWeight: '600',
//     marginBottom: 2,
//   },
//   routeAddress: {
//     fontSize: 14,
//     color: '#333',
//   },
//   ratingFooter: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     alignItems: 'center',
//     paddingTop: 12,
//     borderTopWidth: 1,
//     borderTopColor: '#f0f0f0',
//     marginTop: 12,
//   },
//   ratingLabel: {
//     fontSize: 14,
//     color: '#666',
//   },
//   ratingContainer: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     backgroundColor: '#fff9e6',
//     paddingHorizontal: 12,
//     paddingVertical: 6,
//     borderRadius: 12,
//   },
//   ratingText: {
//     fontSize: 14,
//     fontWeight: '600',
//     color: '#333',
//     marginLeft: 4,
//   },
//   rateButton: {
//     backgroundColor: '#007AFF',
//     paddingHorizontal: 20,
//     paddingVertical: 12,
//     borderRadius: 12,
//     alignItems: 'center',
//     marginTop: 12,
//   },
//   rateButtonText: {
//     fontSize: 15,
//     fontWeight: '600',
//     color: '#fff',
//   },
//   cancelButton: {
//     flexDirection: 'row',
//     backgroundColor: '#fff0f0',
//     paddingHorizontal: 20,
//     paddingVertical: 12,
//     borderRadius: 12,
//     borderWidth: 1,
//     borderColor: '#FF3B30',
//     alignItems: 'center',
//     justifyContent: 'center',
//     marginTop: 12,
//   },
//   cancelButtonText: {
//     fontSize: 15,
//     fontWeight: '600',
//     color: '#FF3B30',
//     marginLeft: 6,
//   },
//   emptyState: {
//     flex: 1,
//     justifyContent: 'center',
//     alignItems: 'center',
//     padding: 32,
//   },
//   emptyText: {
//     fontSize: 20,
//     fontWeight: '600',
//     color: '#999',
//     marginTop: 16,
//     marginBottom: 8,
//   },
//   emptySubtext: {
//     fontSize: 14,
//     color: '#aaa',
//     textAlign: 'center',
//   },
// });
