import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView from 'react-native-maps';

const SimpleMapTest: React.FC = () => {
  console.log('[SimpleMapTest] Rendering basic map test');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Simple Map Test</Text>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: 37.78825,
          longitude: -122.4324,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        }}
        onMapReady={() => {
          console.log('[SimpleMapTest] ✅ Basic map loaded successfully!');
        }}
        onLayout={() => {
          console.log('[SimpleMapTest] 📐 Basic map layout completed');
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
  },
  title: {
    padding: 10,
    textAlign: 'center',
    backgroundColor: '#4F46E5',
    color: 'white',
    fontWeight: 'bold',
  },
  map: {
    flex: 1,
  },
});

export default SimpleMapTest;