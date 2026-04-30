import { useAuth } from '@/context/AuthContext';
import {
  changeEmailWithCurrentPassword,
  changePasswordWithCurrentPassword,
} from '@/services/authService';
import {
  getBlockedAccounts,
  getFavorites,
  getUserHistoryBlocks,
  removeBlockedAccount,
  removeFavorite,
  type SavedAccountRef,
  updateUser,
  updateUserPreferences,
} from '@/services/userService';
import type { HistoryBlock } from '@/types/historyBlock';
import type { AppearancePreference, GenderPreference } from '@/types/user';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
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
  const [paymentMethod, setPaymentMethod] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('');
  const [bankInfoBase, setBankInfoBase] = useState<Record<string, unknown>>({});
  const [activeRole, setActiveRole] = useState('');
  const [createdAtText, setCreatedAtText] = useState('');
  const [starRating, setStarRating] = useState('');
  const [carModel, setCarModel] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [carPhoto, setCarPhoto] = useState(''); 
  const [accountCenterVisible, setAccountCenterVisible] = useState(false);
  const [accountCenterView, setAccountCenterView] = useState('menu');
  const [temporaryMessage, setTemporaryMessage] = useState('');
  const [accountCenterMessage, setAccountCenterMessage] = useState('');
  const [photoMessage, setPhotoMessage] = useState('');
  const [securityCurrentPassword, setSecurityCurrentPassword] = useState('');
  const [securityNewPassword, setSecurityNewPassword] = useState('');
  const [securityNewEmail, setSecurityNewEmail] = useState('');
  const [securitySaving, setSecuritySaving] = useState(false);

  // Preferences (Account Center)
  const [prefNotificationsEnabled, setPrefNotificationsEnabled] = useState(true);
  const [prefAppearance, setPrefAppearance] = useState<AppearancePreference>('system');
  const [prefPlaceSettings, setPrefPlaceSettings] = useState('');
  const [prefGenderPreference, setPrefGenderPreference] = useState<GenderPreference>('any');
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);

  // App Activity (Favorites + Blocked Accounts)
  const [favorites, setFavorites] = useState<SavedAccountRef[]>([]);
  const [blockedAccounts, setBlockedAccounts] = useState<SavedAccountRef[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityMessage, setActivityMessage] = useState('');

  // App Activity (Ride History)
  const [historyBlocks, setHistoryBlocks] = useState<HistoryBlock[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMessage, setHistoryMessage] = useState('');



  useEffect(() => {
    loadProfile();
  }, [user]);

  useEffect(() => {
    if (!accountCenterVisible) return;
    if (accountCenterView !== 'activity') return;
    void loadActivity();
  }, [accountCenterVisible, accountCenterView, user?.uid]);

  useEffect(() => {
    if (!accountCenterVisible) return;
    if (accountCenterView !== 'activity_history') return;
    if (!user?.uid) return;
    void loadHistory();
  }, [accountCenterVisible, accountCenterView, user?.uid]);

  const loadActivity = async () => {
    if (!user?.uid) return;
    setActivityLoading(true);
    try {
      const [fav, blocked] = await Promise.all([
        getFavorites(user.uid),
        getBlockedAccounts(user.uid),
      ]);
      setFavorites(fav);
      setBlockedAccounts(blocked);
    } catch (error: any) {
      setActivityMessage(error?.message ? String(error.message) : 'Failed to load activity');
      setTimeout(() => setActivityMessage(''), 3000);
    } finally {
      setActivityLoading(false);
    }
  };

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
      Alert.alert('Current password required', 'Please enter your current password.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Password too short', 'New password must be at least 6 characters.');
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
      Alert.alert('Error', error?.message ?? 'Failed to change password');
    } finally {
      setSecuritySaving(false);
    }
  };

  const handleSaveNewEmail = async () => {
    if (!user) return;
    const currentPassword = securityCurrentPassword;
    const newEmail = securityNewEmail.trim();

    if (!currentPassword.trim()) {
      Alert.alert('Current password required', 'Please enter your current password.');
      return;
    }
    if (!newEmail || !newEmail.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
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
      Alert.alert('Error', error?.message ?? 'Failed to change email');
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
  const handleEditPhotoPress = () => {
    setPhotoMessage('Profile photo upload is not connected yet.'  
    );
  };
  const handlePurchaseHistoryPress = () => {
    setAccountCenterView('activity_history');
  };

  const handleRemoveFavorite = async (targetUid: string) => {
    if (!user?.uid) return;
    try {
      await removeFavorite(user.uid, targetUid);
      setFavorites((prev) => prev.filter((f) => f.targetUid !== targetUid));
      setActivityMessage('Removed from favorites');
      setTimeout(() => setActivityMessage(''), 2000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setActivityMessage(`Failed to remove favorite: ${message}`);
      setTimeout(() => setActivityMessage(''), 3000);
    }
  };

  const handleUnblockAccount = async (targetUid: string) => {
    if (!user?.uid) return;
    try {
      await removeBlockedAccount(user.uid, targetUid);
      setBlockedAccounts((prev) => prev.filter((b) => b.targetUid !== targetUid));
      setActivityMessage('Unblocked account');
      setTimeout(() => setActivityMessage(''), 2000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setActivityMessage(`Failed to unblock account: ${message}`);
      setTimeout(() => setActivityMessage(''), 3000);
    }
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
    setAccountCenterView('personal');
  };

  const handleOpenSecurity = () => {
    setAccountCenterView('security');
  };

  const handleOpenPayment = () => {
    setAccountCenterView('payment');
  };

  const handleOpenAppActivity = () => {
    setAccountCenterView('activity');
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

  const handleBackToAppActivity = () => {
    setAccountCenterView('activity');
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
      Alert.alert('Error', error?.message ?? 'Failed to save preferences');
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
      Alert.alert('Error', error?.message ?? 'Failed to save payment / financial');
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
        <TouchableOpacity style={styles.accountCenterButton} onPress={handleOpenAccountCenter}>
          <Ionicons name="person-circle-outline" size={20} color="#fff" />
          <Text style={styles.accountCenterButtonText}>Open Account Center</Text>
        </TouchableOpacity>
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
                <TouchableOpacity style={styles.modalMenuItem} onPress={handleOpenAppActivity}>
                  <Text style={styles.modalMenuText}>App Activity</Text>
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
           
           {accountCenterView === 'activity' && (
              <>
                <TouchableOpacity style={styles.backRow} onPress={handleBackToAccountCenterMenu}>
                  <Ionicons name="chevron-back" size={20} color="#6366F1" />
                  <Text style={styles.backRowText}>Back to Account Center</Text>
                </TouchableOpacity>

                <Text style={styles.subSectionTitle}>App Activity</Text>

                <TouchableOpacity style={styles.modalMenuItem} onPress={handlePurchaseHistoryPress}>
                  <Text style={styles.modalMenuText}>Purchase History / Ride History</Text>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalMenuItem}
                  onPress={() => setAccountCenterView('activity_favorites')}
                >
                  <Text style={styles.modalMenuText}>Favorites</Text>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalMenuItem}
                  onPress={() => setAccountCenterView('activity_blocked')}
                >
                  <Text style={styles.modalMenuText}>Blocked Accounts</Text>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>
              </>             
            )} 

            {accountCenterView === 'activity_favorites' && (
              <>
                <TouchableOpacity style={styles.backRow} onPress={handleBackToAppActivity}>
                  <Ionicons name="chevron-back" size={20} color="#6366F1" />
                  <Text style={styles.backRowText}>Back to App Activity</Text>
                </TouchableOpacity>

                <Text style={styles.subSectionTitle}>Favorites</Text>

                {activityMessage ? (
                  <Text style={styles.activityMessage}>{activityMessage}</Text>
                ) : null}

                {activityLoading ? (
                  <Text style={styles.activitySubtle}>Loading...</Text>
                ) : favorites.length === 0 ? (
                  <Text style={styles.activitySubtle}>No favorites yet.</Text>
                ) : (
                  favorites.map((f) => (
                    <View key={f.targetUid} style={styles.activityRow}>
                      <View style={styles.activityRowLeft}>
                        <Text style={styles.activityName}>{f.name}</Text>
                        <Text style={styles.activityRole}>{f.activeRole ?? '—'}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.activityActionButton}
                        onPress={() => handleRemoveFavorite(f.targetUid)}
                      >
                        <Text style={styles.activityActionText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </>
            )}

            {accountCenterView === 'activity_history' && (
              <>
                <TouchableOpacity style={styles.backRow} onPress={handleBackToAppActivity}>
                  <Ionicons name="chevron-back" size={20} color="#6366F1" />
                  <Text style={styles.backRowText}>Back to App Activity</Text>
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
                    <View
                      key={String(h?.id ?? h?.historyBlockId ?? h?.createdAt?.toMillis?.() ?? idx)}
                      style={styles.activityRow}
                    >
                      <View style={styles.activityRowLeft}>
                        <Text style={styles.activityName}>
                          {String(h?.date ?? '—')}
                          {h?.pickupTime ? ` • ${String(h.pickupTime)}` : ''}
                        </Text>
                        <Text style={styles.activityRole}>{String(h?.role ?? '—')}</Text>
                        <Text style={styles.activityRole}>
                          {`amountPaid: ${String(h?.amountPaid ?? '—')}`}
                        </Text>
                        <Text style={styles.activityRole}>
                          {`otherUserId: ${String(h?.otherUserId ?? '—')}`}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </>
            )}

            {accountCenterView === 'activity_blocked' && (
              <>
                <TouchableOpacity style={styles.backRow} onPress={handleBackToAppActivity}>
                  <Ionicons name="chevron-back" size={20} color="#6366F1" />
                  <Text style={styles.backRowText}>Back to App Activity</Text>
                </TouchableOpacity>

                <Text style={styles.subSectionTitle}>Blocked Accounts</Text>

                {activityMessage ? (
                  <Text style={styles.activityMessage}>{activityMessage}</Text>
                ) : null}

                {activityLoading ? (
                  <Text style={styles.activitySubtle}>Loading...</Text>
                ) : blockedAccounts.length === 0 ? (
                  <Text style={styles.activitySubtle}>No blocked accounts.</Text>
                ) : (
                  blockedAccounts.map((b) => (
                    <View key={b.targetUid} style={styles.activityRow}>
                      <View style={styles.activityRowLeft}>
                        <Text style={styles.activityName}>{b.name}</Text>
                        <Text style={styles.activityRole}>{b.activeRole ?? '—'}</Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.activityActionButton, styles.activityUnblockButton]}
                        onPress={() => handleUnblockAccount(b.targetUid)}
                      >
                        <Text style={styles.activityActionText}>Unblock</Text>
                      </TouchableOpacity>
                    </View>
                  ))
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

                <TouchableOpacity style={styles.modalMenuItem} onPress={handleAppearanceSettingsPress}>
                  <Text style={styles.modalMenuText}>Appearance</Text>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.modalMenuItem} onPress={handlePlaceSettingsMenuPress}>
                  <Text style={styles.modalMenuText}>Place Settings</Text>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.modalMenuItem} onPress={handleGenderPreferencePress}>
                  <Text style={styles.modalMenuText}>Gender Preference</Text>
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
  activityUnblockButton: {
    backgroundColor: '#f5f5f5',
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
