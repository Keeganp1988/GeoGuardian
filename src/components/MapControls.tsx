import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface MapControlsProps {
    overlayMode: 'collapsed' | 'member' | 'tripHistory';
    isMapExpanded: boolean;
    overlayHeight: number;
    onCenterLocation: () => void;
    onToggleLayers: () => void;
    onExpandToggle: () => void;
    theme: string;
}

const MapControls: React.FC<MapControlsProps> = ({
    overlayMode,
    isMapExpanded,
    overlayHeight,
    onCenterLocation,
    onToggleLayers,
    onExpandToggle,
    theme,
}) => {
    const TAB_BAR_HEIGHT = 56;

    // Calculate dynamic bottom offset based on overlay state
    const getControlsBottomOffset = (): number => {
        switch (overlayMode) {
            case 'collapsed':
                return overlayHeight + 120; // Moved higher for better visibility
            case 'member':
                return overlayHeight + 120; // Moved higher for better visibility
            case 'tripHistory':
                return 120; // Moved higher when trip history is full screen
            default:
                return TAB_BAR_HEIGHT + 120;
        }
    };

    const bottomOffset = getControlsBottomOffset();

    return (
        <View style={[styles.container, { bottom: bottomOffset }]}>
            {/* Center location button */}
            <TouchableOpacity
                style={[styles.button, { backgroundColor: theme === 'dark' ? 'rgba(31, 41, 55, 0.9)' : 'rgba(255,255,255,0.9)' }]}
                onPress={onCenterLocation}
            >
                <Ionicons name="locate" size={20} color="#4F46E5" />
            </TouchableOpacity>

            {/* Layers toggle button */}
            <TouchableOpacity
                style={[styles.button, { backgroundColor: theme === 'dark' ? 'rgba(31, 41, 55, 0.9)' : 'rgba(255,255,255,0.9)' }]}
                onPress={onToggleLayers}
            >
                <Ionicons name="layers" size={20} color="#4F46E5" />
            </TouchableOpacity>

            {/* Expand/Collapse button */}
            <TouchableOpacity
                style={[styles.button, { backgroundColor: theme === 'dark' ? 'rgba(31, 41, 55, 0.9)' : 'rgba(255,255,255,0.9)' }]}
                onPress={onExpandToggle}
            >
                <Ionicons name={isMapExpanded ? 'contract-outline' : 'expand-outline'} size={20} color="#4F46E5" />
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        right: 10,
        alignItems: 'flex-end',
        zIndex: 5, // Higher than map (1) but lower than overlays (10+)
        // Ensure controls are always accessible
        pointerEvents: 'box-none',
    },
    button: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 4,
        // Ensure button interactions work properly
        pointerEvents: 'auto',
    },
});

export default MapControls;