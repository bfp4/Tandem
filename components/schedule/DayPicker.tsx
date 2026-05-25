import { DAYS } from '@/utils/scheduleDays';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { styles } from '@/app/(tabs)/history.styles';

interface DayPickerProps {
  selected: string[];
  onToggle: (day: string) => void;
}

export default function DayPicker({ selected, onToggle }: DayPickerProps) {
  return (
    <View style={styles.daysRow}>
      {DAYS.map((d) => (
        <TouchableOpacity
          key={d}
          style={[styles.dayChip, selected.includes(d) && styles.dayChipSelected]}
          onPress={() => onToggle(d)}
        >
          <Text
            style={[
              styles.dayChipText,
              selected.includes(d) && styles.dayChipTextSelected,
            ]}
          >
            {d}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
