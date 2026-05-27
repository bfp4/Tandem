import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

interface ReadOnlyFieldProps {
  label: string;
  value: string;
  fallback?: string;
  style?: ViewStyle;
  children?: React.ReactNode;
}

export default function ReadOnlyField({
  label,
  value,
  fallback = 'Not available',
  style,
  children,
}: ReadOnlyFieldProps) {
  return (
    <View style={[styles.section, style]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.infoBox}>
        {children ?? (
          <Text style={styles.infoText}>{value || fallback}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
  },
  infoBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  infoText: {
    fontSize: 16,
    color: '#333',
  },
});
