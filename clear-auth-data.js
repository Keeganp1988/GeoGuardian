/**
 * Script to clear stored authentication data that might be causing fingerprint prompts
 * Run this with: node clear-auth-data.js
 */

const { execSync } = require('child_process');

console.log('🧹 Clearing stored authentication data...');

try {
  // Clear React Native AsyncStorage data
  console.log('📱 Clearing AsyncStorage data...');
  execSync('npx react-native run-android --reset-cache', { stdio: 'inherit' });
  
  console.log('✅ Authentication data cleared successfully!');
  console.log('');
  console.log('📋 Next steps:');
  console.log('1. Uninstall the app from your device');
  console.log('2. Run: npm start -- --clear');
  console.log('3. Reinstall the app');
  console.log('');
  console.log('This should resolve the fingerprint authentication issues.');
  
} catch (error) {
  console.error('❌ Error clearing data:', error.message);
  console.log('');
  console.log('🔧 Manual steps:');
  console.log('1. Uninstall the app from your device');
  console.log('2. Clear Metro cache: npx react-native start --reset-cache');
  console.log('3. Clean build: cd android && ./gradlew clean && cd ..');
  console.log('4. Reinstall the app');
}