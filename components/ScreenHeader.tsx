import { CARD_BG, TEXT_PRIMARY, BORDER_DEFAULT } from '@/utils/constants';
import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

interface ScreenHeaderProps {
  title: string;
  right?: React.ReactNode;
  subtitle?: React.ReactNode;
  showBorder?: boolean;
  style?: ViewStyle;
}

export default function ScreenHeader({
  title,
  right,
  subtitle,
  showBorder = true,
  style,
}: ScreenHeaderProps) {
  return (
    <View
      style={[
        styles.header,
        showBorder && styles.headerBorder,
        style,
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
      {subtitle ? <View style={styles.subtitle}>{subtitle}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: CARD_BG,
  },
  headerBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER_DEFAULT,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 28,
    fontWeight: 'bold',
    color: TEXT_PRIMARY,
  },
  right: {
    flexShrink: 0,
  },
  subtitle: {
    marginTop: 4,
  },
});
