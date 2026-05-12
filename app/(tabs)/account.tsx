import { useAuth } from '@/context/AuthContext';
import {
  changeEmailWithCurrentPassword,
  changePasswordWithCurrentPassword,
} from '@/services/authService';
import { aggregateRatingForUser } from '@/services/ratingService';
import {
  getUserHistoryBlocks,
  updateUser,
  updateUserPreferences,
} from '@/services/userService';
import type { HistoryBlock } from '@/types/historyBlock';
import type { AppearancePreference, GenderPreference } from '@/types/user';
import { uriToBlob } from '@/utils/uriToBlob';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db, storage } from '../../config/firebase';

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
  const [paymentMethod, setPaymentMethod] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('');
  const [bankInfoBase, setBankInfoBase] = useState<Record<string, unknown>>({});
  const [activeRole, setActiveRole] = useState('');
  const [createdAtText, setCreatedAtText] = useState('');
  const [starRating, setStarRating] = useState('');
  const [carModel, setCarModel] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [carPhoto, setCarPhoto] = useState(''); 
  const [carPhotoPreview, setCarPhotoPreview] = useState('');
  const [carPhotoMessage, setCarPhotoMessage] = useState('');
  const [carPhotoUploading, setCarPhotoUploading] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState('');
  const [profilePhotoUploading, setProfilePhotoUploading] = useState(false);
  const [accountCenterVisible, setAccountCenterVisible] = useState(false);
  const [accountCenterView, setAccountCenterView] = useState('menu');
  const [temporaryMessage, setTemporaryMessage] = useState('');
  const [accountCenterMessage, setAccountCenterMessage] = useState('');
  const [savingPersonalDetails, setSavingPersonalDetails] = useState(false);
  const [photoMessage, setPhotoMessage] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [securityCurrentPassword, setSecurityCurrentPassword] = useState('');
  const [securityNewPassword, setSecurityNewPassword] = useState('');
  const [securityNewEmail, setSecurityNewEmail] = useState('');
  const [securitySaving, setSecuritySaving] = useState(false);
  /** Average 0–5; use parseFloat so values like 4.7 from Firestore render correctly */
  const starRatingNumeric = Math.max(
    0,
    Math.min(5, Number.parseFloat(starRating) || 0),
  );
  const starFilledCount = Math.min(5, Math.max(0, Math.round(starRatingNumeric)));

  // Preferences (Account Center)
  const [prefNotificationsEnabled, setPrefNotificationsEnabled] = useState(true);
  const [prefAppearance, setPrefAppearance] = useState<AppearancePreference>('system');
  const [prefPlaceSettings, setPrefPlaceSettings] = useState('');
  const [prefGenderPreference, setPrefGenderPreference] = useState<GenderPreference>('any');
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);

  // App Activity (Ride History)
  const [historyBlocks, setHistoryBlocks] = useState<HistoryBlock[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMessage, setHistoryMessage] = useState('');
  const [selectedHistoryBlock, setSelectedHistoryBlock] = useState<HistoryBlock | null>(null);



  useEffect(() => {
    loadProfile();
  }, [user]);

  useEffect(() => {
    if (!accountCenterVisible) return;
    if (accountCenterView !== 'activity_history') return;
    if (!user?.uid) return;
    void loadHistory();
  }, [accountCenterVisible, accountCenterView, user?.uid]);

  const loadHistory = async () => {
    if (!user?.uid) return;
    setHistoryLoading(true);
    try {
      const blocks = await getUserHistoryBlocks(user.uid);
      const sorted = [...blocks].sort((a: any, b: any) => {
        const aMillis =
          a?.createdAt && typeof a.createdAt?.toMillis === 'function'
            ? a.createdAt.toMillis()
            : null;
        const bMillis =
          b?.createdAt && typeof b.createdAt?.toMillis === 'function'
            ? b.createdAt.toMillis()
            : null;
        if (typeof aMillis === 'number' && typeof bMillis === 'number') {
          return bMillis - aMillis;
        }

        const aKey = `${String(a?.date ?? '')} ${String(a?.pickupTime ?? '')}`;
        const bKey = `${String(b?.date ?? '')} ${String(b?.pickupTime ?? '')}`;
        if (aKey < bKey) return 1;
        if (aKey > bKey) return -1;
        return 0;
      });
      setHistoryBlocks(sorted);
    } catch (error: any) {
      setHistoryMessage(error?.message ? String(error.message) : 'Failed to load ride history');
      setTimeout(() => setHistoryMessage(''), 3000);
    } finally {
      setHistoryLoading(false);
    }
  };

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
        const bankInfoRaw: unknown = data.bankInfo ?? null;
        const bankInfo =
          bankInfoRaw && typeof bankInfoRaw === 'object'
            ? (bankInfoRaw as Record<string, unknown>)
            : {};
        setBankInfoBase(bankInfo);

        // Backwards compatibility: some older docs stored bank under `bank.info`
        const legacyBank =
          data.bank && typeof data.bank === 'object'
            ? (data.bank as any)?.info
            : undefined;

        setBank(
          typeof bankInfo.bank === 'string'
            ? bankInfo.bank
            : typeof legacyBank === 'string'
              ? legacyBank
              : ''
        );
        setPaymentMethod(typeof bankInfo.paymentMethod === 'string' ? bankInfo.paymentMethod : '');
        setPayoutMethod(typeof bankInfo.payoutMethod === 'string' ? bankInfo.payoutMethod : '');
        setActiveRole(data.activeRole || '');

        const docStarRating =
          data.starRating !== undefined && data.starRating !== null
            ? String(data.starRating)
            : '';

        try {
          const aggregated = await aggregateRatingForUser(user.uid);
          if (aggregated && aggregated.count > 0) {
            setStarRating(String(aggregated.average));
          } else {
            setStarRating(docStarRating);
          }
        } catch (aggErr) {
          console.warn('aggregateRatingForUser failed; using profile starRating', aggErr);
          setStarRating(docStarRating);
        }

        if (data.createdAt?.toDate) {
          setCreatedAtText(data.createdAt.toDate().toLocaleDateString());
        } else {
          setCreatedAtText('');
        }

        setProfilePhoto(typeof data.profilePhoto === 'string' ? data.profilePhoto : '');

        if (data.carDetails) {
          setCarModel(data.carDetails.model || '');
          setLicensePlate(data.carDetails.licensePlate || '');
          setCarPhoto(data.carDetails.photo || '');
          setCarPhotoPreview(data.carDetails.photo || '');
        } else {
          setCarModel('');
          setLicensePlate('');
          setCarPhoto('');
          setCarPhotoPreview('');
        }

        // Preferences
        const prefs = data.preferences || {};
        setPrefNotificationsEnabled(
          typeof prefs.notificationsEnabled === 'boolean'
            ? prefs.notificationsEnabled
            : true
        );
        setPrefAppearance(
          prefs.appearance === 'light' || prefs.appearance === 'dark' || prefs.appearance === 'system'
            ? prefs.appearance
            : 'system'
        );
        setPrefPlaceSettings(typeof prefs.placeSettings === 'string' ? prefs.placeSettings : '');
        setPrefGenderPreference(
          prefs.genderPreference === 'female' ||
            prefs.genderPreference === 'male' ||
            prefs.genderPreference === 'nonbinary' ||
            prefs.genderPreference === 'any'
            ? prefs.genderPreference
            : 'any'
        );
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
        profilePhoto: profilePhoto.trim(),
        carDetails: {
          model: carModel,
          licensePlate,
          photo: carPhoto,
        },
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      setProfileMessage('Profile saved.');
      setTimeout(() => setProfileMessage(''), 2500);
    } catch (error: any) {
      setProfileMessage(error?.message ? String(error.message) : 'Failed to save profile.');
      setTimeout(() => setProfileMessage(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  

  

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.replace('../login' as any);
    } catch (error: any) {
      setProfileMessage(error?.message ? String(error.message) : 'Failed to sign out.');
      setTimeout(() => setProfileMessage(''), 3000);
    }
  };

  const handleNotificationsPress = () => {
    setTemporaryMessage('Notification settings coming soon.');
    setTimeout(() => setTemporaryMessage(''), 2500);
  };

  const handleAppearancePress = () => {
    setTemporaryMessage('Theme settings coming soon.');
    setTimeout(() => setTemporaryMessage(''), 2500);
  };

  const handlePlaceSettingsPress = () => {
    setTemporaryMessage('Place settings coming soon.');
    setTimeout(() => setTemporaryMessage(''), 2500);
  };

  const handlePrivacyPress = () => {
    setTemporaryMessage('Privacy settings coming soon.');
    setTimeout(() => setTemporaryMessage(''), 2500);
  };

  const handleAccountHelpPress = () => {
    setTemporaryMessage('Account support options coming soon.');
    setTimeout(() => setTemporaryMessage(''), 2500);
  };

  const handleCancelAccountPress = () => {
    setTemporaryMessage(
      'Account cancellation is not connected yet. This would be a permanent action.',
    );
    setTimeout(() => setTemporaryMessage(''), 3000);
  };
  const handleChangePasswordPress = () => {
    setAccountCenterMessage('');
    setSecurityCurrentPassword('');
    setSecurityNewPassword('');
    setAccountCenterView('security_change_password');
  };

  const handleChangeEmailPress = () => {
    setAccountCenterMessage('');
    setSecurityCurrentPassword('');
    setSecurityNewEmail(user?.email ?? '');
    setAccountCenterView('security_change_email');
  };

  const handleSaveNewPassword = async () => {
    if (!user) return;
    const currentPassword = securityCurrentPassword;
    const newPassword = securityNewPassword;

    if (!currentPassword.trim()) {
      setAccountCenterMessage('Current password required.');
      return;
    }
    if (newPassword.length < 6) {
      setAccountCenterMessage('Password too short (min 6 characters).');
      return;
    }

    setSecuritySaving(true);
    try {
      await changePasswordWithCurrentPassword(currentPassword, newPassword);
      setAccountCenterMessage('Password updated.');
      setSecurityCurrentPassword('');
      setSecurityNewPassword('');
      setAccountCenterView('security');
    } catch (error: any) {
      setAccountCenterMessage(error?.message ? String(error.message) : 'Failed to change password');
    } finally {
      setSecuritySaving(false);
    }
  };

  const handleSaveNewEmail = async () => {
    if (!user) return;
    const currentPassword = securityCurrentPassword;
    const newEmail = securityNewEmail.trim();

    if (!currentPassword.trim()) {
      setAccountCenterMessage('Current password required.');
      return;
    }
    if (!newEmail || !newEmail.includes('@')) {
      setAccountCenterMessage('Invalid email address.');
      return;
    }

    setSecuritySaving(true);
    try {
      await changeEmailWithCurrentPassword(currentPassword, newEmail);
      // Keep Firestore profile (if present) consistent with Auth email.
      await updateUser(user.uid, { email: newEmail } as any);
      setAccountCenterMessage('Email updated.');
      setSecurityCurrentPassword('');
      setSecurityNewEmail('');
      setAccountCenterView('security');
    } catch (error: any) {
      setAccountCenterMessage(error?.message ? String(error.message) : 'Failed to change email');
    } finally {
      setSecuritySaving(false);
    }
  };
  const handlePaymentMethodsPress = () => {
    setTemporaryMessage('Payment methods are not connected yet.');
    setTimeout(() => setTemporaryMessage(''), 2500);
  };

  const handlePayoutMethodPress = () => {
    setTemporaryMessage('Payout method is not connected yet.');
    setTimeout(() => setTemporaryMessage(''), 2500);
  };
  const handlePickProfilePhoto = async () => {
    try {
      setPhotoMessage('');
      if (!user?.uid) return;
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setPhotoMessage('Photo library permission is required to select a profile photo.');
        setTimeout(() => setPhotoMessage(''), 3000);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (result.canceled) return;
      const uri = result.assets?.[0]?.uri;
      if (!uri) {
        setPhotoMessage('Could not read selected image.');
        setTimeout(() => setPhotoMessage(''), 3000);
        return;
      }

      setProfilePhotoUploading(true);
      setPhotoMessage('Uploading profile photo...');

      const photoRef = ref(storage, `profilePhotos/${user.uid}`);
      const blob = await uriToBlob(uri);
      await uploadBytes(photoRef, blob);
      const downloadURL = await getDownloadURL(photoRef);

      setProfilePhoto(downloadURL);
      setPhotoMessage('Profile photo uploaded. Tap “Save Profile” to save it to your account.');
      setTimeout(() => setPhotoMessage(''), 4000);
    } catch (error: any) {
      const raw = error?.message ? String(error.message) : '';
      const isPermission =
        raw.toLowerCase().includes('permission') ||
        raw.toLowerCase().includes('unauthorized') ||
        raw.toLowerCase().includes('storage/unauthorized');
      setPhotoMessage(
        isPermission
          ? 'Profile photo could not be uploaded (Storage permissions).'
          : raw || 'Profile photo could not be uploaded.',
      );
      setTimeout(() => setPhotoMessage(''), 4000);
    } finally {
      setProfilePhotoUploading(false);
    }
  };

  const handlePickCarPhoto = async () => {
    try {
      setCarPhotoMessage('');
      if (!user?.uid) return;
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setCarPhotoMessage('Photo library permission is required to select a car photo.');
        setTimeout(() => setCarPhotoMessage(''), 3000);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.85,
      });

      if (result.canceled) return;
      const uri = result.assets?.[0]?.uri;
      if (!uri) {
        setCarPhotoMessage('Could not read selected image.');
        setTimeout(() => setCarPhotoMessage(''), 3000);
        return;
      }

      setCarPhotoPreview(uri);
      setCarPhotoUploading(true);
      setCarPhotoMessage('Uploading car photo...');

      const carPhotoRef = ref(storage, `users/${user.uid}/car-photo.jpg`);
      const blob = await uriToBlob(uri);
      await uploadBytes(carPhotoRef, blob);
      const downloadURL = await getDownloadURL(carPhotoRef);

      setCarPhoto(downloadURL);
      setCarPhotoPreview(downloadURL);
      setCarPhotoMessage('Car photo uploaded. Tap “Save Profile” to keep it on your account.');
      setTimeout(() => setCarPhotoMessage(''), 3000);
    } catch (error: any) {
      const raw = error?.message ? String(error.message) : '';
      const isPermission =
        raw.toLowerCase().includes('permission') ||
        raw.toLowerCase().includes('unauthorized') ||
        raw.toLowerCase().includes('storage/unauthorized');
      setCarPhotoMessage(
        isPermission ? 'Car photo could not be uploaded (Storage permissions).' : (raw || 'Car photo could not be uploaded.'),
      );
      setTimeout(() => setCarPhotoMessage(''), 3000);
    } finally {
      setCarPhotoUploading(false);
    }
  };
  const handlePurchaseHistoryPress = () => {
    setAccountCenterView('activity_history');
  };

  const handleNotificationsSettingsPress = () => {
    setAccountCenterView('preferences_notifications');
  };

  const handleAppearanceSettingsPress = () => {
    setAccountCenterView('preferences_appearance');
  };

  const handlePlaceSettingsMenuPress = () => {
    setAccountCenterView('preferences_place');
  };

  const handleGenderPreferencePress = () => {
    setAccountCenterView('preferences_gender');
  };
  const handleOpenAccountCenter = () => {
    setAccountCenterView('menu');
    setAccountCenterVisible(true);
    loadProfile();
  };

  const handleCloseAccountCenter = () => {
    setAccountCenterVisible(false);
    setAccountCenterView('menu');
  };

  const handleOpenPersonalDetails = () => {
    setTemporaryMessage('');
    setAccountCenterView('personal');
  };

  const handleSavePersonalDetails = async () => {
    if (!user) return;
    setSavingPersonalDetails(true);
    try {
      await updateUser(user.uid, {
        username: username.trim(),
        phone: phone.trim(),
        address: address.trim(),
      } as any);
      setTemporaryMessage('Personal details saved.');
      setTimeout(() => setTemporaryMessage(''), 2500);
      await loadProfile();
    } catch (error: any) {
      setTemporaryMessage(error?.message ? String(error.message) : 'Failed to save personal details');
      setTimeout(() => setTemporaryMessage(''), 3000);
    } finally {
      setSavingPersonalDetails(false);
    }
  };

  const handleOpenSecurity = () => {
    setAccountCenterView('security');
  };

  const handleOpenPayment = () => {
    setAccountCenterView('payment');
  };

  const handleOpenPreferences = () => {
    setAccountCenterView('preferences');
  };

  const handleBackToAccountCenterMenu = () => {
    setAccountCenterView('menu');
  };

  const handleBackToPreferencesMenu = () => {
    setAccountCenterView('preferences');
  };

  const handleSavePreferences = async () => {
    if (!user) return;
    setSavingPreferences(true);
    try {
      await updateUserPreferences(user.uid, {
        notificationsEnabled: prefNotificationsEnabled,
        appearance: prefAppearance,
        placeSettings: prefPlaceSettings.trim(),
        genderPreference: prefGenderPreference,
      });
      setTemporaryMessage('Preferences saved.');
      setTimeout(() => setTemporaryMessage(''), 2500);
      await loadProfile();
    } catch (error: any) {
      setTemporaryMessage(error?.message ? String(error.message) : 'Failed to save preferences');
      setTimeout(() => setTemporaryMessage(''), 3000);
    } finally {
      setSavingPreferences(false);
    }
  };

  const handleSavePaymentFinancial = async () => {
    if (!user) return;
    setSavingPayment(true);
    try {
      const nextBankInfo: Record<string, unknown> = {
        ...bankInfoBase,
        bank: bank.trim(),
        paymentMethod: paymentMethod.trim(),
      };
      if (activeRole === 'driver') {
        nextBankInfo.payoutMethod = payoutMethod.trim();
      }
      await updateUser(user.uid, { bankInfo: nextBankInfo as any });
      setTemporaryMessage('Payment / Financial saved.');
      setTimeout(() => setTemporaryMessage(''), 2500);
      await loadProfile();
    } catch (error: any) {
      setTemporaryMessage(error?.message ? String(error.message) : 'Failed to save payment / financial');
      setTimeout(() => setTemporaryMessage(''), 3000);
    } finally {
      setSavingPayment(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.profileHeaderRow}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              {profilePhoto ? (
                <Image source={{ uri: profilePhoto }} style={styles.avatarImage} contentFit="cover" />
              ) : (
                <Ionicons name="person" size={48} color="#999" />
              )}
            </View>
            <TouchableOpacity
              style={styles.editAvatarButton}
              onPress={handlePickProfilePhoto}
              disabled={profilePhotoUploading}
            >
              {profilePhotoUploading ? (
                <ActivityIndicator size="small" color="#007AFF" />
              ) : (
                <Ionicons name="camera" size={20} color="#007AFF" />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.profileHeaderText}>
            <Text style={styles.profileHeaderName}>{name?.trim() ? name.trim() : 'Your profile'}</Text>
            <Text style={styles.profileHeaderUsername}>
              {username?.trim() ? `@${username.trim()}` : 'No username set'}
            </Text>
            <View style={styles.profileHeaderMetaRow}>
              <View style={styles.profileHeaderStars}>
                {Array.from({ length: 5 }).map((_, idx) => (
                  <Ionicons
                    key={idx}
                    name={idx < starFilledCount ? 'star' : 'star-outline'}
                    size={14}
                    color={starRatingNumeric > 0 ? '#F5B301' : '#C7C7CC'}
                    style={idx === 4 ? undefined : { marginRight: 2 }}
                  />
                ))}
              </View>
              {starRatingNumeric > 0 ? (
                <Text style={styles.profileRatingNumber}>{starRatingNumeric.toFixed(1)}</Text>
              ) : (
                <Text style={styles.profileRatingNew}>New</Text>
              )}
              {activeRole?.trim() ? (
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>
                    {activeRole.trim().charAt(0).toUpperCase() + activeRole.trim().slice(1)}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {photoMessage ? (
          <Text style={styles.photoMessage}>{photoMessage}</Text>
        ) : null}

        <View style={styles.profileCard}>
          <Text style={styles.cardTitle}>Profile details</Text>

          {/*
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
          */}

          {/*
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Username</Text>
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>{username || 'Not added yet'}</Text>
            </View>
            <Text style={styles.helperText}>
              To change your username, go to Account Center → Personal Details.
            </Text>
          </View>
          */}

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

          {/*
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Role</Text>
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>{activeRole || 'Not added yet'}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Star rating</Text>
            <View style={styles.infoBox}>
              {starRating ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <Ionicons
                      key={idx}
                      name={idx < starFilledCount ? 'star' : 'star-outline'}
                      size={18}
                      color="#F5B301"
                      style={idx === 4 ? undefined : { marginRight: 2 }}
                    />
                  ))}
                </View>
              ) : (
                <Text style={styles.infoText}>Not added yet</Text>
              )}
            </View>
          </View>
          */}
        </View>

        {activeRole === 'driver' && (
          <>
            <View style={styles.carDetailsCard}>
              <View style={styles.carDetailsHeader}>
                <Text style={styles.carDetailsTitle}>Car Details</Text>
              </View>

              <View style={styles.carDetailsRow}>
                <View style={styles.carDetailsField}>
                  <Text style={styles.sectionLabel}>Car Model</Text>
                  <View style={[styles.infoBox, styles.carDetailsInfoBox]}>
                    <Text style={styles.infoText}>{carModel || 'Not added yet'}</Text>
                  </View>
                </View>

                <View style={styles.carDetailsField}>
                  <Text style={styles.sectionLabel}>License Plate</Text>
                  <View style={[styles.infoBox, styles.carDetailsInfoBox]}>
                    <Text style={styles.infoText}>{licensePlate || 'Not added yet'}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.carDetailsFieldFull}>
                <Text style={styles.sectionLabel}>Car Photo</Text>
                <TouchableOpacity
                  style={[styles.infoBox, styles.carDetailsPhotoBox]}
                  onPress={handlePickCarPhoto}
                  activeOpacity={0.8}
                >
                  <View style={styles.carDetailsPhotoLeft}>
                    <View style={styles.carDetailsPhotoIcon}>
                      <Ionicons name="car-outline" size={18} color="#666" />
                    </View>
                    <Text style={styles.infoText}>
                      {carPhoto ? 'Car photo selected' : 'No car photo selected yet'}
                    </Text>
                  </View>
                  {carPhotoPreview ? (
                    <Image
                      source={{ uri: carPhotoPreview }}
                      style={styles.carDetailsPhotoPreview}
                      contentFit="cover"
                    />
                  ) : (
                    <Text style={styles.carDetailsPhotoHint}>Select photo</Text>
                  )}
                </TouchableOpacity>
                {carPhotoMessage ? (
                  <Text style={styles.carPhotoMessage}>{carPhotoMessage}</Text>
                ) : null}
              </View>
            </View>
          </>
        )}


        <TouchableOpacity style={styles.accountCenterButton} onPress={handleOpenAccountCenter}>
          <Ionicons name="person-circle-outline" size={20} color="#fff" />
          <Text style={styles.accountCenterButtonText}>Open Account Center</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.saveButton} 
          onPress={handleSaveProfile}
          disabled={loading || carPhotoUploading || profilePhotoUploading}
        >
          <Ionicons name="save" size={20} color="#fff" />
          <Text style={styles.saveButtonText}>
          {loading ? 'Saving...' : 'Save Profile'}
          </Text>
        </TouchableOpacity>
        {profileMessage ? (
          <Text style={styles.profileMessage}>{profileMessage}</Text>
        ) : null}

      </View>

      <Modal
        visible={accountCenterVisible}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Account Center</Text>
            <TouchableOpacity onPress={handleCloseAccountCenter} style={styles.closeButton}>
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
          {temporaryMessage ? (
              <Text style={styles.temporaryMessage}>{temporaryMessage}</Text>
            ) : null}
            {accountCenterView === 'menu' && (
              <>
                <TouchableOpacity style={styles.modalMenuItem} onPress={handleOpenPersonalDetails}>
                  <Text style={styles.modalMenuText}>Personal Details</Text>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.modalMenuItem} onPress={handleOpenSecurity}>
                  <Text style={styles.modalMenuText}>Security</Text>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalMenuItem} onPress={handleOpenPayment}>
                  <Text style={styles.modalMenuText}>Payment / Financial</Text>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalMenuItem} onPress={handlePurchaseHistoryPress}>
                  <Text style={styles.modalMenuText}>Purchase History / Ride History</Text>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalMenuItem} onPress={handleOpenPreferences}>
                  <Text style={styles.modalMenuText}>Preferences</Text>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>
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
              </>
            )}

            {accountCenterView === 'personal' && (
              <>
                <TouchableOpacity style={styles.backRow} onPress={handleBackToAccountCenterMenu}>
                  <Ionicons name="chevron-back" size={20} color="#6366F1" />
                  <Text style={styles.backRowText}>Back to Account Center</Text>
                </TouchableOpacity>

                <Text style={styles.subSectionTitle}>Personal Details</Text>

                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Email</Text>
                  <View style={styles.infoBox}>
                    <Text style={styles.infoText}>{user?.email || 'Not available'}</Text>
                  </View>
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Username</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your username"
                    value={username}
                    onChangeText={setUsername}
                    placeholderTextColor="#999"
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Phone</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your phone"
                    value={phone}
                    onChangeText={setPhone}
                    placeholderTextColor="#999"
                    keyboardType="phone-pad"
                  />
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Address</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your address"
                    value={address}
                    onChangeText={setAddress}
                    placeholderTextColor="#999"
                  />
                </View>

                <TouchableOpacity
                  style={[
                    styles.saveButton,
                    savingPersonalDetails ? styles.saveButtonDisabled : null,
                  ]}
                  onPress={handleSavePersonalDetails}
                  disabled={savingPersonalDetails}
                >
                  <Ionicons name="save" size={20} color="#fff" />
                  <Text style={styles.saveButtonText}>
                    {savingPersonalDetails ? 'Saving...' : 'Save Personal Details'}
                  </Text>
                </TouchableOpacity>

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
              </>
            )}
            {accountCenterView === 'security' && (
              <>
                <TouchableOpacity style={styles.backRow} onPress={handleBackToAccountCenterMenu}>
                  <Ionicons name="chevron-back" size={20} color="#6366F1" />
                  <Text style={styles.backRowText}>Back to Account Center</Text>
                </TouchableOpacity>

                <Text style={styles.subSectionTitle}>Security</Text>
                {accountCenterMessage ? (
                  <Text style={styles.accountCenterMessage}>{accountCenterMessage}</Text>
                ) : null}
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Password</Text>
                  <View style={styles.infoBox}>
                    <Text style={styles.infoText}>••••••••</Text>
                  </View>
                </View>

                <TouchableOpacity style={styles.modalMenuItem} onPress={handleChangePasswordPress}>
                  <Text style={styles.modalMenuText}>Change Password</Text>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>
              </>
            )}

            {accountCenterView === 'security_change_password' && (
              <>
                <TouchableOpacity style={styles.backRow} onPress={() => setAccountCenterView('security')}>
                  <Ionicons name="chevron-back" size={20} color="#6366F1" />
                  <Text style={styles.backRowText}>Back to Security</Text>
                </TouchableOpacity>

                <Text style={styles.subSectionTitle}>Change Password</Text>

                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Current password</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter current password"
                    value={securityCurrentPassword}
                    onChangeText={setSecurityCurrentPassword}
                    placeholderTextColor="#999"
                    secureTextEntry
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>New password</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter new password"
                    value={securityNewPassword}
                    onChangeText={setSecurityNewPassword}
                    placeholderTextColor="#999"
                    secureTextEntry
                    autoCapitalize="none"
                  />
                </View>

                <TouchableOpacity
                  style={[styles.saveButton, securitySaving ? styles.saveButtonDisabled : null]}
                  onPress={handleSaveNewPassword}
                  disabled={securitySaving}
                >
                  <Ionicons name="save" size={20} color="#fff" />
                  <Text style={styles.saveButtonText}>
                    {securitySaving ? 'Saving...' : 'Save Password'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {accountCenterView === 'security_change_email' && (
              <>
                <TouchableOpacity style={styles.backRow} onPress={() => setAccountCenterView('security')}>
                  <Ionicons name="chevron-back" size={20} color="#6366F1" />
                  <Text style={styles.backRowText}>Back to Security</Text>
                </TouchableOpacity>

                <Text style={styles.subSectionTitle}>Change Email</Text>

                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Current password</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter current password"
                    value={securityCurrentPassword}
                    onChangeText={setSecurityCurrentPassword}
                    placeholderTextColor="#999"
                    secureTextEntry
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>New email</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter new email"
                    value={securityNewEmail}
                    onChangeText={setSecurityNewEmail}
                    placeholderTextColor="#999"
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </View>

                <TouchableOpacity
                  style={[styles.saveButton, securitySaving ? styles.saveButtonDisabled : null]}
                  onPress={handleSaveNewEmail}
                  disabled={securitySaving}
                >
                  <Ionicons name="save" size={20} color="#fff" />
                  <Text style={styles.saveButtonText}>
                    {securitySaving ? 'Saving...' : 'Save Email'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {accountCenterView === 'payment' && (
              <>
                <TouchableOpacity style={styles.backRow} onPress={handleBackToAccountCenterMenu}>
                  <Ionicons name="chevron-back" size={20} color="#6366F1" />
                  <Text style={styles.backRowText}>Back to Account Center</Text>
                </TouchableOpacity>

                <Text style={styles.subSectionTitle}>Payment / Financial</Text>

                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Bank</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your bank"
                    value={bank}
                    onChangeText={setBank}
                    placeholderTextColor="#999"
                  />
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Payment Method</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your payment method"
                    value={paymentMethod}
                    onChangeText={setPaymentMethod}
                    placeholderTextColor="#999"
                  />
                </View>

                {activeRole === 'driver' && (
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Payout Method</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter your payout method"
                      value={payoutMethod}
                      onChangeText={setPayoutMethod}
                      placeholderTextColor="#999"
                    />
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.saveButton, savingPayment ? styles.saveButtonDisabled : null]}
                  onPress={handleSavePaymentFinancial}
                  disabled={savingPayment}
                >
                  <Ionicons name="save" size={20} color="#fff" />
                  <Text style={styles.saveButtonText}>
                    {savingPayment ? 'Saving...' : 'Save Payment / Financial'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {accountCenterView === 'activity_history' && (
              <>
                <TouchableOpacity style={styles.backRow} onPress={handleBackToAccountCenterMenu}>
                  <Ionicons name="chevron-back" size={20} color="#6366F1" />
                  <Text style={styles.backRowText}>Back to Account Center</Text>
                </TouchableOpacity>

                <Text style={styles.subSectionTitle}>Ride History</Text>

                {historyMessage ? (
                  <Text style={styles.activityMessage}>{historyMessage}</Text>
                ) : null}

                {historyLoading ? (
                  <Text style={styles.activitySubtle}>Loading...</Text>
                ) : historyBlocks.length === 0 ? (
                  <Text style={styles.activitySubtle}>No ride history yet.</Text>
                ) : (
                  historyBlocks.map((h: any, idx: number) => (
                    <TouchableOpacity
                      key={String(h?.id ?? h?.historyBlockId ?? h?.createdAt?.toMillis?.() ?? idx)}
                      style={styles.activityRow}
                      onPress={() => {
                        setSelectedHistoryBlock(h as HistoryBlock);
                        setAccountCenterView('activity_history_detail');
                      }}
                    >
                      <View style={styles.activityRowLeft}>
                        {h?.role === 'rider' ? (
                          <>
                            <Text style={styles.activityName}>Ride booked</Text>
                            <Text style={styles.activityRole}>{`Date: ${String(h?.date ?? '—')}`}</Text>
                            <Text style={styles.activityRole}>
                              {`Pickup time: ${String(h?.pickupTime ?? '—')}`}
                            </Text>
                            <Text style={styles.activityRole}>
                              {`Amount paid: $${String(h?.amountPaid ?? '—')}`}
                            </Text>
                            <Text style={styles.activityRole}>
                              {`Driver ID: ${String(h?.otherUserId ?? '—')}`}
                            </Text>
                            <Text style={styles.activityRole}>
                              {`Pickup: (${String(h?.pickupLocation?.latitude ?? '—')}, ${String(
                                h?.pickupLocation?.longitude ?? '—'
                              )})`}
                            </Text>
                            <Text style={styles.activityRole}>
                              {`Dropoff: (${String(h?.dropoffLocation?.latitude ?? '—')}, ${String(
                                h?.dropoffLocation?.longitude ?? '—'
                              )})`}
                            </Text>
                          </>
                        ) : (
                          <>
                            <Text style={styles.activityName}>Ride completed</Text>
                            <Text style={styles.activityRole}>{`Date: ${String(h?.date ?? '—')}`}</Text>
                            <Text style={styles.activityRole}>
                              {`Pickup time: ${String(h?.pickupTime ?? '—')}`}
                            </Text>
                            <Text style={styles.activityRole}>
                              {`Amount earned: $${String(h?.amountPaid ?? '—')}`}
                            </Text>
                            <Text style={styles.activityRole}>
                              {`Rider ID: ${String(h?.otherUserId ?? '—')}`}
                            </Text>
                          </>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </>
            )}

            {accountCenterView === 'activity_history_detail' && (
              <>
                <TouchableOpacity
                  style={styles.backRow}
                  onPress={() => {
                    setAccountCenterView('activity_history');
                    setSelectedHistoryBlock(null);
                  }}
                >
                  <Ionicons name="chevron-back" size={20} color="#6366F1" />
                  <Text style={styles.backRowText}>Back to Ride History</Text>
                </TouchableOpacity>

                {!selectedHistoryBlock ? (
                  <Text style={styles.activitySubtle}>No ride selected.</Text>
                ) : selectedHistoryBlock.role === 'rider' ? (
                  <>
                    <Text style={styles.subSectionTitle}>Ride Purchase Details</Text>

                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>Date</Text>
                      <View style={styles.infoBox}>
                        <Text style={styles.infoText}>{String(selectedHistoryBlock.date ?? '—')}</Text>
                      </View>
                    </View>

                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>Pickup time</Text>
                      <View style={styles.infoBox}>
                        <Text style={styles.infoText}>
                          {String(selectedHistoryBlock.pickupTime ?? '—')}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>Amount paid</Text>
                      <View style={styles.infoBox}>
                        <Text style={styles.infoText}>
                          {`$${String(selectedHistoryBlock.amountPaid ?? '—')}`}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>Driver ID</Text>
                      <View style={styles.infoBox}>
                        <Text style={styles.infoText}>
                          {String(selectedHistoryBlock.otherUserId ?? '—')}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>rideRequestId</Text>
                      <View style={styles.infoBox}>
                        <Text style={styles.infoText}>
                          {String(selectedHistoryBlock.rideRequestId ?? '—')}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>Pickup coordinates</Text>
                      <View style={styles.infoBox}>
                        <Text style={styles.infoText}>
                          {`(${String(selectedHistoryBlock.pickupLocation?.latitude ?? '—')}, ${String(
                            selectedHistoryBlock.pickupLocation?.longitude ?? '—'
                          )})`}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>Dropoff coordinates</Text>
                      <View style={styles.infoBox}>
                        <Text style={styles.infoText}>
                          {`(${String(selectedHistoryBlock.dropoffLocation?.latitude ?? '—')}, ${String(
                            selectedHistoryBlock.dropoffLocation?.longitude ?? '—'
                          )})`}
                        </Text>
                      </View>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.subSectionTitle}>Driver Ride Details</Text>

                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>Date</Text>
                      <View style={styles.infoBox}>
                        <Text style={styles.infoText}>{String(selectedHistoryBlock.date ?? '—')}</Text>
                      </View>
                    </View>

                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>Pickup time</Text>
                      <View style={styles.infoBox}>
                        <Text style={styles.infoText}>
                          {String(selectedHistoryBlock.pickupTime ?? '—')}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>Amount earned</Text>
                      <View style={styles.infoBox}>
                        <Text style={styles.infoText}>
                          {`$${String(selectedHistoryBlock.amountPaid ?? '—')}`}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>Rider ID</Text>
                      <View style={styles.infoBox}>
                        <Text style={styles.infoText}>
                          {String(selectedHistoryBlock.otherUserId ?? '—')}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>rideRequestId</Text>
                      <View style={styles.infoBox}>
                        <Text style={styles.infoText}>
                          {String(selectedHistoryBlock.rideRequestId ?? '—')}
                        </Text>
                      </View>
                    </View>
                  </>
                )}
              </>
            )}

            {accountCenterView === 'preferences' && (
              <>
                <TouchableOpacity style={styles.backRow} onPress={handleBackToAccountCenterMenu}>
                  <Ionicons name="chevron-back" size={20} color="#6366F1" />
                  <Text style={styles.backRowText}>Back to Account Center</Text>
                </TouchableOpacity>

                <Text style={styles.subSectionTitle}>Preferences</Text>

                <TouchableOpacity style={styles.modalMenuItem} onPress={handleNotificationsSettingsPress}>
                  <Text style={styles.modalMenuText}>Notifications</Text>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>

              </>
            )}

            {accountCenterView === 'preferences_notifications' && (
              <>
                <TouchableOpacity style={styles.backRow} onPress={handleBackToPreferencesMenu}>
                  <Ionicons name="chevron-back" size={20} color="#6366F1" />
                  <Text style={styles.backRowText}>Back to Preferences</Text>
                </TouchableOpacity>

                <Text style={styles.subSectionTitle}>Notifications</Text>

                <TouchableOpacity
                  style={styles.choiceRow}
                  onPress={() => setPrefNotificationsEnabled((v) => !v)}
                >
                  <Text style={styles.choiceRowText}>Push notifications</Text>
                  <Text style={styles.choiceRowValue}>
                    {prefNotificationsEnabled ? 'On' : 'Off'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.saveButton, savingPreferences ? styles.saveButtonDisabled : null]}
                  onPress={handleSavePreferences}
                  disabled={savingPreferences}
                >
                  <Ionicons name="save" size={20} color="#fff" />
                  <Text style={styles.saveButtonText}>
                    {savingPreferences ? 'Saving...' : 'Save Notifications'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {accountCenterView === 'preferences_appearance' && (
              <>
                <TouchableOpacity style={styles.backRow} onPress={handleBackToPreferencesMenu}>
                  <Ionicons name="chevron-back" size={20} color="#6366F1" />
                  <Text style={styles.backRowText}>Back to Preferences</Text>
                </TouchableOpacity>

                <Text style={styles.subSectionTitle}>Appearance</Text>

                <View style={styles.choiceGroup}>
                  {(['system', 'light', 'dark'] as AppearancePreference[]).map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[
                        styles.choicePill,
                        prefAppearance === opt ? styles.choicePillActive : null,
                      ]}
                      onPress={() => setPrefAppearance(opt)}
                    >
                      <Text
                        style={[
                          styles.choicePillText,
                          prefAppearance === opt ? styles.choicePillTextActive : null,
                        ]}
                      >
                        {opt === 'system' ? 'System' : opt === 'light' ? 'Light' : 'Dark'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.saveButton, savingPreferences ? styles.saveButtonDisabled : null]}
                  onPress={handleSavePreferences}
                  disabled={savingPreferences}
                >
                  <Ionicons name="save" size={20} color="#fff" />
                  <Text style={styles.saveButtonText}>
                    {savingPreferences ? 'Saving...' : 'Save Appearance'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {accountCenterView === 'preferences_place' && (
              <>
                <TouchableOpacity style={styles.backRow} onPress={handleBackToPreferencesMenu}>
                  <Ionicons name="chevron-back" size={20} color="#6366F1" />
                  <Text style={styles.backRowText}>Back to Preferences</Text>
                </TouchableOpacity>

                <Text style={styles.subSectionTitle}>Place Settings</Text>

                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Default place</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Home city, neighborhood, campus"
                    value={prefPlaceSettings}
                    onChangeText={setPrefPlaceSettings}
                    placeholderTextColor="#999"
                  />
                </View>

                <TouchableOpacity
                  style={[styles.saveButton, savingPreferences ? styles.saveButtonDisabled : null]}
                  onPress={handleSavePreferences}
                  disabled={savingPreferences}
                >
                  <Ionicons name="save" size={20} color="#fff" />
                  <Text style={styles.saveButtonText}>
                    {savingPreferences ? 'Saving...' : 'Save Place Settings'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {accountCenterView === 'preferences_gender' && (
              <>
                <TouchableOpacity style={styles.backRow} onPress={handleBackToPreferencesMenu}>
                  <Ionicons name="chevron-back" size={20} color="#6366F1" />
                  <Text style={styles.backRowText}>Back to Preferences</Text>
                </TouchableOpacity>

                <Text style={styles.subSectionTitle}>Gender Preference</Text>

                <View style={styles.choiceGroup}>
                  {(['any', 'female', 'male', 'nonbinary'] as GenderPreference[]).map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[
                        styles.choicePill,
                        prefGenderPreference === opt ? styles.choicePillActive : null,
                      ]}
                      onPress={() => setPrefGenderPreference(opt)}
                    >
                      <Text
                        style={[
                          styles.choicePillText,
                          prefGenderPreference === opt ? styles.choicePillTextActive : null,
                        ]}
                      >
                        {opt === 'any'
                          ? 'Any'
                          : opt === 'female'
                            ? 'Female'
                            : opt === 'male'
                              ? 'Male'
                              : 'Non-binary'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.saveButton, savingPreferences ? styles.saveButtonDisabled : null]}
                  onPress={handleSavePreferences}
                  disabled={savingPreferences}
                >
                  <Ionicons name="save" size={20} color="#fff" />
                  <Text style={styles.saveButtonText}>
                    {savingPreferences ? 'Saving...' : 'Save Gender Preference'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
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
    paddingBottom: 28,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
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
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
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
  },
  profileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  profileHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  profileHeaderName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#333',
  },
  profileHeaderUsername: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  profileHeaderMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 10,
  },
  profileHeaderStars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileRatingNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: '#444',
    minWidth: 28,
  },
  profileRatingNew: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  roleBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4338CA',
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
  },
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    padding: 14,
    marginBottom: 18,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  helperText: {
    marginTop: 8,
    fontSize: 12,
    color: '#666',
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

  carDetailsCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    padding: 14,
    marginBottom: 20,
  },
  carDetailsHeader: {
    paddingBottom: 10,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  carDetailsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  carDetailsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  carDetailsField: {
    flex: 1,
  },
  carDetailsFieldFull: {
    width: '100%',
  },
  carDetailsInfoBox: {
    paddingVertical: 12,
  },
  carDetailsPhotoBox: {
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  carDetailsPhotoLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  carDetailsPhotoIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#eee',
  },
  carDetailsPhotoHint: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  carDetailsPhotoPreview: {
    width: 56,
    height: 56,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    backgroundColor: '#f5f5f5',
  },
  carPhotoMessage: {
    marginTop: 8,
    fontSize: 13,
    color: '#666',
  },
  profileMessage: {
    marginTop: -10,
    marginBottom: 18,
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
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
  accountCenterButton: {
    flexDirection: 'row',
    backgroundColor: '#6366F1',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    gap: 8,
  },
  accountCenterButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
  modalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  modalMenuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  modalMenuText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  activityMessage: {
    marginTop: 10,
    marginBottom: 6,
    fontSize: 13,
    color: '#333',
  },
  activitySectionTitle: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  activitySubtle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  activityRowLeft: {
    flex: 1,
    paddingRight: 12,
  },
  activityName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
  },
  activityRole: {
    marginTop: 2,
    fontSize: 12,
    color: '#666',
  },
  activityActionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  activityActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#333',
  },
    backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backRowText: {
    fontSize: 15,
    color: '#6366F1',
    fontWeight: '600',
    marginLeft: 4,
  },
  subSectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  temporaryMessage: {
    backgroundColor: '#EEF2FF',
    color: '#4338CA',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    fontSize: 14,
  },
 
  accountCenterMessage: {
    fontSize: 14,
    color: '#6366F1',
    marginBottom: 16,
  },

  choiceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  choiceRowText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  choiceRowValue: {
    fontSize: 16,
    color: '#6366F1',
    fontWeight: '700',
  },
  choiceGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  choicePill: {
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  choicePillActive: {
    borderColor: '#6366F1',
    backgroundColor: '#EEF2FF',
  },
  choicePillText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
  choicePillTextActive: {
    color: '#4338CA',
  },
});
