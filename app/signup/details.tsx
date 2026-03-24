import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../../config/firebase';

type Role = 'driver' | 'rider';

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

  const toggleRole = (role: Role) => {
    setRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
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

  const handleContinue = async () => {
    if (!username.trim()) return Alert.alert('Required', 'Username is required.');
    if (!name.trim()) return Alert.alert('Required', 'Full name is required.');
    if (!phone.trim()) return Alert.alert('Required', 'Phone number is required.');
    if (!address.trim()) return Alert.alert('Required', 'Address is required.');
    if (!bio.trim()) return Alert.alert('Required', 'Bio is required.');
    if (roles.length === 0) return Alert.alert('Required', 'Please select at least one role.');

    const uid = auth.currentUser?.uid;
    const email = auth.currentUser?.email ?? '';
    if (!uid) {
      Alert.alert('Error', 'No authenticated user found. Please sign in again.');
      return;
    }

    setLoading(true);
    try {
      let profilePhotoUrl = '';
      if (photoUri) {
        profilePhotoUrl = await uploadPhoto(photoUri, uid);
      }

      await setDoc(
        doc(db, 'users', uid),
        {
          username: username.trim(),
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
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              Username <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. johndoe"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              placeholderTextColor="#bbb"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              Full Name <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. John Doe"
              value={name}
              onChangeText={setName}
              placeholderTextColor="#bbb"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              Phone Number <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. (555) 000-0000"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholderTextColor="#bbb"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              Address <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 123 Main St, City, State"
              value={address}
              onChangeText={setAddress}
              placeholderTextColor="#bbb"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              Bio <Text style={styles.required}>*</Text>
            </Text>
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
            <View style={styles.roleRow}>
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
  input: {
    backgroundColor: '#f7f7f7',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#ebebeb',
    color: '#111',
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
