import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

interface AvatarProps {
  uri?: string | null;
  size?: number;
  iconSize?: number;
  style?: ViewStyle;
}

export default function Avatar({
  uri,
  size = 52,
  iconSize,
  style,
}: AvatarProps) {
  const resolvedIconSize = iconSize ?? Math.round(size * 0.55);
  const borderRadius = size / 2;

  return (
    <View
      style={[
        styles.container,
        { width: size, height: size, borderRadius },
        style,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={styles.image}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <Ionicons name="person" size={resolvedIconSize} color="#999" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
