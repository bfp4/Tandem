import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, type ViewStyle } from 'react-native';

interface MenuListItemProps {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  chevronColor?: string;
  danger?: boolean;
  style?: ViewStyle;
}

export default function MenuListItem({
  label,
  onPress,
  icon,
  iconColor = '#333',
  chevronColor = '#999',
  danger,
  style,
}: MenuListItemProps) {
  return (
    <TouchableOpacity style={[styles.item, style]} onPress={onPress}>
      {icon && (
        <Ionicons
          name={icon}
          size={24}
          color={danger ? '#ff3b30' : iconColor}
          style={styles.icon}
        />
      )}
      <Text style={[styles.text, danger && styles.dangerText]}>{label}</Text>
      <Ionicons
        name="chevron-forward"
        size={20}
        color={danger ? '#ffb3ad' : chevronColor}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  icon: {
    marginRight: 12,
  },
  text: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  dangerText: {
    color: '#ff3b30',
  },
});
