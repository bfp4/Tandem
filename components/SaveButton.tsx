import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  type ViewStyle,
} from 'react-native';

interface SaveButtonProps {
  onPress: () => void;
  saving: boolean;
  label: string;
  savingLabel?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  style?: ViewStyle;
}

export default function SaveButton({
  onPress,
  saving,
  label,
  savingLabel,
  icon = 'save',
  disabled,
  style,
}: SaveButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.button, (saving || disabled) && styles.disabled, style]}
      onPress={onPress}
      disabled={saving || disabled}
    >
      <Ionicons name={icon} size={20} color="#fff" />
      <Text style={styles.text}>
        {saving ? (savingLabel ?? 'Saving...') : label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    gap: 8,
  },
  disabled: {
    opacity: 0.6,
  },
  text: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
