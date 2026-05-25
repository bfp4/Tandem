import { GREEN, RED, TEXT_SECONDARY } from '@/utils/constants';
import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

interface RouteAddressBlockProps {
  pickup: string;
  dropoff: string;
  numberOfLines?: number;
  style?: ViewStyle;
}

export default function RouteAddressBlock({
  pickup,
  dropoff,
  numberOfLines = 1,
  style,
}: RouteAddressBlockProps) {
  return (
    <View style={[styles.block, style]}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: GREEN }]} />
        <Text style={styles.text} numberOfLines={numberOfLines}>
          {pickup}
        </Text>
      </View>
      <View style={styles.connector} />
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: RED }]} />
        <Text style={styles.text} numberOfLines={numberOfLines}>
          {dropoff}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    paddingLeft: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  text: {
    flex: 1,
    fontSize: 13,
    color: TEXT_SECONDARY,
    lineHeight: 18,
  },
  connector: {
    width: 2,
    height: 14,
    backgroundColor: '#E5E7EB',
    marginLeft: 4,
    marginVertical: 2,
  },
});
