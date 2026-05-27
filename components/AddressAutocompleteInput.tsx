import { ACCENT, GREEN, RED, TEXT_PRIMARY, TEXT_SECONDARY } from '@/utils/constants';
import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import {
  formatNominatimShortLabel,
  searchNominatim,
  type NominatimResult,
} from '@/utils/nominatim';

interface AddressAutocompleteInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onSelect: (address: string, lat: number, lng: number) => void;
  placeholder?: string;
  returnKeyType?: TextInputProps['returnKeyType'];
  required?: boolean;
  error?: string;
  minQueryLength?: number;
  selectionLabel?: 'short' | 'full';
  streetLevelOnly?: boolean;
  containerStyle?: ViewStyle;
}

export default function AddressAutocompleteInput({
  label,
  value,
  onChangeText,
  onSelect,
  placeholder,
  returnKeyType,
  required,
  error,
  minQueryLength = 4,
  selectionLabel = 'short',
  streetLevelOnly = false,
  containerStyle,
}: AddressAutocompleteInputProps) {
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [fetching, setFetching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = async (q: string) => {
    if (q.trim().length < minQueryLength) {
      setSuggestions([]);
      return;
    }
    setFetching(true);
    try {
      const results = await searchNominatim(q, {
        limit: streetLevelOnly ? 8 : 5,
        streetLevelOnly,
        featuretype: streetLevelOnly ? 'house' : undefined,
      });
      setSuggestions(results);
    } catch {
      setSuggestions([]);
    } finally {
      setFetching(false);
    }
  };

  const handleChange = (text: string) => {
    onChangeText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(text), 400);
  };

  const handleSelect = (item: NominatimResult) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const address =
      selectionLabel === 'full'
        ? item.display_name
        : formatNominatimShortLabel(item);
    onSelect(address, parseFloat(item.lat), parseFloat(item.lon));
    setSuggestions([]);
  };

  return (
    <View style={containerStyle}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <View style={[styles.inputRow, error ? styles.inputRowError : null]}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={handleChange}
          placeholder={placeholder}
          placeholderTextColor="#bbb"
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType={returnKeyType}
        />
        {fetching ? (
          <ActivityIndicator
            size="small"
            color={ACCENT}
            style={styles.spinner}
          />
        ) : null}
      </View>
      {suggestions.length > 0 ? (
        <View style={styles.suggestionsList}>
          {suggestions.map((item, idx) => (
            <TouchableOpacity
              key={item.place_id ?? `${item.lat}-${item.lon}-${idx}`}
              style={[
                styles.suggestionItem,
                idx === suggestions.length - 1 && styles.suggestionItemLast,
              ]}
              onPress={() => handleSelect(item)}
            >
              <Ionicons name="location-outline" size={15} color={ACCENT} />
              <Text style={styles.suggestionText} numberOfLines={2}>
                {selectionLabel === 'full'
                  ? item.display_name
                  : formatNominatimShortLabel(item)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3c3c43',
    marginBottom: 6,
    marginTop: 16,
  },
  required: {
    color: '#FF3B30',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f2f2f7',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e5ea',
  },
  inputRowError: {
    borderColor: '#FF3B30',
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: TEXT_PRIMARY,
  },
  spinner: {
    position: 'absolute',
    right: 12,
  },
  suggestionsList: {
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e5ea',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f7',
  },
  suggestionItemLast: {
    borderBottomWidth: 0,
  },
  suggestionText: {
    flex: 1,
    fontSize: 14,
    color: TEXT_PRIMARY,
    lineHeight: 19,
  },
  errorText: {
    fontSize: 12,
    color: '#FF3B30',
    marginTop: 4,
  },
});
