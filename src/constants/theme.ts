/**
 * Theme Constants and Styling Utilities
 * 
 * This file provides standardized colors, modal styles, and button styles
 * for consistent UI components across the app.
 */

// Core Color Palette
export const THEME_COLORS = {
  // Primary Colors
  primary: '#2563EB',
  primaryLight: '#DBEAFE',
  primaryDark: '#1E40AF',
  
  // Status Colors
  success: '#22C55E',
  successLight: '#DCFCE7',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  danger: '#EF4444',
  dangerLight: '#FEE2E2',
  
  // Neutral Colors
  background: '#FFFFFF',
  surface: '#F9FAFB',
  surfaceSecondary: '#F3F4F6',
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  
  // Text Colors
  text: {
    primary: '#1E293B',
    secondary: '#64748B',
    tertiary: '#9CA3AF',
    light: '#A1A1AA',
    danger: '#EF4444',
    success: '#22C55E',
    warning: '#F59E0B',
    white: '#FFFFFF',
  },
  
  // Interactive Colors
  interactive: {
    hover: 'rgba(37, 99, 235, 0.1)',
    pressed: 'rgba(37, 99, 235, 0.2)',
    disabled: '#9CA3AF',
    disabledBackground: '#F3F4F6',
  },
  
  // Overlay Colors
  overlay: {
    light: 'rgba(0, 0, 0, 0.3)',
    medium: 'rgba(0, 0, 0, 0.5)',
    dark: 'rgba(0, 0, 0, 0.7)',
  },
  
  // Status Indicator Colors
  status: {
    online: '#22C55E',
    offline: '#6B7280',
    away: '#F59E0B',
  },
  
  // Battery Colors
  battery: {
    high: '#22C55E',
    medium: '#F59E0B',
    low: '#EF4444',
    charging: '#22C55E',
    offline: '#A1A1AA',
  },
} as const;

// Typography Styles
export const TYPOGRAPHY = {
  // Headings
  h1: {
    fontSize: 32,
    fontWeight: 'bold' as const,
    lineHeight: 40,
    color: THEME_COLORS.text.primary,
  },
  h2: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    lineHeight: 32,
    color: THEME_COLORS.text.primary,
  },
  h3: {
    fontSize: 20,
    fontWeight: '600' as const,
    lineHeight: 28,
    color: THEME_COLORS.text.primary,
  },
  h4: {
    fontSize: 18,
    fontWeight: '600' as const,
    lineHeight: 24,
    color: THEME_COLORS.text.primary,
  },
  
  // Body Text
  body: {
    fontSize: 16,
    fontWeight: 'normal' as const,
    lineHeight: 24,
    color: THEME_COLORS.text.primary,
  },
  bodySecondary: {
    fontSize: 16,
    fontWeight: 'normal' as const,
    lineHeight: 24,
    color: THEME_COLORS.text.secondary,
  },
  
  // Small Text
  small: {
    fontSize: 14,
    fontWeight: 'normal' as const,
    lineHeight: 20,
    color: THEME_COLORS.text.secondary,
  },
  caption: {
    fontSize: 12,
    fontWeight: 'normal' as const,
    lineHeight: 16,
    color: THEME_COLORS.text.tertiary,
  },
  
  // Labels
  label: {
    fontSize: 14,
    fontWeight: '600' as const,
    lineHeight: 20,
    color: THEME_COLORS.text.primary,
  },
  labelSecondary: {
    fontSize: 13,
    fontWeight: 'normal' as const,
    lineHeight: 18,
    color: THEME_COLORS.text.secondary,
  },
} as const;

// Spacing Constants
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  xxxxl: 48,
} as const;

// Border Radius Constants
export const BORDER_RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 20,
  xxxl: 24,
  full: 9999,
} as const;

// Shadow Styles
export const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 12,
  },
} as const;

// Modal Styles
export const MODAL_STYLES = {
  // Modal Overlay
  overlay: {
    flex: 1,
    backgroundColor: THEME_COLORS.overlay.medium,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: SPACING.xl,
  },
  
  // Modal Content Container
  content: {
    backgroundColor: THEME_COLORS.background,
    borderRadius: BORDER_RADIUS.xxxl,
    padding: SPACING.xxxl,
    alignItems: 'center' as const,
    width: '100%',
    maxWidth: 400,
    ...SHADOWS.xl,
  },
  
  // Modal Header
  header: {
    fontSize: 22,
    fontWeight: 'bold' as const,
    marginBottom: SPACING.lg,
    color: THEME_COLORS.text.primary,
    textAlign: 'center' as const,
  },
  
  // Modal Close Button
  closeButton: {
    position: 'absolute' as const,
    top: SPACING.md,
    right: SPACING.md,
    padding: SPACING.sm,
  },
  
  // Modal Section
  section: {
    width: '100%',
    marginBottom: SPACING.md,
  },
  
  // Modal Row
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: SPACING.md,
  },
  
  // Modal Text Input
  textInput: {
    borderWidth: 1,
    borderColor: THEME_COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: 16,
    marginTop: SPACING.sm,
    backgroundColor: THEME_COLORS.surface,
    color: THEME_COLORS.text.primary,
  },
} as const;

// Button Styles
export const BUTTON_STYLES = {
  // Base Button Style
  base: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.xxxl,
    minWidth: 120,
  },
  
  // Primary Button
  primary: {
    backgroundColor: THEME_COLORS.primary,
  },
  primaryText: {
    color: THEME_COLORS.text.white,
    fontWeight: '600' as const,
    fontSize: 16,
  },
  
  // Secondary Button
  secondary: {
    backgroundColor: THEME_COLORS.surface,
    borderWidth: 1,
    borderColor: THEME_COLORS.border,
  },
  secondaryText: {
    color: THEME_COLORS.text.primary,
    fontWeight: '600' as const,
    fontSize: 16,
  },
  
  // Danger Button
  danger: {
    backgroundColor: THEME_COLORS.danger,
  },
  dangerText: {
    color: THEME_COLORS.text.white,
    fontWeight: '600' as const,
    fontSize: 16,
  },
  
  // Warning Button
  warning: {
    backgroundColor: THEME_COLORS.warning,
  },
  warningText: {
    color: THEME_COLORS.text.white,
    fontWeight: '600' as const,
    fontSize: 16,
  },
  
  // Success Button
  success: {
    backgroundColor: THEME_COLORS.success,
  },
  successText: {
    color: THEME_COLORS.text.white,
    fontWeight: '600' as const,
    fontSize: 16,
  },
  
  // Ghost Button (text only)
  ghost: {
    backgroundColor: 'transparent',
  },
  ghostText: {
    color: THEME_COLORS.primary,
    fontWeight: '600' as const,
    fontSize: 16,
  },
  
  // Disabled Button
  disabled: {
    backgroundColor: THEME_COLORS.interactive.disabledBackground,
  },
  disabledText: {
    color: THEME_COLORS.interactive.disabled,
    fontWeight: '600' as const,
    fontSize: 16,
  },
  
  // Icon Button
  icon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.full,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  
  // Small Button
  small: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    minWidth: 80,
  },
  smallText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  
  // Large Button
  large: {
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    minWidth: 160,
  },
  largeText: {
    fontSize: 18,
    fontWeight: '600' as const,
  },
} as const;

// Alert/Warning Styles
export const ALERT_STYLES = {
  // Warning Text
  warningText: {
    color: THEME_COLORS.text.danger,
    fontSize: 16,
    textAlign: 'center' as const,
    marginVertical: SPACING.lg,
    lineHeight: 24,
  },
  
  // Info Text
  infoText: {
    color: THEME_COLORS.text.secondary,
    fontSize: 14,
    textAlign: 'center' as const,
    marginVertical: SPACING.md,
    lineHeight: 20,
  },
  
  // Success Text
  successText: {
    color: THEME_COLORS.text.success,
    fontSize: 16,
    textAlign: 'center' as const,
    marginVertical: SPACING.lg,
    lineHeight: 24,
  },
} as const;

// Card Styles
export const CARD_STYLES = {
  // Base Card
  base: {
    backgroundColor: THEME_COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  
  // Member Card
  member: {
    backgroundColor: THEME_COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  
  // Section Card
  section: {
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: THEME_COLORS.surface,
    marginBottom: 0,
  },
} as const;

// Input Styles
export const INPUT_STYLES = {
  // Base Input
  base: {
    borderWidth: 1,
    borderColor: THEME_COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: 16,
    backgroundColor: THEME_COLORS.surface,
    color: THEME_COLORS.text.primary,
  },
  
  // Focused Input
  focused: {
    borderColor: THEME_COLORS.primary,
    backgroundColor: THEME_COLORS.background,
  },
  
  // Error Input
  error: {
    borderColor: THEME_COLORS.danger,
    backgroundColor: THEME_COLORS.dangerLight,
  },
  
  // Disabled Input
  disabled: {
    backgroundColor: THEME_COLORS.interactive.disabledBackground,
    color: THEME_COLORS.interactive.disabled,
  },
} as const;

// Switch/Toggle Styles
export const SWITCH_STYLES = {
  container: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 2,
  },
  circle: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  // Colors
  colors: {
    on: {
      background: THEME_COLORS.primaryLight,
      circle: THEME_COLORS.primary,
    },
    off: {
      background: THEME_COLORS.surfaceSecondary,
      circle: THEME_COLORS.border,
    },
  },
} as const;

// Icon Styles
export const ICON_STYLES = {
  sizes: {
    xs: 16,
    sm: 20,
    md: 24,
    lg: 32,
    xl: 48,
  },
  colors: {
    primary: THEME_COLORS.primary,
    secondary: THEME_COLORS.text.secondary,
    tertiary: THEME_COLORS.text.tertiary,
    danger: THEME_COLORS.danger,
    success: THEME_COLORS.success,
    warning: THEME_COLORS.warning,
  },
} as const;

// Status Dot Styles
export const STATUS_DOT_STYLES = {
  base: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: THEME_COLORS.surface,
  },
  online: {
    backgroundColor: THEME_COLORS.status.online,
  },
  offline: {
    backgroundColor: THEME_COLORS.status.offline,
  },
  away: {
    backgroundColor: THEME_COLORS.status.away,
  },
} as const;

// Layout Styles
export const LAYOUT_STYLES = {
  container: {
    flex: 1,
    backgroundColor: THEME_COLORS.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  spaceBetween: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  padding: {
    xs: { padding: SPACING.xs },
    sm: { padding: SPACING.sm },
    md: { padding: SPACING.md },
    lg: { padding: SPACING.lg },
    xl: { padding: SPACING.xl },
    xxl: { padding: SPACING.xxl },
  },
  margin: {
    xs: { margin: SPACING.xs },
    sm: { margin: SPACING.sm },
    md: { margin: SPACING.md },
    lg: { margin: SPACING.lg },
    xl: { margin: SPACING.xl },
    xxl: { margin: SPACING.xxl },
  },
} as const;

// Utility Functions
export const getButtonStyle = (variant: keyof typeof BUTTON_STYLES, size?: 'small' | 'large') => {
  const baseStyle = { ...BUTTON_STYLES.base };
  const variantStyle = BUTTON_STYLES[variant] || {};
  const sizeStyle = size === 'small' ? BUTTON_STYLES.small : size === 'large' ? BUTTON_STYLES.large : {};
  
  return { ...baseStyle, ...variantStyle, ...sizeStyle };
};

export const getButtonTextStyle = (variant: keyof typeof BUTTON_STYLES, size?: 'small' | 'large') => {
  const variantTextKey = `${variant}Text` as keyof typeof BUTTON_STYLES;
  const variantTextStyle = BUTTON_STYLES[variantTextKey] || BUTTON_STYLES.primaryText;
  const sizeTextStyle = size === 'small' ? BUTTON_STYLES.smallText : size === 'large' ? BUTTON_STYLES.largeText : {};
  
  return { ...variantTextStyle, ...sizeTextStyle };
};

