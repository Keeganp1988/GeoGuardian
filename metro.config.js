const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Enable stable package exports for better module resolution
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_enableSymlinks = false;

// Configure resolver to handle Firebase modules correctly
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

// Configure transformer settings to prevent module ID conflicts
config.transformer.minifierConfig = {
  keep_fnames: true,
  mangle: {
    keep_fnames: true,
  },
};

// Add resolver configuration for better module resolution
config.resolver.sourceExts = [...config.resolver.sourceExts, 'mjs'];

module.exports = config; 