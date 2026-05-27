import { CARD_BG } from '@/utils/constants';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface RidesListSkeletonProps {
  count?: number;
}

export default function RidesListSkeleton({ count = 3 }: RidesListSkeletonProps) {
  return (
    <View style={styles.wrap}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.card}>
          <View style={styles.shimmerRow}>
            <View style={[styles.pill, styles.shimmer]} />
            <View style={[styles.pillSm, styles.shimmer]} />
          </View>
          <View style={[styles.line, styles.shimmer]} />
          <View style={[styles.lineShort, styles.shimmer]} />
          <View style={[styles.line, styles.shimmer]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 12, gap: 12, flex: 1 },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  shimmerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pill: {
    height: 22,
    width: '42%',
    borderRadius: 11,
    backgroundColor: '#E5E7EB',
  },
  pillSm: {
    height: 22,
    width: 72,
    borderRadius: 11,
    backgroundColor: '#E5E7EB',
  },
  line: {
    height: 14,
    width: '100%',
    borderRadius: 7,
    backgroundColor: '#EEF0F2',
  },
  lineShort: {
    height: 14,
    width: '55%',
    borderRadius: 7,
    backgroundColor: '#EEF0F2',
  },
  shimmer: { opacity: 0.85 },
});
