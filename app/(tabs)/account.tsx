import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../../config/firebase';


export default function AccountScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [bank, setBank] = useState('');
  const [activeRole, setActiveRole] = useState('');
  const [createdAtText, setCreatedAtText] = useState('');
  const [starRating, setStarRating] = useState('');
  const [carModel, setCarModel] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [carPhoto, setCarPhoto] = useState(''); 
  const [photoMessage, setPhotoMessage] = useState('');



  useEffect(() => {
    loadProfile();
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        const data = snap.data();
        setName(data.name || '');
        setBio(data.bio || '');
        setUsername(data.username || '');
        setPhone(data.phone || '');
        setAddress(data.address || '');
        setBank(data.bank?.info || '');
        setActiveRole(data.activeRole || '');
        setStarRating(
          data.starRating !== undefined && data.starRating !== null
            ? String(data.starRating)
            : ''
        );

        if (data.createdAt?.toDate) {
          setCreatedAtText(data.createdAt.toDate().toLocaleDateString());
        } else {
          setCreatedAtText('');
        }

        if (data.carDetails) {
          setCarModel(data.carDetails.model || '');
          setLicensePlate(data.carDetails.licensePlate || '');
          setCarPhoto(data.carDetails.photo || '');
        } else {
          setCarModel('');
          setLicensePlate('');
          setCarPhoto('');
        }

      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const docRef = doc(db, 'users', user.uid);
      await setDoc(docRef, { 
        name: name.trim(),
        bio: bio.trim(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      Alert.alert('Success', 'Profile saved!');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  

  

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.replace('../login' as any);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleNotificationsPress = () => {
    Alert.alert('Notifications', 'Notification settings coming soon.');
  };

  const handleAppearancePress = () => {
    Alert.alert('Appearance', 'Theme settings coming soon.');
  };

  const handlePlaceSettingsPress = () => {
    Alert.alert('Place Settings', 'Place settings coming soon.');
  };

  const handlePrivacyPress = () => {
    Alert.alert('Privacy', 'Privacy settings coming soon.');
  };

  const handleAccountHelpPress = () => {
    Alert.alert('Account Help', 'Account support options coming soon.');
  };

  const handleCancelAccountPress = () => {
    Alert.alert(
      'Cancel Account',
      'Account cancellation is not connected yet. This would be a permanent action.',
      [
        { text: 'Go Back', style: 'cancel' },
        { text: 'Understood', style: 'destructive' },
      ]
    );
  };
  const handleEditPhotoPress = () => {
    setPhotoMessage('Profile photo upload is not connected yet.');
  };
  
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <View style={styles.content}>
      <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={48} color="#999" />
          </View>
          <TouchableOpacity style={styles.editAvatarButton} onPress={handleEditPhotoPress}>
            <Ionicons name="camera" size={20} color="#007AFF" />
          </TouchableOpacity>
        </View>

        {photoMessage ? (
          <Text style={styles.photoMessage}>{photoMessage}</Text>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your name"
            value={name}
            onChangeText={setName}
            placeholderTextColor="#999"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Bio</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Tell us about yourself"
            value={bio}
            onChangeText={setBio}
            multiline
            numberOfLines={4}
            placeholderTextColor="#999"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Email</Text>
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>{user?.email}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Password</Text>
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>••••••••</Text>
          </View>
        </View>          
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Username</Text>
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>{username || 'Not added yet'}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Phone</Text>
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>{phone || 'Not added yet'}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Address</Text>
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>{address || 'Not added yet'}</Text>
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Bank</Text>
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              {bank ? `****${bank.slice(-4)}` : 'Not added yet'}
            </Text>
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Role</Text>
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>{activeRole || 'Not added yet'}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Star Rating</Text>
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>{starRating || 'Not added yet'}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>User ID</Text>
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>{user?.uid || 'Not available'}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Date Created</Text>
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>{createdAtText || 'Not available'}</Text>
          </View>
        </View>
        {activeRole === 'driver' && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Car Model</Text>
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>{carModel || 'Not added yet'}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>License Plate</Text>
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>{licensePlate || 'Not added yet'}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Car Photo</Text>
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  {carPhoto ? 'Car photo uploaded' : 'No car photo uploaded yet'}
                </Text>
              </View>
            </View>
          </>
        )}


        <TouchableOpacity 
          style={styles.saveButton} 
          onPress={handleSaveProfile}
          disabled={loading}
        >
          <Ionicons name="save" size={20} color="#fff" />
          <Text style={styles.saveButtonText}>
          {loading ? 'Saving...' : 'Save Profile'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.settingsGroupTitle}>Preferences</Text>
        <View style={styles.settingsSection}>
          <TouchableOpacity style={styles.settingItem} onPress={handleNotificationsPress}>
            <Ionicons name="notifications-outline" size={24} color="#333" />
            <Text style={styles.settingText}>Notifications</Text>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem} onPress={handleAppearancePress}>
            <Ionicons name="contrast-outline" size={24} color="#333" />
            <Text style={styles.settingText}>Appearance</Text>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem} onPress={handlePlaceSettingsPress}>
            <Ionicons name="location-outline" size={24} color="#333" />
            <Text style={styles.settingText}>Place Settings</Text>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>
        </View>

        <Text style={styles.settingsGroupTitle}>Account & Safety</Text>
        <View style={styles.settingsSection}>
          <TouchableOpacity style={styles.settingItem} onPress={handlePrivacyPress}>
            <Ionicons name="shield-outline" size={24} color="#333" />
            <Text style={styles.settingText}>Privacy</Text>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem} onPress={handleAccountHelpPress}>
            <Ionicons name="help-circle-outline" size={24} color="#333" />
            <Text style={styles.settingText}>Account Help</Text>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem} onPress={handleCancelAccountPress}>
            <Ionicons name="trash-outline" size={24} color="#ff3b30" />
            <Text style={styles.settingDangerText}>Cancel Account</Text>
            <Ionicons name="chevron-forward" size={20} color="#ffb3ad" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutButtonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  content: {
    padding: 16,
  },
  avatarContainer: {
    alignItems: 'center',
    marginVertical: 24,
  },
  photoMessage: {
    marginTop: -4,
    marginBottom: 16,
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: '50%',
    marginRight: -50,
    backgroundColor: '#fff',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    transform: [{ translateX: 32 }],
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    color: '#333',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
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
  
  saveButton: {
    flexDirection: 'row',
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    gap: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  settingsSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 24,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
  },
  signOutButton: {
    backgroundColor: '#ff3b30',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 32,
  },
  signOutButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },

  settingsGroupTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#666',
    marginBottom: 8,
    marginTop: 8,
    marginLeft: 4,
  },
  settingDangerText: {
    flex: 1,
    fontSize: 16,
    color: '#ff3b30',
    marginLeft: 12,
    fontWeight: '500',
  },
});
