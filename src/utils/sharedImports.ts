// Shared import patterns to reduce duplication

// Most commonly used Firebase Firestore imports
export {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  DocumentReference,
  DocumentSnapshot,
  DocumentData,
  QuerySnapshot,
  WriteBatch,
} from 'firebase/firestore';

// Most commonly used React Navigation imports
export {
  useNavigation,
  useRoute,
  useFocusEffect,
} from '@react-navigation/native';

// Most commonly used React Native components
export {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Modal,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';

// Most commonly used Expo imports
export { Ionicons } from '@expo/vector-icons';

// Most commonly used context imports
export { useApp } from '../contexts/AppContext';
export { useThemeMode } from '../contexts/ThemeContext';

// Most commonly used Firebase service imports
export { getFirebaseDb } from '../firebase/firebase';