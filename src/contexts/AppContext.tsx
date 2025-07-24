import React, { createContext, useReducer, useEffect, useContext } from 'react';
import { 
  onAuthStateChanged, 
  signOut, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile 
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

// Types
type Member = {
  uid: string;
  name: string;
  email: string;
};

type Circle = {
  id: string;
  name: string;
  inviteCode: string;
  members: Member[];
};

type State = {
  user: any;
  circle: Circle | null;
  isAuthTransitioning: boolean;
  authLoadingState: 'idle' | 'signing-in' | 'initializing' | 'ready';
};

type Action =
  | { type: 'SET_USER'; payload: any }
  | { type: 'SET_CIRCLE'; payload: Circle | null }
  | { type: 'SET_AUTH_TRANSITIONING'; payload: boolean }
  | { type: 'SET_AUTH_LOADING_STATE'; payload: 'idle' | 'signing-in' | 'initializing' | 'ready' }
  | { type: 'LOGOUT' };

// Initial state
const initialState: State = {
  user: null,
  circle: null,
  isAuthTransitioning: false,
  authLoadingState: 'idle',
};

// Reducer
const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.payload };
    case 'SET_CIRCLE':
      return { ...state, circle: action.payload };
    case 'SET_AUTH_TRANSITIONING':
      return { ...state, isAuthTransitioning: action.payload };
    case 'SET_AUTH_LOADING_STATE':
      return { ...state, authLoadingState: action.payload };
    case 'LOGOUT':
      return { 
        ...state, 
        user: null, 
        circle: null, 
        isAuthTransitioning: false, 
        authLoadingState: 'idle' 
      };
    default:
      return state;
  }
};

// Context
export const AppContext = createContext<{
  state: State;
  login: (user: any) => void;
  logout: () => Promise<void>;
  createCircle: (name: string) => Promise<void>;
  joinCircle: (inviteCode: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<void>;
  batchedSignIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  isAuthTransitioning: boolean;
  authLoadingState: 'idle' | 'signing-in' | 'initializing' | 'ready';
}>({
  state: initialState,
  login: () => {},
  logout: async () => {},
  createCircle: async () => {},
  joinCircle: async () => false,
  signIn: async () => {},
  batchedSignIn: async () => {},
  signUp: async () => {},
  isAuthTransitioning: false,
  authLoadingState: 'idle',
});

// Provider
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  const login = (user: any) => {
    dispatch({ type: 'SET_USER', payload: user });
  };

  const logout = async () => {
    dispatch({ type: 'SET_AUTH_TRANSITIONING', payload: true });
    dispatch({ type: 'SET_AUTH_LOADING_STATE', payload: 'signing-in' });
    
    try {
      await signOut(auth);
      dispatch({ type: 'LOGOUT' });
    } catch (error) {
      console.error('Logout error:', error);
      dispatch({ type: 'SET_AUTH_TRANSITIONING', payload: false });
      dispatch({ type: 'SET_AUTH_LOADING_STATE', payload: 'idle' });
      throw error;
    }
  };

  const signIn = async (email: string, password: string) => {
    dispatch({ type: 'SET_AUTH_TRANSITIONING', payload: true });
    dispatch({ type: 'SET_AUTH_LOADING_STATE', payload: 'signing-in' });

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      // User will be set automatically by onAuthStateChanged
      dispatch({ type: 'SET_AUTH_LOADING_STATE', payload: 'initializing' });
    } catch (error) {
      dispatch({ type: 'SET_AUTH_TRANSITIONING', payload: false });
      dispatch({ type: 'SET_AUTH_LOADING_STATE', payload: 'idle' });
      throw error;
    }
  };

  const batchedSignIn = async (email: string, password: string) => {
    // Same as signIn but with batched state updates for better performance
    dispatch({ type: 'SET_AUTH_TRANSITIONING', payload: true });
    dispatch({ type: 'SET_AUTH_LOADING_STATE', payload: 'signing-in' });

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      dispatch({ type: 'SET_AUTH_LOADING_STATE', payload: 'initializing' });
    } catch (error) {
      dispatch({ type: 'SET_AUTH_TRANSITIONING', payload: false });
      dispatch({ type: 'SET_AUTH_LOADING_STATE', payload: 'idle' });
      throw error;
    }
  };

  const signUp = async (email: string, password: string, name: string) => {
    dispatch({ type: 'SET_AUTH_TRANSITIONING', payload: true });
    dispatch({ type: 'SET_AUTH_LOADING_STATE', payload: 'signing-in' });

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Update the user's display name
      await updateProfile(userCredential.user, {
        displayName: name
      });

      // Create user document in Firestore
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        name,
        email,
        createdAt: new Date(),
        lastSeen: new Date(),
        isOnline: true,
      });

      dispatch({ type: 'SET_AUTH_LOADING_STATE', payload: 'initializing' });
    } catch (error) {
      dispatch({ type: 'SET_AUTH_TRANSITIONING', payload: false });
      dispatch({ type: 'SET_AUTH_LOADING_STATE', payload: 'idle' });
      throw error;
    }
  };

  const createCircle = async (name: string) => {
    if (!state.user) return;

    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const circleRef = doc(collection(db, 'circles'));
    const circleData: Circle = {
      id: circleRef.id,
      name,
      inviteCode,
      members: [
        {
          uid: state.user.uid,
          name: state.user.displayName || '',
          email: state.user.email || '',
        },
      ],
    };

    await setDoc(circleRef, circleData);
    dispatch({ type: 'SET_CIRCLE', payload: circleData });

    await setDoc(doc(db, 'users', state.user.uid), {
      circleId: circleRef.id,
    }, { merge: true });
  };

  const joinCircle = async (inviteCode: string): Promise<boolean> => {
    if (!state.user) return false;

    const q = query(collection(db, 'circles'), where('inviteCode', '==', inviteCode));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) return false;

    const circleDoc = querySnapshot.docs[0];
    const circleData = circleDoc.data() as Circle;
    const currentMembers = circleData.members ?? [];

    const alreadyMember = currentMembers.some(member => member.uid === state.user.uid);

    if (!alreadyMember) {
      currentMembers.push({
        uid: state.user.uid,
        name: state.user.displayName || '',
        email: state.user.email || '',
      });

      await updateDoc(circleDoc.ref, { members: currentMembers });
    }

    const updatedCircle = { ...circleData, id: circleDoc.id, members: currentMembers };
    dispatch({ type: 'SET_CIRCLE', payload: updatedCircle });

    await setDoc(doc(db, 'users', state.user.uid), {
      circleId: circleDoc.id,
    }, { merge: true });

    return true;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        dispatch({ type: 'SET_AUTH_LOADING_STATE', payload: 'initializing' });
        login(user);

        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          const userData = userDoc.data();

          if (userData?.circleId) {
            const circleDoc = await getDoc(doc(db, 'circles', userData.circleId));
            if (circleDoc.exists()) {
              const circleData = circleDoc.data() as Circle;
              dispatch({
                type: 'SET_CIRCLE',
                payload: {
                  ...circleData,
                  id: circleDoc.id,
                  members: circleData.members ?? [], // fix for null
                },
              });
            }
          }

          dispatch({ type: 'SET_AUTH_LOADING_STATE', payload: 'ready' });
          dispatch({ type: 'SET_AUTH_TRANSITIONING', payload: false });
        } catch (error) {
          console.error('Error loading user data:', error);
          dispatch({ type: 'SET_AUTH_LOADING_STATE', payload: 'ready' });
          dispatch({ type: 'SET_AUTH_TRANSITIONING', payload: false });
        }
      } else {
        dispatch({ type: 'SET_AUTH_LOADING_STATE', payload: 'idle' });
        dispatch({ type: 'SET_AUTH_TRANSITIONING', payload: false });
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <AppContext.Provider value={{ 
      state, 
      login, 
      logout, 
      createCircle, 
      joinCircle,
      signIn,
      batchedSignIn,
      signUp,
      isAuthTransitioning: state.isAuthTransitioning,
      authLoadingState: state.authLoadingState
    }}>
      {children}
    </AppContext.Provider>
  );
};

// ✅ Hook to access context
export const useApp = () => useContext(AppContext);
