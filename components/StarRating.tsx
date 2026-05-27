import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface StarRatingProps {
  rating: number;
  maxStars?: number;
  size?: number;
  filledColor?: string;
  emptyColor?: string;
  showValue?: boolean;
  newLabel?: string;
}

export default function StarRating({
  rating,
  maxStars = 5,
  size = 14,
  filledColor = '#F5B301',
  emptyColor = '#C7C7CC',
  showValue = false,
  newLabel = 'New',
}: StarRatingProps) {
  const clamped = Math.max(0, Math.min(maxStars, rating));
  const filledCount = Math.min(maxStars, Math.max(0, Math.round(clamped)));

  return (
    <View style={styles.container}>
      <View style={styles.stars}>
        {Array.from({ length: maxStars }).map((_, idx) => (
          <Ionicons
            key={idx}
            name={idx < filledCount ? 'star' : 'star-outline'}
            size={size}
            color={clamped > 0 ? filledColor : emptyColor}
            style={idx < maxStars - 1 ? { marginRight: 2 } : undefined}
          />
        ))}
      </View>
      {showValue &&
        (clamped > 0 ? (
          <Text style={styles.value}>{clamped.toFixed(1)}</Text>
        ) : (
          <Text style={styles.newLabel}>{newLabel}</Text>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  value: {
    fontSize: 13,
    fontWeight: '700',
    color: '#444',
  },
  newLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
  },
});
