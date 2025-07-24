#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class DependencyManager {
  constructor() {
    this.packageJsonPath = path.join(process.cwd(), 'package.json');
    this.packageJson = JSON.parse(fs.readFileSync(this.packageJsonPath, 'utf8'));
  }

  // Check for outdated dependencies
  checkOutdated() {
    console.log('🔍 Checking for outdated dependencies...');
    try {
      execSync('npm outdated', { stdio: 'inherit' });
    } catch (error) {
      console.log('✅ All dependencies are up to date!');
    }
  }

  // Check for security vulnerabilities
  checkSecurity() {
    console.log('🔒 Checking for security vulnerabilities...');
    try {
      execSync('npm audit', { stdio: 'inherit' });
    } catch (error) {
      console.log('⚠️  Security vulnerabilities found. Run "npm audit fix" to resolve.');
    }
  }

  // Clean up dependencies
  cleanup() {
    console.log('🧹 Cleaning up dependencies...');
    if (fs.existsSync('node_modules')) {
      execSync('rmdir /s /q node_modules', { stdio: 'inherit' });
    }
    if (fs.existsSync('package-lock.json')) {
      execSync('del package-lock.json', { stdio: 'inherit' });
    }
    if (fs.existsSync('yarn.lock')) {
      execSync('del yarn.lock', { stdio: 'inherit' });
    }
    execSync('npm install', { stdio: 'inherit' });
  }

  // Update Expo SDK
  updateExpoSDK(targetVersion) {
    console.log(`🚀 Updating Expo SDK to ${targetVersion}...`);
    
    // Update core Expo dependencies
    const expoModules = [
      'expo',
      'expo-battery',
      'expo-constants',
      'expo-dev-client',
      'expo-device',
      'expo-linking',
      'expo-location',
      'expo-notifications',
      'expo-sensors',
      'expo-splash-screen',
      'expo-sqlite',
      'expo-status-bar',
      'expo-task-manager'
    ];

    expoModules.forEach(module => {
      try {
        execSync(`npm install ${module}@latest`, { stdio: 'inherit' });
      } catch (error) {
        console.log(`⚠️  Failed to update ${module}`);
      }
    });

    // Update React and React Native
    execSync('npm install react@18.3.1 react-dom@18.3.1 react-native@0.76.3', { stdio: 'inherit' });
  }

  // Generate dependency report
  generateReport() {
    console.log('📊 Generating dependency report...');
    
    const report = {
      totalDependencies: Object.keys(this.packageJson.dependencies || {}).length,
      totalDevDependencies: Object.keys(this.packageJson.devDependencies || {}).length,
      expoModules: Object.keys(this.packageJson.dependencies || {}).filter(dep => dep.startsWith('expo')),
      reactVersion: this.packageJson.dependencies?.react,
      reactNativeVersion: this.packageJson.dependencies?.['react-native'],
      expoVersion: this.packageJson.dependencies?.expo
    };

    console.log('📋 Dependency Report:');
    console.log(JSON.stringify(report, null, 2));
    
    return report;
  }

  // Validate Expo compatibility
  validateExpoCompatibility() {
    console.log('✅ Validating Expo compatibility...');
    try {
      execSync('npx expo doctor', { stdio: 'inherit' });
    } catch (error) {
      console.log('⚠️  Expo compatibility issues found. Check the output above.');
    }
  }

  // Run full maintenance
  async runMaintenance() {
    console.log('🔧 Running full dependency maintenance...\n');
    
    this.checkOutdated();
    console.log('');
    
    this.checkSecurity();
    console.log('');
    
    this.generateReport();
    console.log('');
    
    this.validateExpoCompatibility();
    console.log('');
    
    console.log('✅ Maintenance complete!');
  }
}

// CLI interface
const args = process.argv.slice(2);
const manager = new DependencyManager();

switch (args[0]) {
  case 'check':
    manager.checkOutdated();
    break;
  case 'security':
    manager.checkSecurity();
    break;
  case 'cleanup':
    manager.cleanup();
    break;
  case 'update-expo':
    manager.updateExpoSDK(args[1] || 'latest');
    break;
  case 'report':
    manager.generateReport();
    break;
  case 'validate':
    manager.validateExpoCompatibility();
    break;
  case 'maintenance':
    manager.runMaintenance();
    break;
  default:
    console.log(`
🔧 Dependency Manager

Usage:
  node scripts/dependency-manager.js <command>

Commands:
  check           - Check for outdated dependencies
  security        - Check for security vulnerabilities
  cleanup         - Clean and reinstall dependencies
  update-expo     - Update Expo SDK and modules
  report          - Generate dependency report
  validate        - Validate Expo compatibility
  maintenance     - Run full maintenance routine

Examples:
  node scripts/dependency-manager.js check
  node scripts/dependency-manager.js update-expo 53
  node scripts/dependency-manager.js maintenance
    `);
} 