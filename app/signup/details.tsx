import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { geohashForLocation } from 'geofire-common';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db, storage } from '../../config/firebase';

type Role = 'driver' | 'rider';

interface FieldErrors {
  username?: string;
  name?: string;
  phone?: string;
  address?: string;
  roles?: string;
}

interface AddressSuggestion {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  class?: string;
}

function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

export default function UserDetailsScreen() {
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [bio, setBio] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const addressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(null);

  const toggleRole = (role: Role) => {
    setRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
    if (errors.roles) setErrors(prev => ({ ...prev, roles: undefined }));
  };

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const uploadPhoto = async (uri: string, uid: string): Promise<string> => {
    const response = await fetch(uri);
    const blob = await response.blob();
    const storageRef = ref(storage, `profilePhotos/${uid}`);
    await uploadBytes(storageRef, blob);
    return await getDownloadURL(storageRef);
  };

  const onAddressChange = useCallback((text: string) => {
    setAddress(text);
    setSelectedCoords(null);
    if (errors.address) setErrors(prev => ({ ...prev, address: undefined }));
    setAddressSuggestions([]);

    if (addressDebounceRef.current) clearTimeout(addressDebounceRef.current);

    if (text.trim().length < 3) return;

    addressDebounceRef.current = setTimeout(async () => {
      setAddressLoading(true);
      try {
        const encoded = encodeURIComponent(text.trim());
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&addressdetails=1&limit=8&featuretype=house`,
          { headers: { 'Accept-Language': 'en', 'User-Agent': 'HuberApp/1.0' } }
        );
        const raw: AddressSuggestion[] = await res.json();
        // Keep only street-level results (houses, buildings, roads)
        const streetTypes = new Set(['house', 'building', 'residential', 'road', 'street', 'place']);
        const filtered = raw.filter(r => streetTypes.has(r.type ?? '') || r.class === 'building' || r.class === 'highway');
        setAddressSuggestions(filtered.length > 0 ? filtered : raw.slice(0, 5));
      } catch {
        // silently ignore lookup failures
      } finally {
        setAddressLoading(false);
      }
    }, 400);
  }, [errors.address]);

  const selectAddress = (suggestion: AddressSuggestion) => {
    setAddress(suggestion.display_name);
    setAddressSuggestions([]);
    setErrors(prev => ({ ...prev, address: undefined }));
    const lat = parseFloat(suggestion.lat);
    const lng = parseFloat(suggestion.lon);
    if (!isNaN(lat) && !isNaN(lng)) {
      setSelectedCoords({ lat, lng });
    }
  };

  const onAddressManualChange = () => {
    setSelectedCoords(null);
  };

  const validate = async (): Promise<boolean> => {
    const newErrors: FieldErrors = {};

    if (!username.trim()) {
      newErrors.username = 'Username is required.';
    } else if (!/^[a-zA-Z0-9_]{3,20}$/.test(username.trim())) {
      newErrors.username = 'Username must be 3–20 characters (letters, numbers, underscores).';
    } else {
      try {
        const q = query(collection(db, 'users'), where('username', '==', username.trim().toLowerCase()));
        const snap = await getDocs(q);
        const takenByOther = snap.docs.some(d => d.id !== auth.currentUser?.uid);
        if (takenByOther) {
          newErrors.username = 'That username is already taken.';
        }
      } catch {
        // If the uniqueness check fails (e.g. permissions), skip it — Firestore write will catch real conflicts
      }
    }

    if (!name.trim()) {
      newErrors.name = 'Full name is required.';
    }

    if (!phone.trim()) {
      newErrors.phone = 'Phone number is required.';
    } else if (!isValidPhone(phone)) {
      newErrors.phone = 'Enter a valid phone number (at least 10 digits).';
    }

    if (!address.trim()) {
      newErrors.address = 'Address is required.';
    }

    if (roles.length === 0) {
      newErrors.roles = 'Please select at least one role.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      Alert.alert('Error', 'No authenticated user found. Please sign in again.');
      return;
    }

    // Run validation before showing loading state so errors are visible
    const valid = await validate();
    if (!valid) return;

    setLoading(true);
    try {

      let profilePhotoUrl = '';
      if (photoUri) {
        profilePhotoUrl = await uploadPhoto(photoUri, uid);
      }

      const email = auth.currentUser?.email ?? '';

      const geohash = selectedCoords
        ? geohashForLocation([selectedCoords.lat, selectedCoords.lng])
        : '';

      await setDoc(
        doc(db, 'users', uid),
        {
          uid,
          username: username.trim().toLowerCase(),
          name: name.trim(),
          email,
          phone: phone.trim(),
          address: address.trim(),
          bio: bio.trim(),
          profilePhoto: profilePhotoUrl,
          roles,
          activeRole: roles[0],
          starRating: 0,
          rideCount: 0,
          bankInfo: {},
          fcmToken: '',
          profileComplete: false,
          missingFields: [],
          geohash,
          ...(selectedCoords ? { lat: selectedCoords.lat, lng: selectedCoords.lng } : {}),
          createdAt: serverTimestamp(),
          carDetails: null,
        },
        { merge: true }
      );

      if (roles.includes('driver')) {
        router.replace('/signup/car-details' as any);
      } else {
        router.replace('/(tabs)/home' as any);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.stepLabel}>Step 2 of 3</Text>
          <Text style={styles.title}>Your Details</Text>
          <Text style={styles.subtitle}>Tell us a bit about yourself</Text>
        </View>

        {/* Profile Photo */}
        <View style={styles.photoSection}>
          <TouchableOpacity style={styles.photoPicker} onPress={pickPhoto}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photoPreview} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Ionicons name="camera-outline" size={32} color="#999" />
                <Text style={styles.photoPlaceholderText}>Add Photo</Text>
              </View>
            )}
          </TouchableOpacity>
          {photoUri && (
            <TouchableOpacity onPress={pickPhoto}>
              <Text style={styles.changePhotoText}>Change photo</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Form Fields */}
        <View style={styles.form}>
          {/* Username */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              Username <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, errors.username ? styles.inputError : null]}
              placeholder="e.g. johndoe"
              value={username}
              onChangeText={t => {
                setUsername(t);
                if (errors.username) setErrors(prev => ({ ...prev, username: undefined }));
              }}
              autoCapitalize="none"
              placeholderTextColor="#bbb"
            />
            {errors.username ? <Text style={styles.errorText}>{errors.username}</Text> : null}
          </View>

          {/* Full Name */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              Full Name <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, errors.name ? styles.inputError : null]}
              placeholder="e.g. John Doe"
              value={name}
              onChangeText={t => {
                setName(t);
                if (errors.name) setErrors(prev => ({ ...prev, name: undefined }));
              }}
              placeholderTextColor="#bbb"
            />
            {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}
          </View>

          {/* Phone */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              Phone Number <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, errors.phone ? styles.inputError : null]}
              placeholder="e.g. 5550000000"
              value={phone}
              onChangeText={t => {
                const digitsOnly = t.replace(/\D/g, '').slice(0, 15);
                setPhone(digitsOnly);
                if (errors.phone) setErrors(prev => ({ ...prev, phone: undefined }));
              }}
              keyboardType="phone-pad"
              inputMode="numeric"
              placeholderTextColor="#bbb"
            />
            {errors.phone ? <Text style={styles.errorText}>{errors.phone}</Text> : null}
          </View>

          {/* Address with autocomplete */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              Address <Text style={styles.required}>*</Text>
            </Text>
            <View>
              <View style={[styles.addressInputRow, errors.address ? styles.inputError : null]}>
                <TextInput
                  style={styles.addressInput}
                  placeholder="e.g. 123 Main St, City, State"
                  value={address}
                  onChangeText={onAddressChange}
                  placeholderTextColor="#bbb"
                />
                {addressLoading && (
                  <ActivityIndicator size="small" color="#007AFF" style={styles.addressSpinner} />
                )}
              </View>
              {addressSuggestions.length > 0 && (
                <View style={styles.suggestionsContainer}>
                  <FlatList
                    data={addressSuggestions}
                    keyExtractor={item => String(item.place_id)}
                    keyboardShouldPersistTaps="handled"
                    scrollEnabled={false}
                    renderItem={({ item, index }) => (
                      <TouchableOpacity
                        style={[
                          styles.suggestionItem,
                          index < addressSuggestions.length - 1 && styles.suggestionItemBorder,
                        ]}
                        onPress={() => selectAddress(item)}
                      >
                        <Ionicons name="location-outline" size={14} color="#888" style={styles.suggestionIcon} />
                        <Text style={styles.suggestionText} numberOfLines={2}>
                          {item.display_name}
                        </Text>
                      </TouchableOpacity>
                    )}
                  />
                </View>
              )}
            </View>
            {errors.address ? <Text style={styles.errorText}>{errors.address}</Text> : null}
          </View>

          {/* Bio (optional) */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Bio <Text style={styles.optional}>(optional)</Text></Text>
            <TextInput
              style={[styles.input, styles.bioInput]}
              placeholder="Tell riders/drivers about yourself..."
              value={bio}
              onChangeText={setBio}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              placeholderTextColor="#bbb"
            />
          </View>

          {/* Role Selection */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              I want to be a <Text style={styles.required}>*</Text>
            </Text>
            <Text style={styles.roleHint}>Select all that apply</Text>
            <View style={[styles.roleRow, errors.roles ? styles.roleRowError : null]}>
              <TouchableOpacity
                style={[
                  styles.roleCard,
                  roles.includes('rider') && styles.roleCardSelected,
                ]}
                onPress={() => toggleRole('rider')}
              >
                <Ionicons
                  name="person-outline"
                  size={28}
                  color={roles.includes('rider') ? '#007AFF' : '#888'}
                />
                <Text
                  style={[
                    styles.roleLabel,
                    roles.includes('rider') && styles.roleLabelSelected,
                  ]}
                >
                  Rider
                </Text>
                <Text style={styles.roleDescription}>Request rides</Text>
                {roles.includes('rider') && (
                  <View style={styles.roleCheck}>
                    <Ionicons name="checkmark-circle" size={20} color="#007AFF" />
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.roleCard,
                  roles.includes('driver') && styles.roleCardSelected,
                ]}
                onPress={() => toggleRole('driver')}
              >
                <Ionicons
                  name="car-outline"
                  size={28}
                  color={roles.includes('driver') ? '#007AFF' : '#888'}
                />
                <Text
                  style={[
                    styles.roleLabel,
                    roles.includes('driver') && styles.roleLabelSelected,
                  ]}
                >
                  Driver
                </Text>
                <Text style={styles.roleDescription}>Offer rides</Text>
                {roles.includes('driver') && (
                  <View style={styles.roleCheck}>
                    <Ionicons name="checkmark-circle" size={20} color="#007AFF" />
                  </View>
                )}
              </TouchableOpacity>
            </View>
            {errors.roles ? <Text style={styles.errorText}>{errors.roles}</Text> : null}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.continueButton, loading && styles.continueButtonDisabled]}
          onPress={handleContinue}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.continueButtonText}>
              {roles.includes('driver') ? 'Continue' : 'Get Started'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 48,
  },
  header: {
    marginBottom: 28,
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#111',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: '#888',
  },
  photoSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  photoPicker: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: 'hidden',
    marginBottom: 8,
  },
  photoPreview: {
    width: 100,
    height: 100,
  },
  photoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  photoPlaceholderText: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  changePhotoText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '500',
  },
  form: {
    gap: 4,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  required: {
    color: '#FF3B30',
  },
  optional: {
    color: '#aaa',
    fontWeight: '400',
  },
  input: {
    backgroundColor: '#f7f7f7',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#ebebeb',
    color: '#111',
  },
  inputError: {
    borderColor: '#FF3B30',
    borderWidth: 1.5,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 12,
    marginTop: 5,
    marginLeft: 2,
  },
  bioInput: {
    height: 100,
    paddingTop: 14,
  },
  addressInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f7f7f7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ebebeb',
    paddingHorizontal: 14,
  },
  addressInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: '#111',
  },
  addressSpinner: {
    marginLeft: 8,
  },
  suggestionsContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginTop: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  suggestionItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  suggestionIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  suggestionText: {
    flex: 1,
    fontSize: 13,
    color: '#333',
    lineHeight: 18,
  },
  roleHint: {
    fontSize: 12,
    color: '#aaa',
    marginBottom: 10,
    marginTop: -4,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 14,
  },
  roleRowError: {
    borderWidth: 1.5,
    borderColor: '#FF3B30',
    borderRadius: 14,
    padding: 4,
  },
  roleCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    padding: 16,
    alignItems: 'center',
    position: 'relative',
    backgroundColor: '#fafafa',
  },
  roleCardSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#EBF4FF',
  },
  roleLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginTop: 8,
    marginBottom: 2,
  },
  roleLabelSelected: {
    color: '#007AFF',
  },
  roleDescription: {
    fontSize: 12,
    color: '#888',
  },
  roleCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  continueButton: {
    backgroundColor: '#007AFF',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  continueButtonDisabled: {
    opacity: 0.6,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
});
