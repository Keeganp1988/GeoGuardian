import React, { useMemo, useCallback, memo } from 'react';
import { View, Text } from 'react-native';
import MapView, { Marker, Region, PROVIDER_GOOGLE } from 'react-native-maps';
import { darkMapStyle, lightMapStyle } from '../constants/mapStyles';
import { collisionDetectionService } from '../services/collisionDetectionService';

export interface MarkerData {
  id: string;
  coordinate: { latitude: number; longitude: number };
  title: string;
  isUser?: boolean;
  member?: {
    userId: string;
    profileColor?: string;
    user?: {
      name?: string;
      profileImage?: string;
    };
  };
  // Collision detection properties
  displayCoordinate?: { latitude: number; longitude: number };
  collisionGroup?: string;
  offsetIndex?: number;
}

interface CircleMapProps {
  initialRegion: Region;
  markers: MarkerData[];
  theme: string;
  mapRef: React.RefObject<MapView | null>;
  mapType?: 'standard' | 'satellite';
  onMapReady?: () => void;
}

const CircleMap: React.FC<CircleMapProps> = memo(({ initialRegion, markers, theme, mapRef, mapType = 'standard', onMapReady }) => {
  console.log('[CircleMap] Rendering with:', { initialRegion, markersCount: markers.length, theme, mapType });

  // Use exact GPS coordinates without collision detection
  const processedMarkers = useMemo(() => {
    console.log('[CircleMap] Input markers:', markers.length);

    if (!markers || markers.length === 0) {
      console.log('[CircleMap] No markers to process');
      return [];
    }

    // Filter out invalid markers but keep exact GPS coordinates
    const validMarkers = markers.filter(marker => {
      const isValid = marker.coordinate &&
        typeof marker.coordinate.latitude === 'number' &&
        typeof marker.coordinate.longitude === 'number' &&
        !isNaN(marker.coordinate.latitude) &&
        !isNaN(marker.coordinate.longitude) &&
        marker.coordinate.latitude !== 0 &&
        marker.coordinate.longitude !== 0 &&
        marker.coordinate.latitude >= -90 &&
        marker.coordinate.latitude <= 90 &&
        marker.coordinate.longitude >= -180 &&
        marker.coordinate.longitude <= 180;

      if (!isValid) {
        console.warn(`[CircleMap] Filtering out invalid marker ${marker.id}:`, marker.coordinate);
      }

      return isValid;
    });

    console.log(`[CircleMap] Using ${validMarkers.length} valid markers at exact GPS coordinates`);
    return validMarkers;
  }, [markers]);

  // Memoized marker rendering function for performance
  const renderMarker = useCallback((marker: MarkerData) => {
    const coordinate = marker.coordinate;

    console.log(`[CircleMap] Rendering marker ${marker.id} (${marker.title}) at exact GPS:`, coordinate);

    try {
      return (
        <Marker
          key={`marker-${marker.id}`}
          coordinate={coordinate}
          title={marker.title}
          onPress={() => console.log('Marker pressed:', marker.title)}
          tracksViewChanges={false} // Performance optimization
          pinColor={marker.isUser ? '#FF0000' : '#00AA00'}
        />
      );
    } catch (error) {
      console.error(`[CircleMap] Error creating marker for ${marker.id}:`, error);
      return null;
    }
  }, []);



  // Map configuration with proper provider and error handling
  try {
    return (
      <MapView
        ref={mapRef}
        style={{ flex: 1, backgroundColor: theme === 'dark' ? '#111827' : '#F3F4F6' }}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        {...(mapType === 'standard' ? { customMapStyle: theme === 'dark' ? darkMapStyle : lightMapStyle } : {})}
        showsUserLocation={false}
        showsMyLocationButton={false}
        mapType={mapType}
        onMapReady={() => {
          console.log('[CircleMap] ✅ Map ready callback triggered');
          onMapReady?.();
        }}
        onLayout={() => {
          console.log('[CircleMap] 📐 Map layout completed');
        }}
        loadingEnabled={true}
        loadingIndicatorColor="#2563EB"
        loadingBackgroundColor={theme === 'dark' ? '#111827' : '#F3F4F6'}
        // Enhanced map interaction settings for better UX
        zoomEnabled={true}
        scrollEnabled={true}
        pitchEnabled={true}
        rotateEnabled={true}
        zoomTapEnabled={true}
        zoomControlEnabled={true}
        // Performance optimizations
        moveOnMarkerPress={false}
        showsCompass={false}
        showsScale={false}
        showsTraffic={false}
        showsIndoors={false}
        showsBuildings={false}
        showsPointsOfInterest={false}
      >
        {processedMarkers.map(renderMarker)}
      </MapView>
    );
  } catch (error) {
    console.error('[CircleMap] ❌ Error rendering MapView:', error);

    // Comprehensive fallback UI if MapView fails to render
    return (
      <View style={{
        flex: 1,
        backgroundColor: theme === 'dark' ? '#1F2937' : '#F3F4F6',
        padding: 20
      }}>
        {/* Map placeholder header */}
        <View style={{
          backgroundColor: theme === 'dark' ? '#374151' : '#E5E7EB',
          padding: 16,
          borderRadius: 8,
          marginBottom: 16
        }}>
          <Text style={{
            color: theme === 'dark' ? '#F9FAFB' : '#111827',
            fontSize: 18,
            fontWeight: 'bold',
            textAlign: 'center',
            marginBottom: 8
          }}>
            Map Unavailable
          </Text>
          <Text style={{
            color: theme === 'dark' ? '#9CA3AF' : '#6B7280',
            textAlign: 'center',
            fontSize: 14
          }}>
            Unable to load map component. Check your internet connection and Google Maps configuration.
          </Text>
        </View>

        {/* Show region info */}
        <View style={{
          backgroundColor: theme === 'dark' ? '#374151' : '#E5E7EB',
          padding: 12,
          borderRadius: 6,
          marginBottom: 12
        }}>
          <Text style={{
            color: theme === 'dark' ? '#F9FAFB' : '#111827',
            fontWeight: '600',
            marginBottom: 4
          }}>
            Current Region:
          </Text>
          <Text style={{ color: theme === 'dark' ? '#9CA3AF' : '#6B7280' }}>
            Lat: {initialRegion.latitude.toFixed(4)}, Lng: {initialRegion.longitude.toFixed(4)}
          </Text>
        </View>

        {/* Show markers info */}
        {processedMarkers.length > 0 && (
          <View style={{
            backgroundColor: theme === 'dark' ? '#374151' : '#E5E7EB',
            padding: 12,
            borderRadius: 6,
            marginBottom: 12
          }}>
            <Text style={{
              color: theme === 'dark' ? '#F9FAFB' : '#111827',
              fontWeight: '600',
              marginBottom: 8
            }}>
              Contacts ({processedMarkers.length}):
            </Text>
            {processedMarkers.slice(0, 5).map(marker => (
              <Text key={marker.id} style={{
                color: theme === 'dark' ? '#9CA3AF' : '#6B7280',
                marginBottom: 4
              }}>
                • {marker.title}: ({(marker.displayCoordinate || marker.coordinate).latitude.toFixed(4)}, {(marker.displayCoordinate || marker.coordinate).longitude.toFixed(4)})
                {marker.collisionGroup && ' (grouped)'}
              </Text>
            ))}
            {processedMarkers.length > 5 && (
              <Text style={{ color: theme === 'dark' ? '#9CA3AF' : '#6B7280' }}>
                ... and {processedMarkers.length - 5} more
              </Text>
            )}
            {collisionDetectionService.getCollisionGroupCount(markers) > 0 && (
              <Text style={{
                color: theme === 'dark' ? '#60A5FA' : '#3B82F6',
                marginTop: 8,
                fontStyle: 'italic'
              }}>
                {collisionDetectionService.getCollisionGroupCount(markers)} collision group(s) detected
              </Text>
            )}
          </View>
        )}

        {/* Error details */}
        <View style={{
          backgroundColor: '#FEE2E2',
          padding: 12,
          borderRadius: 6,
          borderLeftWidth: 4,
          borderLeftColor: '#EF4444'
        }}>
          <Text style={{ color: '#DC2626', fontWeight: '600', marginBottom: 4 }}>
            Technical Details:
          </Text>
          <Text style={{ color: '#7F1D1D', fontSize: 12 }}>
            {error instanceof Error ? error.message : 'Unknown error occurred'}
          </Text>
        </View>
      </View>
    );
  }
});

// Add display name for debugging
CircleMap.displayName = 'CircleMap';

export default CircleMap; 