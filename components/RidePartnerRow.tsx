import Avatar from '@/components/Avatar';
import StarRating from '@/components/StarRating';
import type { User as AppUser } from '@/types/user';
import { parseStarRating, STAR_COLOR, TEXT_MUTED } from '@/utils/constants';
import { normalizeProfilePhotoUrl } from '@/utils/profilePhoto';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { styles } from '@/app/(tabs)/home.styles';

interface RidePartnerRowProps {
  user: AppUser;
  onPress: () => void;
  style?: ViewStyle;
}

export default function RidePartnerRow({
  user,
  onPress,
  style,
}: RidePartnerRowProps) {
  return (
    <TouchableOpacity style={[styles.profileRow, style]} onPress={onPress}>
      <Avatar uri={normalizeProfilePhotoUrl(user.profilePhoto)} size={36} />
      <View style={styles.profileInfo}>
        <Text style={styles.profileName}>{user.name}</Text>
        <View style={styles.ratingRow}>
          <StarRating
            rating={parseStarRating(user.starRating)}
            size={12}
            showValue
            filledColor={STAR_COLOR}
          />
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
    </TouchableOpacity>
  );
}
