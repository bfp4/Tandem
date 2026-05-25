import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

interface BackRowProps {
  label: string;
  onPress: () => void;
  color?: string;
}

export default function BackRow({
  label,
  onPress,
  color = '#6366F1',
}: BackRowProps) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <Ionicons name="chevron-back" size={20} color={color} />
      <Text style={[styles.text, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  text: {
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 4,
  },
});
