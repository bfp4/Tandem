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
import ScreenHeader from '@/components/ScreenHeader';
import Avatar from '@/components/Avatar';
import BackRow from '@/components/BackRow';
import FormField from '@/components/FormField';
import MenuListItem from '@/components/MenuListItem';
import ReadOnlyField from '@/components/ReadOnlyField';
import SaveButton from '@/components/SaveButton';
import StarRating from '@/components/StarRating';
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
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { styles } from './account.styles';
import { auth, db, storage } from '../../config/firebase';
import { ACCENT, TEXT_INVERSE, TEXT_PRIMARY, TEXT_TERTIARY } from '@/utils/constants';

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
      setPhotoMessage('Profile photo uploaded. Tap "Save Profile" to save it to your account.');
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
      setCarPhotoMessage('Car photo uploaded. Tap "Save Profile" to keep it on your account.');
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
      <ScreenHeader title="Profile" />

      <View style={styles.content}>
        <View style={styles.profileHeaderRow}>
          <View style={styles.avatarContainer}>
            <Avatar uri={profilePhoto} size={100} />
            <TouchableOpacity
              style={styles.editAvatarButton}
              onPress={handlePickProfilePhoto}
              disabled={profilePhotoUploading}
            >
              {profilePhotoUploading ? (
                <ActivityIndicator size="small" color={ACCENT} />
              ) : (
                <Ionicons name="camera" size={20} color={ACCENT} />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.profileHeaderText}>
            <Text style={styles.profileHeaderName}>{name?.trim() ? name.trim() : 'Your profile'}</Text>
            <Text style={styles.profileHeaderUsername}>
              {username?.trim() ? `@${username.trim()}` : 'No username set'}
            </Text>
            <View style={styles.profileHeaderMetaRow}>
              <StarRating rating={starRatingNumeric} size={14} />
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

          <FormField
            label="Bio"
            value={bio}
            onChangeText={setBio}
            placeholder="Tell us about yourself"
            multiline
            numberOfLines={4}
            inputStyle={styles.textArea}
          />
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
                      <Ionicons name="car-outline" size={18} color={TEXT_TERTIARY} />
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
          <Ionicons name="person-circle-outline" size={20} color={TEXT_INVERSE} />
          <Text style={styles.accountCenterButtonText}>Open Account Center</Text>
        </TouchableOpacity>
        <SaveButton
          onPress={handleSaveProfile}
          saving={loading}
          label="Save Profile"
          disabled={loading || carPhotoUploading || profilePhotoUploading}
        />
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
              <Ionicons name="close" size={28} color={TEXT_PRIMARY} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
          {temporaryMessage ? (
              <Text style={styles.temporaryMessage}>{temporaryMessage}</Text>
            ) : null}
            {accountCenterView === 'menu' && (
              <>
                <MenuListItem label="Personal Details" onPress={handleOpenPersonalDetails} />
                <MenuListItem label="Security" onPress={handleOpenSecurity} />
                <MenuListItem label="Payment / Financial" onPress={handleOpenPayment} />
                <MenuListItem label="Purchase History / Ride History" onPress={handlePurchaseHistoryPress} />
                <MenuListItem label="Preferences" onPress={handleOpenPreferences} />

                <Text style={styles.settingsGroupTitle}>Account & Safety</Text>

                <View style={styles.settingsSection}>
                  <TouchableOpacity style={styles.settingItem} onPress={handlePrivacyPress}>
                    <Ionicons name="shield-outline" size={24} color={TEXT_PRIMARY} />
                    <Text style={styles.settingText}>Privacy</Text>
                    <Ionicons name="chevron-forward" size={20} color="#ccc" />
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.settingItem} onPress={handleAccountHelpPress}>
                    <Ionicons name="help-circle-outline" size={24} color={TEXT_PRIMARY} />
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
                <BackRow label="Back to Account Center" onPress={handleBackToAccountCenterMenu} />

                <Text style={styles.subSectionTitle}>Personal Details</Text>

                <ReadOnlyField label="Email" value={user?.email || ''} fallback="Not available" />

                <FormField
                  label="Username"
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Enter your username"
                  autoCapitalize="none"
                />

                <FormField
                  label="Phone"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Enter your phone"
                  keyboardType="phone-pad"
                />

                <FormField
                  label="Address"
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Enter your address"
                />

                <SaveButton
                  onPress={handleSavePersonalDetails}
                  saving={savingPersonalDetails}
                  label="Save Personal Details"
                />

                <ReadOnlyField label="User ID" value={user?.uid || ''} fallback="Not available" />
                <ReadOnlyField label="Date Created" value={createdAtText} fallback="Not available" />
              </>
            )}
            {accountCenterView === 'security' && (
              <>
                <BackRow label="Back to Account Center" onPress={handleBackToAccountCenterMenu} />

                <Text style={styles.subSectionTitle}>Security</Text>
                {accountCenterMessage ? (
                  <Text style={styles.accountCenterMessage}>{accountCenterMessage}</Text>
                ) : null}

                <ReadOnlyField label="Password" value="••••••••" />

                <MenuListItem label="Change Password" onPress={handleChangePasswordPress} />
                <MenuListItem label="Change Email" onPress={handleChangeEmailPress} />
              </>
            )}

            {accountCenterView === 'security_change_password' && (
              <>
                <BackRow label="Back to Security" onPress={() => setAccountCenterView('security')} />

                <Text style={styles.subSectionTitle}>Change Password</Text>

                <FormField
                  label="Current password"
                  value={securityCurrentPassword}
                  onChangeText={setSecurityCurrentPassword}
                  placeholder="Enter current password"
                  secureTextEntry
                  autoCapitalize="none"
                />

                <FormField
                  label="New password"
                  value={securityNewPassword}
                  onChangeText={setSecurityNewPassword}
                  placeholder="Enter new password"
                  secureTextEntry
                  autoCapitalize="none"
                />

                <SaveButton
                  onPress={handleSaveNewPassword}
                  saving={securitySaving}
                  label="Save Password"
                />
              </>
            )}

            {accountCenterView === 'security_change_email' && (
              <>
                <BackRow label="Back to Security" onPress={() => setAccountCenterView('security')} />

                <Text style={styles.subSectionTitle}>Change Email</Text>

                <FormField
                  label="Current password"
                  value={securityCurrentPassword}
                  onChangeText={setSecurityCurrentPassword}
                  placeholder="Enter current password"
                  secureTextEntry
                  autoCapitalize="none"
                />

                <FormField
                  label="New email"
                  value={securityNewEmail}
                  onChangeText={setSecurityNewEmail}
                  placeholder="Enter new email"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />

                <SaveButton
                  onPress={handleSaveNewEmail}
                  saving={securitySaving}
                  label="Save Email"
                />
              </>
            )}

            {accountCenterView === 'payment' && (
              <>
                <BackRow label="Back to Account Center" onPress={handleBackToAccountCenterMenu} />

                <Text style={styles.subSectionTitle}>Payment / Financial</Text>

                <FormField
                  label="Bank"
                  value={bank}
                  onChangeText={setBank}
                  placeholder="Enter your bank"
                />

                <FormField
                  label="Payment Method"
                  value={paymentMethod}
                  onChangeText={setPaymentMethod}
                  placeholder="Enter your payment method"
                />

                {activeRole === 'driver' && (
                  <FormField
                    label="Payout Method"
                    value={payoutMethod}
                    onChangeText={setPayoutMethod}
                    placeholder="Enter your payout method"
                  />
                )}

                <SaveButton
                  onPress={handleSavePaymentFinancial}
                  saving={savingPayment}
                  label="Save Payment / Financial"
                />
              </>
            )}

            {accountCenterView === 'activity_history' && (
              <>
                <BackRow label="Back to Account Center" onPress={handleBackToAccountCenterMenu} />

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
                <BackRow
                  label="Back to Ride History"
                  onPress={() => {
                    setAccountCenterView('activity_history');
                    setSelectedHistoryBlock(null);
                  }}
                />

                {!selectedHistoryBlock ? (
                  <Text style={styles.activitySubtle}>No ride selected.</Text>
                ) : selectedHistoryBlock.role === 'rider' ? (
                  <>
                    <Text style={styles.subSectionTitle}>Ride Purchase Details</Text>

                    <ReadOnlyField label="Date" value={String(selectedHistoryBlock.date ?? '—')} />
                    <ReadOnlyField label="Pickup time" value={String(selectedHistoryBlock.pickupTime ?? '—')} />
                    <ReadOnlyField label="Amount paid" value={`$${String(selectedHistoryBlock.amountPaid ?? '—')}`} />
                    <ReadOnlyField label="Driver ID" value={String(selectedHistoryBlock.otherUserId ?? '—')} />
                    <ReadOnlyField label="rideRequestId" value={String(selectedHistoryBlock.rideRequestId ?? '—')} />
                    <ReadOnlyField
                      label="Pickup coordinates"
                      value={`(${String(selectedHistoryBlock.pickupLocation?.latitude ?? '—')}, ${String(
                        selectedHistoryBlock.pickupLocation?.longitude ?? '—'
                      )})`}
                    />
                    <ReadOnlyField
                      label="Dropoff coordinates"
                      value={`(${String(selectedHistoryBlock.dropoffLocation?.latitude ?? '—')}, ${String(
                        selectedHistoryBlock.dropoffLocation?.longitude ?? '—'
                      )})`}
                    />
                  </>
                ) : (
                  <>
                    <Text style={styles.subSectionTitle}>Driver Ride Details</Text>

                    <ReadOnlyField label="Date" value={String(selectedHistoryBlock.date ?? '—')} />
                    <ReadOnlyField label="Pickup time" value={String(selectedHistoryBlock.pickupTime ?? '—')} />
                    <ReadOnlyField label="Amount earned" value={`$${String(selectedHistoryBlock.amountPaid ?? '—')}`} />
                    <ReadOnlyField label="Rider ID" value={String(selectedHistoryBlock.otherUserId ?? '—')} />
                    <ReadOnlyField label="rideRequestId" value={String(selectedHistoryBlock.rideRequestId ?? '—')} />
                  </>
                )}
              </>
            )}

            {accountCenterView === 'preferences' && (
              <>
                <BackRow label="Back to Account Center" onPress={handleBackToAccountCenterMenu} />

                <Text style={styles.subSectionTitle}>Preferences</Text>

                <MenuListItem label="Notifications" onPress={handleNotificationsSettingsPress} />
                <MenuListItem label="Appearance" onPress={handleAppearanceSettingsPress} />
                <MenuListItem label="Place Settings" onPress={handlePlaceSettingsMenuPress} />
                <MenuListItem label="Gender Preference" onPress={handleGenderPreferencePress} />
              </>
            )}

            {accountCenterView === 'preferences_notifications' && (
              <>
                <BackRow label="Back to Preferences" onPress={handleBackToPreferencesMenu} />

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

                <SaveButton
                  onPress={handleSavePreferences}
                  saving={savingPreferences}
                  label="Save Notifications"
                />
              </>
            )}

            {accountCenterView === 'preferences_appearance' && (
              <>
                <BackRow label="Back to Preferences" onPress={handleBackToPreferencesMenu} />

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

                <SaveButton
                  onPress={handleSavePreferences}
                  saving={savingPreferences}
                  label="Save Appearance"
                />
              </>
            )}

            {accountCenterView === 'preferences_place' && (
              <>
                <BackRow label="Back to Preferences" onPress={handleBackToPreferencesMenu} />

                <Text style={styles.subSectionTitle}>Place Settings</Text>

                <FormField
                  label="Default place"
                  value={prefPlaceSettings}
                  onChangeText={setPrefPlaceSettings}
                  placeholder="e.g. Home city, neighborhood, campus"
                />

                <SaveButton
                  onPress={handleSavePreferences}
                  saving={savingPreferences}
                  label="Save Place Settings"
                />
              </>
            )}

            {accountCenterView === 'preferences_gender' && (
              <>
                <BackRow label="Back to Preferences" onPress={handleBackToPreferencesMenu} />

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

                <SaveButton
                  onPress={handleSavePreferences}
                  saving={savingPreferences}
                  label="Save Gender Preference"
                />
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}
