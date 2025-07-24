// Shared component patterns to reduce code duplication

import { StyleSheet, Dimensions, Platform } from 'react-native';

// Common screen dimensions
export const SCREEN_DIMENSIONS = {
  width: Dimensions.get('window').width,
  height: Dimensions.get('window').height,
  scale: Dimensions.get('window').scale,
};

// Common style patterns
export const commonStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  
  scrollContainer: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  
  section: {
    marginVertical: 10,
    paddingHorizontal: 20,
  },
  
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
    marginTop: 4,
  },
  
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    margin: 20,
    maxHeight: '80%',
  },
  
  separator: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 10,
  },
  
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  spaceBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 44 : 0,
  },
});

// Common layout patterns
export const layoutPatterns = {
  // Full screen with safe area
  fullScreenSafe: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 44 : 0,
    paddingBottom: Platform.OS === 'ios' ? 34 : 0,
  },
  
  // Centered content
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Header with content
  headerContent: {
    header: {
      paddingTop: Platform.OS === 'ios' ? 44 : 20,
      paddingBottom: 10,
      paddingHorizontal: 20,
    },
    content: {
      flex: 1,
      paddingHorizontal: 20,
    },
  },
  
  // Bottom sheet style
  bottomSheet: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
};

// Common animation patterns
export const animationPatterns = {
  // Fade in animation
  fadeIn: {
    from: { opacity: 0 },
    to: { opacity: 1 },
    duration: 300,
  },
  
  // Slide up animation
  slideUp: {
    from: { transform: [{ translateY: 100 }] },
    to: { transform: [{ translateY: 0 }] },
    duration: 300,
  },
  
  // Scale animation
  scale: {
    from: { transform: [{ scale: 0.8 }] },
    to: { transform: [{ scale: 1 }] },
    duration: 200,
  },
};

// Common component state patterns
export const createComponentState = <T>(initialState: T) => {
  return {
    loading: false,
    error: null as string | null,
    data: initialState,
  };
};

// Common loading states
export const loadingStates = {
  idle: 'idle' as const,
  loading: 'loading' as const,
  success: 'success' as const,
  error: 'error' as const,
};

// Common form validation patterns
export const validationPatterns = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^\+?[\d\s\-\(\)]+$/,
  required: (value: unknown) => {
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    return value != null && value !== '';
  },
  minLength: (min: number) => (value: string) => {
    return value && value.length >= min;
  },
  maxLength: (max: number) => (value: string) => {
    return !value || value.length <= max;
  },
};

// Common responsive patterns
export const responsive = {
  isSmallScreen: SCREEN_DIMENSIONS.width < 375,
  isMediumScreen: SCREEN_DIMENSIONS.width >= 375 && SCREEN_DIMENSIONS.width < 414,
  isLargeScreen: SCREEN_DIMENSIONS.width >= 414,
  
  // Responsive padding
  padding: {
    small: SCREEN_DIMENSIONS.width < 375 ? 12 : 16,
    medium: SCREEN_DIMENSIONS.width < 375 ? 16 : 20,
    large: SCREEN_DIMENSIONS.width < 375 ? 20 : 24,
  },
  
  // Responsive font sizes
  fontSize: {
    small: SCREEN_DIMENSIONS.width < 375 ? 12 : 14,
    medium: SCREEN_DIMENSIONS.width < 375 ? 14 : 16,
    large: SCREEN_DIMENSIONS.width < 375 ? 16 : 18,
    title: SCREEN_DIMENSIONS.width < 375 ? 18 : 20,
    header: SCREEN_DIMENSIONS.width < 375 ? 20 : 24,
  },
};