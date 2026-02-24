import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { signOut } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';

export default function HomeScreen() {
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    loadName();
  }, [user]);

  const loadName = async () => {
    if (!user) return;

    try {
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        setSavedName(data.name || '');
        setName(data.name || '');
      }
    } catch (error: any) {
      console.error('Error loading name:', error);
    }
  };

  const handleSaveName = async () => {
    if (!user) return;

    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }

    setLoading(true);
    try {
      const docRef = doc(db, 'users', user.uid);
      await setDoc(docRef, { name: name.trim() }, { merge: true });
      setSavedName(name.trim());
      Alert.alert('Success', 'Name saved to Firebase!');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.replace('./login' as any);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutButtonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Hello World!</Text>
        <Text style={styles.subtitle}>What is your name?</Text>

        {savedName ? (
          <View style={styles.savedNameContainer}>
            <Text style={styles.savedNameLabel}>Saved in Firebase:</Text>
            <Text style={styles.savedNameText}>{savedName}</Text>
          </View>
        ) : null}

        <TextInput
          style={styles.input}
          placeholder="Enter your name"
          value={name}
          onChangeText={setName}
          placeholderTextColor="#999"
        />

        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSaveName}
          disabled={loading}
        >
          <Text style={styles.saveButtonText}>
            {loading ? 'Saving...' : 'Save to Firebase'}
          </Text>
        </TouchableOpacity>

        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            Your name will be saved to Firestore database
          </Text>
          {user?.email && (
            <Text style={styles.userEmail}>Logged in as: {user.email}</Text>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
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
    alignItems: 'flex-end',
  },
  signOutButton: {
    backgroundColor: '#ff3b30',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  signOutButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 24,
    color: '#666',
    marginBottom: 32,
    textAlign: 'center',
  },
  savedNameContainer: {
    backgroundColor: '#e8f5e9',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  savedNameLabel: {
    fontSize: 14,
    color: '#2e7d32',
    marginBottom: 4,
  },
  savedNameText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1b5e20',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    textAlign: 'center',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  infoContainer: {
    alignItems: 'center',
    marginTop: 16,
  },
  infoText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 8,
  },
  userEmail: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
});
