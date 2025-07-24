/**
 * Style Utilities
 * 
 * Common utility functions for styling and theme-related operations
 */

import { ViewStyle, TextStyle } from 'react-native';
import { 
  THEME_COLORS, 
  BUTTON_STYLES, 
  MODAL_STYLES, 
  SPACING, 
  BORDER_RADIUS, 
  SHADOWS 
} from './theme';

// Type definitions for style utilities
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'warning' | 'success' | 'ghost' | 'disabled';
export type ButtonSize = 'small' | 'medium' | 'large';
export type ShadowSize = 'sm' | 'md' | 'lg' | 'xl';

/**
 * Creates a complete button style object
 */
export const createButtonStyle = (
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'medium',
  customStyle?: ViewStyle
): ViewStyle => {
  const baseStyle = { ...BUTTON_STYLES.base };
  
  // Apply variant styles
  let variantStyle: ViewStyle = {};
  switch (variant) {
    case 'primary':
      variantStyle = BUTTON_STYLES.primary;
      break;
    case 'secondary':
      variantStyle = BUTTON_STYLES.secondary;
      break;
    case 'danger':
      variantStyle = BUTTON_STYLES.danger;
      break;
    case 'warning':
      variantStyle = BUTTON_STYLES.warning;
      break;
    case 'success':
      variantStyle = BUTTON_STYLES.success;
      break;
    case 'ghost':
      variantStyle = BUTTON_STYLES.ghost;
      break;
    case 'disabled':
      variantStyle = BUTTON_STYLES.disabled;
      break;
  }
  
  // Apply size styles
  let sizeStyle: ViewStyle = {};
  switch (size) {
    case 'small':
      sizeStyle = BUTTON_STYLES.small;
      break;
    case 'large':
      sizeStyle = BUTTON_STYLES.large;
      break;
  }
  
  return {
    ...baseStyle,
    ...variantStyle,
    ...sizeStyle,
    ...customStyle,
  };
};

/**
 * Creates button text style
 */
export const createButtonTextStyle = (
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'medium',
  customStyle?: TextStyle
): TextStyle => {
  // Get text style based on variant
  let textStyle: TextStyle = {};
  switch (variant) {
    case 'primary':
      textStyle = BUTTON_STYLES.primaryText;
      break;
    case 'secondary':
      textStyle = BUTTON_STYLES.secondaryText;
      break;
    case 'danger':
      textStyle = BUTTON_STYLES.dangerText;
      break;
    case 'warning':
      textStyle = BUTTON_STYLES.warningText;
      break;
    case 'success':
      textStyle = BUTTON_STYLES.successText;
      break;
    case 'ghost':
      textStyle = BUTTON_STYLES.ghostText;
      break;
    case 'disabled':
      textStyle = BUTTON_STYLES.disabledText;
      break;
  }
  
  // Apply size text styles
  let sizeTextStyle: TextStyle = {};
  switch (size) {
    case 'small':
      sizeTextStyle = BUTTON_STYLES.smallText;
      break;
    case 'large':
      sizeTextStyle = BUTTON_STYLES.largeText;
      break;
  }
  
  return {
    ...textStyle,
    ...sizeTextStyle,
    ...customStyle,
  };
};

/**
 * Creates modal container style
 */
export const createModalStyle = (customStyle?: ViewStyle): ViewStyle => {
  return {
    ...MODAL_STYLES.overlay,
    ...customStyle,
  };
};

/**
 * Creates modal content style
 */
export const createModalContentStyle = (customStyle?: ViewStyle): ViewStyle => {
  return {
    ...MODAL_STYLES.content,
    ...customStyle,
  };
};

/**
 * Creates a card style with optional shadow
 */
export const createCardStyle = (
  shadowSize: ShadowSize = 'sm',
  customStyle?: ViewStyle
): ViewStyle => {
  const shadow = SHADOWS[shadowSize];
  
  return {
    backgroundColor: THEME_COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    ...shadow,
    ...customStyle,
  };
};

/**
 * Creates a member card style
 */
export const createMemberCardStyle = (customStyle?: ViewStyle): ViewStyle => {
  return {
    backgroundColor: THEME_COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
    ...customStyle,
  };
};

/**
 * Creates input field style with state variants
 */
export const createInputStyle = (
  state: 'default' | 'focused' | 'error' | 'disabled' = 'default',
  customStyle?: ViewStyle
): ViewStyle => {
  const baseStyle: ViewStyle = {
    borderWidth: 1,
    borderColor: THEME_COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    backgroundColor: THEME_COLORS.surface,
  };
  
  let stateStyle: ViewStyle = {};
  switch (state) {
    case 'focused':
      stateStyle = {
        borderColor: THEME_COLORS.primary,
        backgroundColor: THEME_COLORS.background,
      };
      break;
    case 'error':
      stateStyle = {
        borderColor: THEME_COLORS.danger,
        backgroundColor: THEME_COLORS.dangerLight,
      };
      break;
    case 'disabled':
      stateStyle = {
        backgroundColor: THEME_COLORS.interactive.disabledBackground,
      };
      break;
  }
  
  return {
    ...baseStyle,
    ...stateStyle,
    ...customStyle,
  };
};

/**
 * Creates status dot style
 */
export const createStatusDotStyle = (
  online: boolean,
  customStyle?: ViewStyle
): ViewStyle => {
  return {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: THEME_COLORS.surface,
    backgroundColor: online ? THEME_COLORS.status.online : THEME_COLORS.status.offline,
    ...customStyle,
  };
};

/**
 * Creates remove/danger action style
 */
export const createRemoveActionStyle = (customStyle?: ViewStyle): ViewStyle => {
  return {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
    ...customStyle,
  };
};

/**
 * Creates remove/danger text style
 */
export const createRemoveTextStyle = (customStyle?: TextStyle): TextStyle => {
  return {
    color: THEME_COLORS.danger,
    fontWeight: '600',
    fontSize: 16,
    ...customStyle,
  };
};

/**
 * Creates warning text style for alerts
 */
export const createWarningTextStyle = (customStyle?: TextStyle): TextStyle => {
  return {
    color: THEME_COLORS.text.danger,
    fontSize: 16,
    textAlign: 'center',
    marginVertical: SPACING.lg,
    lineHeight: 24,
    ...customStyle,
  };
};

/**
 * Creates section header style
 */
export const createSectionHeaderStyle = (customStyle?: ViewStyle): ViewStyle => {
  return {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    ...customStyle,
  };
};

/**
 * Creates icon container style
 */
export const createIconContainerStyle = (
  size: number = 24,
  backgroundColor?: string,
  customStyle?: ViewStyle
): ViewStyle => {
  return {
    width: size + SPACING.sm,
    height: size + SPACING.sm,
    borderRadius: (size + SPACING.sm) / 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: backgroundColor || 'transparent',
    ...customStyle,
  };
};

/**
 * Utility to combine multiple styles safely
 */
export const combineStyles = (...styles: (ViewStyle | TextStyle | undefined)[]): ViewStyle | TextStyle => {
  return styles.reduce<ViewStyle | TextStyle>((combined, style) => {
    if (style) {
      return { ...combined, ...style };
    }
    return combined;
  }, {});
};

/**
 * Creates consistent spacing style
 */
export const createSpacingStyle = (
  type: 'padding' | 'margin',
  size: keyof typeof SPACING,
  direction?: 'top' | 'bottom' | 'left' | 'right' | 'horizontal' | 'vertical'
): ViewStyle => {
  const value = SPACING[size];
  
  if (!direction) {
    return { [type]: value };
  }
  
  switch (direction) {
    case 'top':
      return { [`${type}Top`]: value };
    case 'bottom':
      return { [`${type}Bottom`]: value };
    case 'left':
      return { [`${type}Left`]: value };
    case 'right':
      return { [`${type}Right`]: value };
    case 'horizontal':
      return { [`${type}Horizontal`]: value };
    case 'vertical':
      return { [`${type}Vertical`]: value };
    default:
      return { [type]: value };
  }
};

/**
 * Creates consistent border radius style
 */
export const createBorderRadiusStyle = (
  size: keyof typeof BORDER_RADIUS,
  corners?: 'top' | 'bottom' | 'left' | 'right'
): ViewStyle => {
  const value = BORDER_RADIUS[size];
  
  if (!corners) {
    return { borderRadius: value };
  }
  
  switch (corners) {
    case 'top':
      return {
        borderTopLeftRadius: value,
        borderTopRightRadius: value,
      };
    case 'bottom':
      return {
        borderBottomLeftRadius: value,
        borderBottomRightRadius: value,
      };
    case 'left':
      return {
        borderTopLeftRadius: value,
        borderBottomLeftRadius: value,
      };
    case 'right':
      return {
        borderTopRightRadius: value,
        borderBottomRightRadius: value,
      };
    default:
      return { borderRadius: value };
  }
};

/**
 * Battery color utility
 */
export const getBatteryColor = (
  battery: number,
  isCharging: boolean,
  isOnline: boolean
): string => {
  if (!isOnline) return THEME_COLORS.battery.offline;
  if (isCharging) return THEME_COLORS.battery.charging;
  
  if (battery >= 30) return THEME_COLORS.battery.high;
  if (battery >= 15) return THEME_COLORS.battery.medium;
  return THEME_COLORS.battery.low;
};

/**
 * Status color utility
 */
export const getStatusColor = (online: boolean): string => {
  return online ? THEME_COLORS.status.online : THEME_COLORS.status.offline;
};

/**
 * Movement type color utility
 */
export const getMovementTypeColor = (movementType?: string): string => {
  switch (movementType) {
    case 'stationary':
      return THEME_COLORS.success;
    case 'walking':
      return THEME_COLORS.warning;
    case 'driving':
      return THEME_COLORS.primary;
    default:
      return THEME_COLORS.text.tertiary;
  }
};