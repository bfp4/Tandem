import { ACCENT } from '@/utils/constants';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { scheduleStyles } from '@/app/(tabs)/home.styles';

interface ViewScheduleLinkProps {
  onPress: () => void;
}

export default function ViewScheduleLink({ onPress }: ViewScheduleLinkProps) {
  return (
    <TouchableOpacity style={scheduleStyles.button} onPress={onPress}>
      <Ionicons name="calendar" size={18} color={ACCENT} />
      <Text style={scheduleStyles.text}>View Schedule</Text>
      <Ionicons name="chevron-forward" size={16} color={ACCENT} />
    </TouchableOpacity>
  );
}
