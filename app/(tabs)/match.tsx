import { signUpWithEmail } from '@/services/authService';
import { getAllDrivers } from '@/services/userService';
import { User } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

interface Match {
  id: string;
  name: string;
  distance: number;
  rating: number;
  totalRides: number;
  driverType: string;
  bio: string;
}

export default function MatchScreen() {
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [filteredMatches, setFilteredMatches] = useState<Match[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [selectedDriverType, setSelectedDriverType] = useState<string | null>(null);

  const makeUsers = () => {
      signUpWithEmail('example@email.com', 'examplePassowrd');
  }

  useEffect(() => {
    loadMatches();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [searchQuery, selectedRating, selectedDriverType, matches]);

  const driverTypes = ['Quiet', 'Talkitive', 'Friendly', 'Professional'];

  const loadMatches = async () => {
    makeUsers;
    const data = await getAllDrivers();
    let sampleMatches: Match[] = [];
    (data).forEach((element: User) => {
        const elementData = {
          id: element.uid,
          name: element.name,
          rating: element.starRating,
          driverType: driverTypes[Math.floor((Math.random() * 100)%4)],
          distance: 0,
          totalRides: element.rideCount,
          bio: element.bio
        }
        sampleMatches.push(elementData);
      })
      sampleMatches.sort((a, b) => b.rating - a.rating);
    setMatches(sampleMatches);
  }

  const applyFilters = () => {
    let filtered = [...matches];

    if (searchQuery) {
      filtered = filtered.filter(match => 
        match.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        match.driverType.toLowerCase().includes(searchQuery.toLowerCase()) ||
        match.bio.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (selectedRating) {
      filtered = filtered.filter(match => match.rating >= selectedRating);
    }

    if (selectedDriverType) {
      filtered = filtered.filter(match => match.driverType === selectedDriverType);
    }

    setFilteredMatches(filtered);
  };

  const clearFilters = () => {
    setSelectedRating(null);
    setSelectedDriverType(null);
    setShowFilters(false);
  };

  const handleViewMore = (driver: Match) => {
    router.push({
      pathname: '../driver-details' as any,
      params: {
        id: driver.id,
        name: driver.name,
        rating: driver.rating.toString(),
        totalRides: driver.totalRides.toString(),
        driverType: driver.driverType,
        bio: driver.bio,
        distance: driver.distance,
      }
    });
  };

  const renderMatch = ({ item }: { item: Match }) => (
    <View style={styles.matchCard}>
      <View style={styles.matchHeader}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={32} color="#999" />
        </View>
        <View style={styles.matchInfo}>
          <Text style={styles.matchName}>{item.name}</Text>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={14} color="#FFB800" />
            <Text style={styles.rating}>{item.rating}</Text>
            <Text style={styles.rideCount}>({item.totalRides} rides)</Text>
          </View>
          <Text style={styles.matchDetail}>
            <Ionicons name="location" size={12} color="#666" /> {item.distance}
          </Text>
        </View>
      </View>

      <View style={styles.driverTypeBadge}>
        <Ionicons name="volume-medium" size={14} color="#666" />
        <Text style={styles.driverTypeText}>{item.driverType}</Text>
      </View>

      <Text style={styles.bio} numberOfLines={2}>{item.bio}</Text>

      <TouchableOpacity style={styles.viewMoreButton} onPress={() => handleViewMore(item)}> 
        <Text style={styles.viewMoreButtonText}>View More</Text>
        <Ionicons name="chevron-forward" size={20} color="#007AFF" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Find Drivers</Text>
      </View>

      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#999" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for a driver..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#999"
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#999" />
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity 
          style={[
            styles.filterIconButton, 
            (selectedRating || selectedDriverType) ? styles.filterActiveButton : null
          ]} 
          onPress={() => setShowFilters(true)}
        >
          <Ionicons name="options" size={24} color={(selectedRating || selectedDriverType) ? '#fff' : '#007AFF'} />
        </TouchableOpacity>
      </View>

      {filteredMatches.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>No matches found</Text>
          <Text style={styles.emptySubtext}>
            Try adjusting your search or filters
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredMatches}
          renderItem={renderMatch}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      )}

      <Modal
        visible={showFilters}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFilters(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filters</Text>
              <TouchableOpacity onPress={() => setShowFilters(false)}>
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Minimum Rating</Text>
                <View style={styles.ratingFilters}>
                  {[4.0, 4.5, 4.8, 5.0].map((rating) => (
                    <TouchableOpacity
                      key={rating}
                      style={[
                        styles.filterChip,
                        selectedRating === rating && styles.filterChipActive
                      ]}
                      onPress={() => setSelectedRating(selectedRating === rating ? null : rating)}
                    >
                      <Ionicons name="star" size={16} color={selectedRating === rating ? '#fff' : '#FFB800'} />
                      <Text style={[
                        styles.filterChipText,
                        selectedRating === rating && styles.filterChipTextActive
                      ]}>
                        {rating}+
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Driver Type</Text>
                <View style={styles.typeFilters}>
                  {['Quiet', 'Talkative', 'Friendly', 'Professional'].map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.typeChip,
                        selectedDriverType === type && styles.typeChipActive
                      ]}
                      onPress={() => setSelectedDriverType(selectedDriverType === type ? null : type)}
                    >
                      <Text style={[
                        styles.typeChipText,
                        selectedDriverType === type && styles.typeChipTextActive
                      ]}>
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TouchableOpacity style={styles.clearFiltersButton} onPress={clearFilters}>
                <Text style={styles.clearFiltersText}>Clear All Filters</Text>
              </TouchableOpacity>
            </ScrollView>

            <TouchableOpacity 
              style={styles.applyButton} 
              onPress={() => setShowFilters(false)}
            >
              <Text style={styles.applyButtonText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  searchSection: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    gap: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    marginLeft: 8,
    color: '#333',
  },
  filterIconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#f0f7ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterActiveButton: {
    backgroundColor: '#007AFF',
  },
  listContent: {
    padding: 16,
  },
  matchCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  matchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  matchInfo: {
    flex: 1,
  },
  matchName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  rating: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginLeft: 4,
  },
  rideCount: {
    fontSize: 12,
    color: '#999',
    marginLeft: 4,
  },
  matchDetail: {
    fontSize: 13,
    color: '#666',
  },
  driverTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 10,
  },
  driverTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginLeft: 4,
  },
  bio: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12,
  },
  viewMoreButton: {
    flexDirection: 'row',
    backgroundColor: '#f0f7ff',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  viewMoreButtonText: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '600',
    marginRight: 4,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#aaa',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  filterSection: {
    marginBottom: 24,
  },
  filterLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  ratingFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  filterChipActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginLeft: 6,
  },
  filterChipTextActive: {
    color: '#fff',
  },
  typeFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  typeChipActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  typeChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  typeChipTextActive: {
    color: '#fff',
  },
  clearFiltersButton: {
    padding: 12,
    alignItems: 'center',
  },
  clearFiltersText: {
    fontSize: 14,
    color: '#FF3B30',
    fontWeight: '600',
  },
  applyButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
