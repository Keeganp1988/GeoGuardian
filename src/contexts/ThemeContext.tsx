import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: 'light' | 'dark';
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  isThemeReady: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = '@theme_mode';

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Initialize with system theme immediately to prevent white flash
  const systemColorScheme = Appearance.getColorScheme();
  const initialTheme = systemColorScheme === 'dark' ? 'dark' : 'light';
  
  const [mode, setMode] = useState<ThemeMode>('system');
  const [theme, setTheme] = useState<'light' | 'dark'>(initialTheme);
  const [isThemeReady, setIsThemeReady] = useState(true);

  // Function to determine the current theme based on mode
  const determineTheme = (currentMode: ThemeMode): 'light' | 'dark' => {
    if (currentMode === 'system') {
      const systemColorScheme = Appearance.getColorScheme();
      return systemColorScheme === 'dark' ? 'dark' : 'light';
    }
    return currentMode;
  };

  // Load saved theme mode on app start
  useEffect(() => {
    // Set theme ready immediately with system theme to prevent flash
    setIsThemeReady(true);
    
    const loadTheme = async () => {
      try {
        const savedMode = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        let initialMode: ThemeMode = 'system';
        
        if (savedMode && ['light', 'dark', 'system'].includes(savedMode)) {
          initialMode = savedMode as ThemeMode;
        }
        
        // Only update if different from current mode
        if (initialMode !== mode) {
          setMode(initialMode);
          setTheme(determineTheme(initialMode));
        }
      } catch (error) {
        console.error("Failed to load theme from storage", error);
        // Keep current system theme
      }
    };

    // Load theme asynchronously without blocking UI
    loadTheme();
  }, []);

  // Listen for system theme changes
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme: newColorScheme }) => {
      if (mode === 'system') {
        const newTheme = newColorScheme === 'dark' ? 'dark' : 'light';
        setTheme(newTheme);
      }
    });

    return () => subscription.remove();
  }, [mode]);

  // Update theme when mode changes
  useEffect(() => {
    setTheme(determineTheme(mode));
  }, [mode]);

  const handleSetMode = async (newMode: ThemeMode) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newMode);
      setMode(newMode);
      setTheme(determineTheme(newMode));
    } catch (error) {
      console.error("Failed to save theme to storage", error);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode: handleSetMode, isThemeReady }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeMode() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeMode must be used within a ThemeProvider');
  }
  return context;
}