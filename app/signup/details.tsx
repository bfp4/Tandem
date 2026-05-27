import AddressAutocompleteInput from '@/components/AddressAutocompleteInput';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { geohashForLocation } from 'geofire-common';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { uriToBlob } from '../../utils/uriToBlob';
import { isValidPhone } from '@/utils/validation';
import { ACCENT, PLACEHOLDER, RED, TEXT_INVERSE, TEXT_MUTED, TEXT_PRIMARY } from '@/utils/constants';

type Role = 'driver' | 'rider';

interface FieldErrors {
  username?: string;
  name?: string;
  phone?: string;
  address?: string;
  roles?: string;
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
    const blob = await uriToBlob(uri);
    const storageRef = ref(storage, `profilePhotos/${uid}`);
    await uploadBytes(storageRef, blob);
    return await getDownloadURL(storageRef);
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
                <Ionicons name="camera-outline" size={32} color={TEXT_MUTED} />
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
              placeholderTextColor={PLACEHOLDER}
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
              placeholderTextColor={PLACEHOLDER}
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
              placeholderTextColor={PLACEHOLDER}
            />
            {errors.phone ? <Text style={styles.errorText}>{errors.phone}</Text> : null}
          </View>

          <AddressAutocompleteInput
            label="Address"
            required
            value={address}
            placeholder="e.g. 123 Main St, City, State"
            minQueryLength={3}
            selectionLabel="full"
            streetLevelOnly
            error={errors.address}
            onChangeText={(text) => {
              setAddress(text);
              setSelectedCoords(null);
              if (errors.address) setErrors((prev) => ({ ...prev, address: undefined }));
            }}
            onSelect={(addr, lat, lng) => {
              setAddress(addr);
              if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
                setSelectedCoords({ lat, lng });
              }
              setErrors((prev) => ({ ...prev, address: undefined }));
            }}
          />

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
              placeholderTextColor={PLACEHOLDER}
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
                    <Ionicons name="checkmark-circle" size={20} color={ACCENT} />
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
                    <Ionicons name="checkmark-circle" size={20} color={ACCENT} />
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
            <ActivityIndicator color={TEXT_INVERSE} />
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
    color: ACCENT,
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
    color: TEXT_MUTED,
    marginTop: 4,
  },
  changePhotoText: {
    color: ACCENT,
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
    color: TEXT_PRIMARY,
    marginBottom: 8,
  },
  required: {
    color: RED,
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
    color: RED,
    fontSize: 12,
    marginTop: 5,
    marginLeft: 2,
  },
  bioInput: {
    height: 100,
    paddingTop: 14,
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
    color: TEXT_PRIMARY,
    marginTop: 8,
    marginBottom: 2,
  },
  roleLabelSelected: {
    color: ACCENT,
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
    color: TEXT_INVERSE,
    fontSize: 17,
    fontWeight: '700',
  },
});

