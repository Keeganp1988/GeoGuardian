/**
 * Constants Index
 * 
 * Central export point for all constants including theme, styles, and utilities
 */

// Theme constants (excluding conflicting functions)
export {
  THEME_COLORS,
  TYPOGRAPHY,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  MODAL_STYLES,
  BUTTON_STYLES,
  ALERT_STYLES,
  CARD_STYLES,
  INPUT_STYLES,
  SWITCH_STYLES,
  ICON_STYLES,
  STATUS_DOT_STYLES,
  LAYOUT_STYLES,
  getButtonStyle,
  getButtonTextStyle
} from './theme';

// Style utilities (excluding conflicting functions)
export {
  createButtonStyle,
  createButtonTextStyle,
  createModalStyle,
  createModalContentStyle,
  createCardStyle,
  createMemberCardStyle,
  createInputStyle,
  createStatusDotStyle,
  createRemoveActionStyle,
  createRemoveTextStyle,
  createWarningTextStyle,
  createSectionHeaderStyle,
  createIconContainerStyle,
  combineStyles,
  createSpacingStyle,
  createBorderRadiusStyle,
  getMovementTypeColor
} from './styleUtils';

// Map styles (existing)
export * from './mapStyles';

// Explicitly export utility functions with clear names
export { getBatteryColor, getStatusColor } from './styleUtils';