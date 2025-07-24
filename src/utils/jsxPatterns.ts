// JSX patterns and utilities to standardize component structure

import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Common JSX pattern interfaces
export interface LoadingStateProps {
    isLoading: boolean;
    error?: string | null;
    children: React.ReactNode;
    loadingText?: string;
    errorText?: string;
    onRetry?: () => void;
}

export interface EmptyStateProps {
    icon?: keyof typeof Ionicons.glyphMap;
    title: string;
    description?: string;
    actionText?: string;
    onAction?: () => void;
    theme?: 'light' | 'dark';
}

// Common JSX utility functions

// Safe map with key generation
export const safeMap = <T,>(
    items: T[],
    renderItem: (item: T, index: number) => React.ReactNode,
    keyExtractor?: (item: T, index: number) => string
) => {
    return items.map((item, index) => {
        const key = keyExtractor ? keyExtractor(item, index) : index.toString();
        return React.createElement(React.Fragment, { key }, renderItem(item, index));
    });
};

// Conditional rendering helper
export const renderIf = (condition: boolean, component: React.ReactNode) => {
    return condition ? component : null;
};

// Multiple condition rendering
export const renderSwitch = (
    value: string | number,
    cases: Record<string | number, React.ReactNode>,
    defaultCase?: React.ReactNode
) => {
    return cases[value] || defaultCase || null;
};

// JSX validation helpers
export const validateJSXProps = {
    // Validate that required props are provided
    requireProps: <T extends Record<string, any>>(props: T, requiredKeys: (keyof T)[]) => {
        const missing = requiredKeys.filter(key => props[key] === undefined || props[key] === null);
        if (missing.length > 0) {
            if (process.env.NODE_ENV === 'development') {
                console.warn(`Missing required props: ${missing.join(', ')}`);
            }
        }
        return missing.length === 0;
    },

    // Validate that children are provided when needed
    requireChildren: (children: React.ReactNode) => {
        if (!children) {
            if (process.env.NODE_ENV === 'development') {
                console.warn('Component requires children but none were provided');
            }
            return false;
        }
        return true;
    },

    // Validate array props for map operations
    validateArrayProp: <T>(array: T[] | undefined | null, propName: string) => {
        if (!Array.isArray(array)) {
            if (process.env.NODE_ENV === 'development') {
                console.warn(`${propName} should be an array but received:`, typeof array);
            }
            return false;
        }
        return true;
    },
};