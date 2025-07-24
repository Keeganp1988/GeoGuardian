# Map Layer Simplification Requirements

## Introduction

This specification outlines the requirements for simplifying the map layer options by making Standard the default layer and removing the Hybrid option, leaving only Standard and Satellite map types.

## Requirements

### Requirement 1: Default Map Layer Change

**User Story:** As a user, I want the map to default to Standard view so that I have a clean, traditional map experience when the app loads.

#### Acceptance Criteria

1. WHEN the app loads THEN the map SHALL display in Standard view by default
2. WHEN a user opens the Dashboard screen THEN the map SHALL initialize with Standard map type
3. WHEN the app theme is dark THEN the Standard map SHALL use the custom dark styling
4. WHEN the app theme is light THEN the Standard map SHALL use the default light styling

### Requirement 2: Remove Hybrid Map Type

**User Story:** As a user, I want a simplified map layer selection so that I can easily toggle between just two clear options: Standard and Satellite.

#### Acceptance Criteria

1. WHEN a user taps the layers toggle button THEN the system SHALL cycle between Standard and Satellite only
2. WHEN the map type is Standard THEN the system SHALL NOT display traffic, indoor maps, buildings, or points of interest overlays
3. WHEN the map type is Satellite THEN the system SHALL display satellite imagery without additional overlays
4. WHEN cycling through map types THEN the sequence SHALL be: Standard → Satellite → Standard (no Hybrid)

### Requirement 3: Update Layer Toggle Logic

**User Story:** As a user, I want the layer toggle to work smoothly between the two remaining options so that I can quickly switch between map views.

#### Acceptance Criteria

1. WHEN the current map type is Standard AND user taps layers button THEN the system SHALL switch to Satellite
2. WHEN the current map type is Satellite AND user taps layers button THEN the system SHALL switch to Standard
3. WHEN switching map types THEN the transition SHALL be smooth without map reload
4. WHEN the map type changes THEN the system SHALL maintain the current map position and zoom level

### Requirement 4: Remove Hybrid-Specific Features

**User Story:** As a developer, I want to clean up code by removing Hybrid-specific features so that the codebase is simpler and more maintainable.

#### Acceptance Criteria

1. WHEN map renders in any mode THEN traffic information SHALL NOT be displayed
2. WHEN map renders in any mode THEN indoor maps SHALL NOT be displayed  
3. WHEN map renders in any mode THEN 3D buildings SHALL NOT be displayed
4. WHEN map renders in any mode THEN points of interest SHALL NOT be displayed
5. WHEN map type is Standard THEN custom map styling SHALL be applied based on theme

### Requirement 5: Maintain Existing Functionality

**User Story:** As a user, I want all other map features to continue working normally so that the simplification doesn't break existing functionality.

#### Acceptance Criteria

1. WHEN using any map type THEN user markers SHALL display correctly
2. WHEN using any map type THEN contact markers SHALL display correctly
3. WHEN using any map type THEN map controls (center, expand) SHALL work normally
4. WHEN using any map type THEN zoom, pan, and rotation SHALL work normally
5. WHEN switching themes THEN map styling SHALL update appropriately for Standard view

## Technical Considerations

### Map Type State Management
- Update default state from 'hybrid' to 'standard'
- Modify toggle logic to cycle between only two options
- Remove hybrid-specific conditional rendering

### Performance Impact
- Removing hybrid features should improve map performance
- Standard view with custom styling may have minimal performance impact
- Satellite view should maintain current performance characteristics

### Backward Compatibility
- No breaking changes to existing user data
- Map preferences (if stored) should gracefully handle missing hybrid option
- Existing map markers and overlays should continue to work

## Success Criteria

1. Map defaults to Standard view on app launch
2. Layer toggle cycles smoothly between Standard and Satellite only
3. No hybrid-specific features are displayed in any mode
4. All existing map functionality continues to work
5. Performance is maintained or improved
6. Code is cleaner with hybrid-specific logic removed

## Testing Requirements

### Unit Tests
- Test default map type initialization
- Test layer toggle logic with only two options
- Test theme-based styling application

### Integration Tests  
- Test map rendering in both Standard and Satellite modes
- Test layer switching functionality
- Test map controls interaction with simplified layers

### User Acceptance Tests
- Verify map loads in Standard view by default
- Verify layer toggle works between Standard and Satellite
- Verify no hybrid features are visible
- Verify map performance is acceptable