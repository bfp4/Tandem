import { TEXT_TERTIARY } from '@/utils/constants';
import { format12h, TIME_OPTIONS } from '@/utils/format12h';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, Text, TouchableOpacity } from 'react-native';
import { styles } from '@/app/(tabs)/history.styles';

interface TimeDropdownProps {
  label: string;
  value: string;
  show: boolean;
  onToggle: () => void;
  onSelect: (time: string) => void;
}

export default function TimeDropdown({
  label,
  value,
  show,
  onToggle,
  onSelect,
}: TimeDropdownProps) {
  return (
    <>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity style={styles.dropdown} onPress={onToggle}>
        <Text style={styles.dropdownText}>{format12h(value)}</Text>
        <Ionicons name="chevron-down" size={18} color={TEXT_TERTIARY} />
      </TouchableOpacity>
      {show ? (
        <ScrollView style={styles.dropdownMenu} nestedScrollEnabled>
          {TIME_OPTIONS.map((t) => (
            <TouchableOpacity
              key={t}
              style={styles.dropdownItem}
              onPress={() => onSelect(t)}
            >
              <Text style={styles.dropdownItemText}>{format12h(t)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}
    </>
  );
}
