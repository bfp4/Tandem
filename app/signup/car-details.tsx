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
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../../config/firebase';
import { uriToBlob } from '../../utils/uriToBlob';
import { ACCENT, PLACEHOLDER, RED, TEXT_INVERSE, TEXT_MUTED, TEXT_PRIMARY } from '@/utils/constants';

export default function CarDetailsScreen() {
  const router = useRouter();

  const [licensePlate, setLicensePlate] = useState('');
  const [model, setModel] = useState('');
  const [carPhotoUri, setCarPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pickCarPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setCarPhotoUri(result.assets[0].uri);
    }
  };

  const uploadCarPhoto = async (uri: string, uid: string): Promise<string> => {
    const blob = await uriToBlob(uri);
    const storageRef = ref(storage, `carPhotos/${uid}`);
    await uploadBytes(storageRef, blob);
    return await getDownloadURL(storageRef);
  };

  const handleSave = async () => {
    if (!licensePlate.trim()) return Alert.alert('Required', 'License plate is required.');
    if (!model.trim()) return Alert.alert('Required', 'Car model is required.');

    const uid = auth.currentUser?.uid;
    if (!uid) {
      Alert.alert('Error', 'No authenticated user found.');
      return;
    }

    setLoading(true);
    try {
      let carPhotoUrl = '';
      if (carPhotoUri) {
        carPhotoUrl = await uploadCarPhoto(carPhotoUri, uid);
      }

      await updateDoc(doc(db, 'users', uid), {
        carDetails: {
          licensePlate: licensePlate.trim().toUpperCase(),
          model: model.trim(),
          photo: carPhotoUrl,
        },
      });

      router.replace('/(tabs)/home' as any);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    router.replace('/(tabs)/home' as any);
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
          <Text style={styles.stepLabel}>Step 3 of 3</Text>
          <Text style={styles.title}>Your Car</Text>
          <Text style={styles.subtitle}>
            Add your vehicle details so riders know what to look for
          </Text>
        </View>

        {/* Car Illustration */}
        <View style={styles.iconContainer}>
          <Ionicons name="car-sport-outline" size={80} color={ACCENT} />
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              License Plate <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, styles.plateInput]}
              placeholder="e.g. ABC 1234"
              value={licensePlate}
              onChangeText={setLicensePlate}
              autoCapitalize="characters"
              placeholderTextColor={PLACEHOLDER}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              Car Make & Model <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Toyota Camry 2022"
              value={model}
              onChangeText={setModel}
              placeholderTextColor={PLACEHOLDER}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Car Photo</Text>
            <TouchableOpacity style={styles.carPhotoPicker} onPress={pickCarPhoto}>
              {carPhotoUri ? (
                <Image source={{ uri: carPhotoUri }} style={styles.carPhotoPreview} />
              ) : (
                <View style={styles.carPhotoPlaceholder}>
                  <Ionicons name="camera-outline" size={36} color={TEXT_MUTED} />
                  <Text style={styles.carPhotoPlaceholderText}>Tap to add a car photo</Text>
                  <Text style={styles.carPhotoPlaceholderSubtext}>Optional</Text>
                </View>
              )}
            </TouchableOpacity>
            {carPhotoUri && (
              <TouchableOpacity onPress={pickCarPhoto} style={styles.changePhotoRow}>
                <Ionicons name="refresh-outline" size={15} color={ACCENT} />
                <Text style={styles.changePhotoText}>Change photo</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.saveButton, loading && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={TEXT_INVERSE} />
            ) : (
              <Text style={styles.saveButtonText}>Save & Continue</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipButton} onPress={handleSkip} disabled={loading}>
            <Text style={styles.skipButtonText}>Skip for now</Text>
          </TouchableOpacity>

          <Text style={styles.skipNote}>
            You can always add your car details later from your profile.
          </Text>
        </View>
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
    marginBottom: 24,
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
    lineHeight: 22,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 32,
    backgroundColor: '#EBF4FF',
    borderRadius: 20,
    paddingVertical: 28,
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
  input: {
    backgroundColor: '#f7f7f7',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#ebebeb',
    color: '#111',
  },
  plateInput: {
    fontWeight: '700',
    letterSpacing: 2,
    fontSize: 18,
    textTransform: 'uppercase',
  },
  carPhotoPicker: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  carPhotoPreview: {
    width: '100%',
    height: 180,
    borderRadius: 14,
  },
  carPhotoPlaceholder: {
    backgroundColor: '#f7f7f7',
    borderRadius: 14,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
    gap: 6,
  },
  carPhotoPlaceholderText: {
    fontSize: 14,
    color: '#888',
    fontWeight: '500',
  },
  carPhotoPlaceholderSubtext: {
    fontSize: 12,
    color: PLACEHOLDER,
  },
  changePhotoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  changePhotoText: {
    color: ACCENT,
    fontSize: 13,
    fontWeight: '500',
  },
  actions: {
    marginTop: 28,
    gap: 12,
  },
  saveButton: {
    backgroundColor: '#007AFF',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: TEXT_INVERSE,
    fontSize: 17,
    fontWeight: '700',
  },
  skipButton: {
    backgroundColor: '#f0f0f0',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  skipButtonText: {
    color: '#555',
    fontSize: 16,
    fontWeight: '600',
  },
  skipNote: {
    textAlign: 'center',
    fontSize: 12,
    color: '#aaa',
    lineHeight: 18,
  },
});

