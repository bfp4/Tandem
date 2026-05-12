import { useAuth } from "@/context/AuthContext";
import { getMatchedUsers, type MatchResult } from "@/services/matchingService";
import {
    addBlockedAccount,
    addFavorite,
    getUser,
    hasEitherUserBlocked,
    isBlockedAccount,
    isFavorited,
    removeBlockedAccount,
    removeFavorite,
} from "@/services/userService";
import type { User } from "@/types";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";

const DISTANCE_STEPS = [5, 10, 15, 25, 50, 100];

/** Aggregate fields may be missing or non-numeric in Firestore snapshots. */
function toStarRatingNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

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

  const [blockedFilterMessage, setBlockedFilterMessage] = useState("");
  const [openMenuForUserId, setOpenMenuForUserId] = useState<string | null>(
    null,
  );
  const [actionMenuMessage, setActionMenuMessage] = useState("");
  const closeMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuStatus, setMenuStatus] = useState<{
    favorited: boolean;
    blocked: boolean;
    loading: boolean;
  }>({
    favorited: false,
    blocked: false,
    loading: false,
  });
  const [confirmBlockForMenuKey, setConfirmBlockForMenuKey] = useState<
    string | null
  >(null);

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
      if (!user?.uid) {
        setResults(matched);
        return;
      }

      const currentUid = user.uid;
      const targetIds = Array.from(
        new Set(
          matched
            .map((r) => (r.user as any)?.uid ?? (r.user as any)?.id)
            .filter(
              (id): id is string =>
                typeof id === "string" && id.trim().length > 0,
            ),
        ),
      );

      try {
        const checks = await Promise.all(
          targetIds.map(async (targetUid) => ({
            targetUid,
            eitherBlocked: await hasEitherUserBlocked(currentUid, targetUid),
          })),
        );
        const blockedSet = new Set(
          checks.filter((c) => c.eitherBlocked).map((c) => c.targetUid),
        );
        const filtered = matched.filter((r) => {
          const id = (r.user as any)?.uid ?? (r.user as any)?.id;
          return typeof id === "string" ? !blockedSet.has(id) : true;
        });
        setResults(filtered);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        setBlockedFilterMessage(
          `Could not verify blocks — showing all matches. (${message})`,
        );
        setTimeout(() => setBlockedFilterMessage(""), 3500);
        setResults(matched);
      }
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
        (r) => toStarRatingNumber(r.user.starRating) >= selectedRating,
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
        rating: String(toStarRatingNumber(result.user.starRating)),
        totalRides: String(toRideCountNumber(result.user.rideCount)),
        bio: result.user.bio ?? "",
        distance: result.distanceMiles.toFixed(1),
        score: Math.round(result.score * 100).toString(),
        matchingRides: JSON.stringify(result.matchingRides),
        myRole: currentUserProfile?.activeRole ?? "rider",
      },
    });
  };

  const getActionUserId = (match: MatchResult): string | null => {
    const anyUser = match.user as any;
    const id = (match.user as any)?.uid ?? anyUser?.id;
    return typeof id === "string" && id.trim().length > 0 ? id : null;
  };

  const scheduleMenuClose = (delayMs: number = 1500) => {
    if (closeMenuTimerRef.current) clearTimeout(closeMenuTimerRef.current);
    closeMenuTimerRef.current = setTimeout(() => {
      setOpenMenuForUserId(null);
      setActionMenuMessage("");
      setConfirmBlockForMenuKey(null);
    }, delayMs);
  };

  const loadMenuStatus = async (targetUid: string) => {
    if (!user?.uid) return;
    setMenuStatus((s) => ({ ...s, loading: true }));
    try {
      const [fav, blocked] = await Promise.all([
        isFavorited(user.uid, targetUid),
        isBlockedAccount(user.uid, targetUid),
      ]);
      setMenuStatus({ favorited: fav, blocked, loading: false });
    } catch {
      setMenuStatus((s) => ({ ...s, loading: false }));
    }
  };

  const handleFavorite = async (match: MatchResult) => {
    const targetUid = getActionUserId(match);
    if (!targetUid) {
      setActionMenuMessage(
        "Unable to complete action because this user is missing an ID.",
      );
      scheduleMenuClose();
      return;
    }

    const currentUid = user?.uid;
    if (!currentUid) {
      setActionMenuMessage("Failed to add favorite: Missing current user ID");
      scheduleMenuClose(3000);
      return;
    }

    try {
      if (menuStatus.favorited) {
        await removeFavorite(currentUid, targetUid);
        setMenuStatus((s) => ({ ...s, favorited: false }));
        setActionMenuMessage("Removed from favorites");
      } else {
        await addFavorite(currentUid, {
          uid: targetUid,
          name: match.user.name,
          activeRole: (match.user as any).activeRole ?? null,
        });
        setMenuStatus((s) => ({ ...s, favorited: true }));
        setActionMenuMessage("Added to favorites");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setActionMenuMessage(`Failed to update favorite: ${message}`);
      scheduleMenuClose(3000);
      return;
    }
    scheduleMenuClose();
  };

  const handleConfirmBlock = async (match: MatchResult) => {
    const targetUid = getActionUserId(match);
    if (!targetUid) {
      setActionMenuMessage(
        "Unable to complete action because this user is missing an ID.",
      );
      scheduleMenuClose(3000);
      return;
    }

    const currentUid = user?.uid;
    if (!currentUid) {
      setActionMenuMessage("Failed to block account: Missing current user ID");
      scheduleMenuClose(3000);
      return;
    }

    try {
      await addBlockedAccount(currentUid, {
        uid: targetUid,
        name: match.user.name,
        activeRole: (match.user as any).activeRole ?? null,
      });
      setMenuStatus((s) => ({ ...s, blocked: true }));
      setActionMenuMessage("Blocked account");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setActionMenuMessage(`Failed to block account: ${message}`);
      scheduleMenuClose(3000);
      return;
    }
    scheduleMenuClose();
  };

  const handleBlockToggle = async (match: MatchResult, menuKey: string) => {
    const targetUid = getActionUserId(match);
    if (!targetUid) {
      setActionMenuMessage(
        "Unable to complete action because this user is missing an ID.",
      );
      scheduleMenuClose(3000);
      return;
    }

    const currentUid = user?.uid;
    if (!currentUid) {
      setActionMenuMessage("Failed to block account: Missing current user ID");
      scheduleMenuClose(3000);
      return;
    }

    if (menuStatus.blocked) {
      try {
        await removeBlockedAccount(currentUid, targetUid);
        setMenuStatus((s) => ({ ...s, blocked: false }));
        setActionMenuMessage("Unblocked account");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        setActionMenuMessage(`Failed to unblock account: ${message}`);
        scheduleMenuClose(3000);
        return;
      }
      scheduleMenuClose();
      return;
    }

    setConfirmBlockForMenuKey(menuKey);
    setActionMenuMessage("Block this user?");
  };

  const renderMatch = ({
    item,
    index,
  }: {
    item: MatchResult;
    index: number;
  }) => {
    const userId = getActionUserId(item);
    const menuKey = userId ?? `missing-id-${index}`;
    const menuOpen = openMenuForUserId === menuKey;
    const confirmBlockOpen = confirmBlockForMenuKey === menuKey;
    return (
      <View style={[styles.matchCard, menuOpen && styles.matchCardMenuOpen]}>
        <View style={styles.matchHeader}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={32} color="#999" />
          </View>
          <View style={styles.matchInfo}>
            <Text style={styles.matchName}>{item.user.name}</Text>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={14} color="#FFB800" />
              <Text style={styles.rating}>
                {toStarRatingNumber(item.user.starRating).toFixed(1)}
              </Text>
              <Text style={styles.rideCount}>
                ({toRideCountNumber(item.user.rideCount)} rides)
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="location" size={12} color="#666" />
              <Text style={styles.detailText}>
                {item.distanceMiles < 0.1
                  ? "Nearby"
                  : `${item.distanceMiles.toFixed(1)} mi away`}
              </Text>
              <Text style={styles.separator}>·</Text>
              <Ionicons name="calendar" size={12} color="#666" />
              <Text style={styles.detailText}>
                {item.matchingRides.length} matching ride
                {item.matchingRides.length !== 1 ? "s" : ""}
              </Text>
            </View>
          </View>
          <View style={styles.rightHeaderColumn}>
            <TouchableOpacity
              style={styles.cardMenuButton}
              onPress={() => {
                setActionMenuMessage("");
                setConfirmBlockForMenuKey(null);
                setOpenMenuForUserId((prev) => {
                  const next = prev === menuKey ? null : menuKey;
                  if (next === menuKey && userId) void loadMenuStatus(userId);
                  return next;
                });
              }}
              accessibilityRole="button"
              accessibilityLabel="Open profile actions"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="ellipsis-vertical" size={18} color="#666" />
            </TouchableOpacity>

            {menuOpen ? (
              <View style={styles.cardActionMenu}>
                {!confirmBlockOpen ? (
                  <>
                    <Pressable
                      style={({ pressed }) => [
                        styles.cardActionMenuItem,
                        pressed && styles.cardActionMenuItemPressed,
                      ]}
                      onPress={() => {
                        void handleFavorite(item);
                      }}
                    >
                      <Text style={styles.cardActionMenuText}>
                        {menuStatus.favorited ? "Remove Favorite" : "Favorite"}
                      </Text>
                    </Pressable>
                    <View style={styles.cardActionMenuDivider} />
                    <Pressable
                      style={({ pressed }) => [
                        styles.cardActionMenuItem,
                        pressed && styles.cardActionMenuItemPressed,
                      ]}
                      onPress={() => {
                        void handleBlockToggle(item, menuKey);
                      }}
                    >
                      <Text style={styles.cardActionMenuText}>
                        {menuStatus.blocked ? "Unblock" : "Block"}
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <View style={styles.cardActionMenuConfirm}>
                    <Text style={styles.cardActionMenuMessage}>
                      Block this user?
                    </Text>
                    <View style={styles.cardActionMenuConfirmRow}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.cardActionMenuConfirmButton,
                          pressed && styles.cardActionMenuItemPressed,
                        ]}
                        onPress={() => {
                          setConfirmBlockForMenuKey(null);
                          setActionMenuMessage("");
                        }}
                      >
                        <Text style={styles.cardActionMenuConfirmText}>
                          Cancel
                        </Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [
                          styles.cardActionMenuConfirmButton,
                          styles.cardActionMenuConfirmDangerButton,
                          pressed && styles.cardActionMenuItemPressed,
                        ]}
                        onPress={() => {
                          setConfirmBlockForMenuKey(null);
                          void handleConfirmBlock(item);
                        }}
                      >
                        <Text style={styles.cardActionMenuConfirmText}>
                          Confirm Block
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                )}
                {actionMenuMessage ? (
                  <>
                    <View style={styles.cardActionMenuDivider} />
                    <Text style={styles.cardActionMenuMessage}>
                      {actionMenuMessage}
                    </Text>
                  </>
                ) : null}
              </View>
            ) : null}

            <View style={styles.scoreContainer}>
              <Text style={styles.scoreValue}>
                {Math.round(item.score * 100)}%
              </Text>
              <Text style={styles.scoreLabel}>match</Text>
            </View>
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
            <Ionicons name="chevron-forward" size={20} color="#007AFF" />
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
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Find {roleLookingFor}</Text>
        {hasLocation ? (
          <View style={styles.locationBadge}>
            <Ionicons name="navigate" size={12} color="#34C759" />
            <Text style={styles.locationBadgeText}>Using your location</Text>
          </View>
        ) : (
          <View style={styles.locationBadge}>
            <Ionicons name="navigate-outline" size={12} color="#999" />
            <Text style={[styles.locationBadgeText, { color: "#999" }]}>
              Location unavailable — showing all
            </Text>
          </View>
        )}
      </View>

      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#999" />
          <TextInput
            style={styles.searchInput}
            placeholder={`Search ${roleLookingFor.toLowerCase()}...`}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#999"
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={20} color="#999" />
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

      {blockedFilterMessage ? (
        <Text style={styles.blockedFilterMessage}>{blockedFilterMessage}</Text>
      ) : null}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Finding matches near you...</Text>
        </View>
      ) : filteredResults.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>No matches found</Text>
          <Text style={styles.emptySubtext}>
            Try increasing the distance filter or check back later
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredResults}
          renderItem={renderMatch}
          keyExtractor={(item, index) =>
            (item.user as any)?.uid ?? (item.user as any)?.id ?? String(index)
          }
          onScrollBeginDrag={() => {
            setOpenMenuForUserId(null);
            setActionMenuMessage("");
          }}
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
                <Ionicons name="close" size={28} color="#333" />
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    padding: 16,
    paddingTop: 60,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#333",
  },
  locationBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 4,
  },
  locationBadgeText: {
    fontSize: 12,
    color: "#34C759",
    fontWeight: "500",
  },
  searchSection: {
    flexDirection: "row",
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
    gap: 8,
  },
  blockedFilterMessage: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: "#fff",
    color: "#666",
    fontSize: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    marginLeft: 8,
    color: "#333",
  },
  filterIconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#f0f7ff",
    justifyContent: "center",
    alignItems: "center",
  },
  filterActiveButton: {
    backgroundColor: "#007AFF",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: "#999",
  },
  listContent: {
    padding: 16,
  },
  matchCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    position: "relative",
    overflow: "visible",
  },
  matchCardMenuOpen: {
    zIndex: 50,
    elevation: 12,
  },
  matchHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  matchInfo: {
    flex: 1,
    minWidth: 0,
  },
  matchName: {
    fontSize: 17,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    flexWrap: "wrap",
    alignSelf: "flex-start",
  },
  rating: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginLeft: 4,
    flexShrink: 0,
  },
  rideCount: {
    fontSize: 12,
    color: "#999",
    marginLeft: 4,
    flexShrink: 0,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  detailText: {
    fontSize: 12,
    color: "#666",
  },
  separator: {
    fontSize: 12,
    color: "#ccc",
    marginHorizontal: 2,
  },
  scoreContainer: {
    alignItems: "center",
    backgroundColor: "#f0f7ff",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 8,
  },
  rightHeaderColumn: {
    alignItems: "flex-end",
    justifyContent: "flex-start",
    marginLeft: 8,
    position: "relative",
    zIndex: 60,
    elevation: 12,
  },
  cardMenuButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  cardActionMenu: {
    position: "relative",
    alignSelf: "flex-end",
    marginTop: 8,
    width: 150,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#eaeaea",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 24,
    zIndex: 999,
  },
  cardActionMenuItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  cardActionMenuItemPressed: {
    backgroundColor: "#f5f5f5",
  },
  cardActionMenuText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  cardActionMenuMessage: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 12,
    color: "#666",
    lineHeight: 16,
  },
  cardActionMenuConfirm: {
    paddingTop: 6,
    paddingBottom: 2,
  },
  cardActionMenuConfirmRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  cardActionMenuConfirmButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#f5f5f5",
    borderWidth: 1,
    borderColor: "#e5e5e5",
    alignItems: "center",
  },
  cardActionMenuConfirmDangerButton: {
    borderColor: "#FF3B30",
  },
  cardActionMenuConfirmText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#333",
  },
  cardActionMenuDivider: {
    height: 1,
    backgroundColor: "#f0f0f0",
  },
  scoreValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#007AFF",
  },
  scoreLabel: {
    fontSize: 10,
    color: "#007AFF",
    fontWeight: "500",
  },
  bio: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
    marginBottom: 12,
  },
  cardActions: {
    flexDirection: "row",
    gap: 8,
  },
  viewMoreButton: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#f0f7ff",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#007AFF",
  },
  viewMoreButtonText: {
    color: "#007AFF",
    fontSize: 14,
    fontWeight: "600",
    marginRight: 4,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: "600",
    color: "#999",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#aaa",
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
  },
  filterSection: {
    marginBottom: 24,
  },
  filterLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  filterValue: {
    color: "#007AFF",
  },
  distanceChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  ratingFilters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    gap: 4,
  },
  filterChipActive: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  filterChipTextActive: {
    color: "#fff",
  },
  clearFiltersButton: {
    padding: 12,
    alignItems: "center",
  },
  clearFiltersText: {
    fontSize: 14,
    color: "#FF3B30",
    fontWeight: "600",
  },
  applyButton: {
    backgroundColor: "#007AFF",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  applyButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
});
