// Shared React hooks to reduce code duplication

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Platform, Dimensions, Keyboard } from 'react-native';

// Common state management patterns
export const useToggle = (initialValue: boolean = false) => {
  const [value, setValue] = useState(initialValue);
  
  const toggle = useCallback(() => setValue(prev => !prev), []);
  const setTrue = useCallback(() => setValue(true), []);
  const setFalse = useCallback(() => setValue(false), []);
  
  return { value, toggle, setTrue, setFalse, setValue };
};

// Loading state management
export const useLoading = (initialValue: boolean = false) => {
  const [isLoading, setIsLoading] = useState(initialValue);
  
  const startLoading = useCallback(() => setIsLoading(true), []);
  const stopLoading = useCallback(() => setIsLoading(false), []);
  const withLoading = useCallback(async (asyncFn: () => Promise<any>) => {
    startLoading();
    try {
      const result = await asyncFn();
      return result;
    } finally {
      stopLoading();
    }
  }, [startLoading, stopLoading]);
  
  return { isLoading, startLoading, stopLoading, withLoading };
};

// Modal state management
export const useModal = (initialValue: boolean = false) => {
  const [isVisible, setIsVisible] = useState(initialValue);
  
  const showModal = useCallback(() => setIsVisible(true), []);
  const hideModal = useCallback(() => setIsVisible(false), []);
  const toggleModal = useCallback(() => setIsVisible(prev => !prev), []);
  
  return { isVisible, showModal, hideModal, toggleModal };
};

// Screen dimensions hook
export const useScreenDimensions = () => {
  const [dimensions, setDimensions] = useState(() => Dimensions.get('window'));
  
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions(window);
    });
    
    return () => subscription?.remove();
  }, []);
  
  return dimensions;
};

// Keyboard visibility hook
export const useKeyboard = () => {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    
    const showListener = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
      setIsKeyboardVisible(true);
    });
    
    const hideListener = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      setIsKeyboardVisible(false);
    });
    
    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, []);
  
  return { keyboardHeight, isKeyboardVisible };
};

// Debounced value hook
export const useDebounce = <T>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  
  return debouncedValue;
};

// Previous value hook
export const usePrevious = <T>(value: T): T | undefined => {
  const ref = useRef<T>(null as any);
  
  useEffect(() => {
    ref.current = value;
  });
  
  return ref.current;
};

// Async effect hook
export const useAsyncEffect = (
  effect: () => Promise<void | (() => void)>,
  deps?: React.DependencyList
) => {
  useEffect(() => {
    let cleanup: (() => void) | void;
    
    const runEffect = async () => {
      cleanup = await effect();
    };
    
    runEffect();
    
    return () => {
      if (typeof cleanup === 'function') {
        cleanup();
      }
    };
  }, deps);
};

// Interval hook
export const useInterval = (callback: () => void, delay: number | null) => {
  const savedCallback = useRef(callback);
  
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);
  
  useEffect(() => {
    if (delay === null) return;
    
    const id = setInterval(() => savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
};

// Safe area hook for consistent padding
export const useSafeAreaPadding = () => {
  return useMemo(() => ({
    paddingTop: Platform.OS === 'ios' ? 44 : 0,
    paddingBottom: Platform.OS === 'ios' ? 34 : 0,
  }), []);
};