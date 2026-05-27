import ScreenHeader from "@/components/ScreenHeader";
import StarRating from "@/components/StarRating";
import Avatar from "@/components/Avatar";
import EmptyState from "@/components/EmptyState";
import LoadingScreen from "@/components/LoadingScreen";
import { useAuth } from "@/context/AuthContext";
import { getMatchedUsers, type MatchResult } from "@/services/matchingService";
import { getUser } from "@/services/userService";
import type { User } from "@/types";
import { normalizeProfilePhotoUrl } from "@/utils/profilePhoto";
import {
  ACCENT,
  DISTANCE_STEPS,
  GREEN,
  parseStarRating,
  STAR_COLOR,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_TERTIARY,
} from "@/utils/constants";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { styles } from "./match.styles";


function toRideCountNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export default function MatchScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [results, setResults] = useState<MatchResult[]>([]);
  const [filteredResults, setFilteredResults] = useState<MatchResult[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<User | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [maxDistance, setMaxDistance] = useState(25);
  const [loading, setLoading] = useState(true);
  const [hasLocation, setHasLocation] = useState(false);
  const locationRef = useRef<{ lat: number; lng: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      init();
    }, []),
  );

  useEffect(() => {
    applyFilters();
  }, [searchQuery, selectedRating, results]);

  const init = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    let profile: User | null = null;
    try {
      profile = await getUser(user.uid);
      setCurrentUserProfile(profile);
    } catch {
      setLoading(false);
      return;
    }

    // Try to get location with a 6-second timeout — don't block matching if it fails.
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const locPromise = Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), 6000),
        );
        const loc = await Promise.race([locPromise, timeoutPromise]);
        if (loc && "coords" in loc) {
          locationRef.current = {
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
          };
          setHasLocation(true);
        }
      }
    } catch {
      // Location unavailable — continue without it
    }

    // Load matches regardless of whether location succeeded
    await runLoadMatches(profile, locationRef.current);
  };

  const runLoadMatches = async (
    profile: User | null,
    location: { lat: number; lng: number } | null,
  ) => {
    if (!profile) return;
    setLoading(true);
    try {
      const matched = await getMatchedUsers(
        profile,
        location?.lat ?? null,
        location?.lng ?? null,
        maxDistance,
      );
      setResults(matched);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const loadMatches = useCallback(async () => {
    await runLoadMatches(currentUserProfile, locationRef.current);
  }, [currentUserProfile, maxDistance]);

  const applyFilters = () => {
    let filtered = [...results];

    if (searchQuery) {
      filtered = filtered.filter(
        (r) =>
          r.user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.user.bio?.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }

    if (selectedRating !== null) {
      filtered = filtered.filter(
        (r) => parseStarRating(r.user.starRating) >= selectedRating,
      );
    }

    setFilteredResults(filtered);
  };

  const clearFilters = () => {
    setSelectedRating(null);
    setShowFilters(false);
  };

  const handleViewMore = (result: MatchResult) => {
    router.push({
      pathname: "../driver-details" as any,
      params: {
        id: result.user.uid,
        name: result.user.name,
        rating: String(parseStarRating(result.user.starRating)),
        totalRides: String(toRideCountNumber(result.user.rideCount)),
        bio: result.user.bio ?? "",
        profilePhoto: normalizeProfilePhotoUrl(result.user.profilePhoto),
        distance: result.distanceMiles.toFixed(1),
        score: Math.round(result.score * 100).toString(),
        matchingRides: JSON.stringify(result.matchingRides),
        myRole: currentUserProfile?.activeRole ?? "rider",
      },
    });
  };

  const renderMatch = ({ item }: { item: MatchResult }) => {
    const matchPhotoUrl = normalizeProfilePhotoUrl(item.user.profilePhoto);
    return (
      <View style={styles.matchCard}>
        <View style={styles.matchHeader}>
          <Avatar uri={matchPhotoUrl} size={52} style={{ marginRight: 12 }} />
          <View style={styles.matchInfo}>
            <Text style={styles.matchName}>{item.user.name}</Text>
            <View style={styles.ratingRow}>
              <StarRating
                rating={parseStarRating(item.user.starRating)}
                size={14}
                showValue
                filledColor={STAR_COLOR}
              />
              <Text style={styles.rideCount}>
                ({toRideCountNumber(item.user.rideCount)} rides)
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="location" size={12} color={TEXT_TERTIARY} />
              <Text style={styles.detailText}>
                {item.distanceMiles < 0.1
                  ? "Nearby"
                  : `${item.distanceMiles.toFixed(1)} mi away`}
              </Text>
              <Text style={styles.separator}>·</Text>
              <Ionicons name="calendar" size={12} color={TEXT_TERTIARY} />
              <Text style={styles.detailText}>
                {item.matchingRides.length} matching ride
                {item.matchingRides.length !== 1 ? "s" : ""}
              </Text>
            </View>
          </View>
          <View style={styles.scoreContainer}>
            <Text style={styles.scoreValue}>
              {Math.round(item.score * 100)}%
            </Text>
            <Text style={styles.scoreLabel}>match</Text>
          </View>
        </View>

        {item.user.bio ? (
          <Text style={styles.bio} numberOfLines={2}>
            {item.user.bio}
          </Text>
        ) : null}

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.viewMoreButton}
            onPress={() => handleViewMore(item)}
          >
            <Text style={styles.viewMoreButtonText}>View More</Text>
            <Ionicons name="chevron-forward" size={20} color={ACCENT} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const roleLookingFor =
    currentUserProfile?.activeRole === "driver" ? "Riders" : "Drivers";
  const filtersActive = selectedRating !== null || maxDistance !== 25;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={`Find ${roleLookingFor}`}
        subtitle={
          hasLocation ? (
            <View style={styles.locationBadge}>
              <Ionicons name="navigate" size={12} color={GREEN} />
              <Text style={styles.locationBadgeText}>Using your location</Text>
            </View>
          ) : (
            <View style={styles.locationBadge}>
              <Ionicons name="navigate-outline" size={12} color={TEXT_MUTED} />
              <Text style={[styles.locationBadgeText, { color: TEXT_MUTED }]}>
                Location unavailable — showing all
              </Text>
            </View>
          )
        }
      />

      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={TEXT_MUTED} />
          <TextInput
            style={styles.searchInput}
            placeholder={`Search ${roleLookingFor.toLowerCase()}...`}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={TEXT_MUTED}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={20} color={TEXT_MUTED} />
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity
          style={[
            styles.filterIconButton,
            filtersActive && styles.filterActiveButton,
          ]}
          onPress={() => setShowFilters(true)}
        >
          <Ionicons
            name="options"
            size={24}
            color={filtersActive ? "#fff" : "#007AFF"}
          />
        </TouchableOpacity>
      </View>

      {loading ? (
        <LoadingScreen message="Finding matches near you..." />
      ) : filteredResults.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No matches found"
          subtitle="Try increasing the distance filter or check back later"
        />
      ) : (
        <FlatList
          data={filteredResults}
          renderItem={renderMatch}
          keyExtractor={(item, index) =>
            (item.user as any)?.uid ?? (item.user as any)?.id ?? String(index)
          }
          contentContainerStyle={styles.listContent}
        />
      )}

      <Modal
        visible={showFilters}
        animationType="slide"
        transparent
        onRequestClose={() => setShowFilters(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filters</Text>
              <TouchableOpacity onPress={() => setShowFilters(false)}>
                <Ionicons name="close" size={28} color={TEXT_PRIMARY} />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>
                  Max Distance:{" "}
                  <Text style={styles.filterValue}>{maxDistance} mi</Text>
                </Text>
                <View style={styles.distanceChips}>
                  {DISTANCE_STEPS.map((d) => (
                    <TouchableOpacity
                      key={d}
                      style={[
                        styles.filterChip,
                        maxDistance === d && styles.filterChipActive,
                      ]}
                      onPress={() => setMaxDistance(d)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          maxDistance === d && styles.filterChipTextActive,
                        ]}
                      >
                        {d} mi
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Minimum Rating</Text>
                <View style={styles.ratingFilters}>
                  {[4.0, 4.5, 4.8, 5.0].map((rating) => (
                    <TouchableOpacity
                      key={rating}
                      style={[
                        styles.filterChip,
                        selectedRating === rating && styles.filterChipActive,
                      ]}
                      onPress={() =>
                        setSelectedRating(
                          selectedRating === rating ? null : rating,
                        )
                      }
                    >
                      <Ionicons
                        name="star"
                        size={14}
                        color={selectedRating === rating ? "#fff" : "#FFB800"}
                      />
                      <Text
                        style={[
                          styles.filterChipText,
                          selectedRating === rating &&
                            styles.filterChipTextActive,
                        ]}
                      >
                        {rating}+
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TouchableOpacity
                style={styles.clearFiltersButton}
                onPress={clearFilters}
              >
                <Text style={styles.clearFiltersText}>Clear All Filters</Text>
              </TouchableOpacity>
            </ScrollView>

            <TouchableOpacity
              style={styles.applyButton}
              onPress={() => {
                setShowFilters(false);
                loadMatches();
              }}
            >
              <Text style={styles.applyButtonText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

