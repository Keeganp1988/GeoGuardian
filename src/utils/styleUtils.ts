/**
 * Style utilities to prevent null reference errors in React Native styles
 */

import { ViewStyle, TextStyle, ImageStyle } from 'react-native';

type Style = ViewStyle | TextStyle | ImageStyle;
type StyleProp = Style | Style[] | null | undefined;

/**
 * Safely combine styles, filtering out null/undefined values
 * @param styles - Array of styles that may contain null/undefined values
 * @returns Safe style array for React Native components
 */
export function safeStyles(...styles: (StyleProp | StyleProp[])[]): Style[] {
  const result: Style[] = [];
  
  for (const style of styles) {
    if (style === null || style === undefined) {
      continue;
    }
    
    if (Array.isArray(style)) {
      // Recursively process nested arrays
      const nestedStyles = safeStyles(...style);
      result.push(...nestedStyles);
    } else {
      result.push(style);
    }
  }
  
  return result;
}

/**
 * Create a safe style array that won't cause forEach errors
 * @param styles - Styles to combine safely
 * @returns Safe style array or single style object
 */
export function combineStyles(...styles: StyleProp[]): StyleProp {
  const safeStyleArray = safeStyles(...styles);
  
  if (safeStyleArray.length === 0) {
    return {};
  }
  
  if (safeStyleArray.length === 1) {
    return safeStyleArray[0];
  }
  
  return safeStyleArray;
}

/**
 * Ensure a style prop is safe for React Native
 * @param style - Style prop that might be null/undefined
 * @returns Safe style prop
 */
export function ensureSafeStyle(style: StyleProp): StyleProp {
  if (style === null || style === undefined) {
    return {};
  }
  
  if (Array.isArray(style)) {
    return safeStyles(style);
  }
  
  return style;
}

/**
 * Create a conditional style that's safe from null references
 * @param condition - Condition to check
 * @param trueStyle - Style to use when condition is true
 * @param falseStyle - Style to use when condition is false
 * @returns Safe conditional style
 */
export function conditionalStyle(
  condition: boolean,
  trueStyle: StyleProp,
  falseStyle?: StyleProp
): StyleProp {
  const selectedStyle = condition ? trueStyle : falseStyle;
  return ensureSafeStyle(selectedStyle);
}

/**
 * Merge theme-based styles safely
 * @param baseStyle - Base style object
 * @param themeStyle - Theme-specific style object
 * @returns Safely merged styles
 */
export function mergeThemeStyles(
  baseStyle: StyleProp,
  themeStyle: StyleProp
): StyleProp {
  return combineStyles(baseStyle, themeStyle);
}