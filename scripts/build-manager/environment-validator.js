const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class EnvironmentValidator {
  constructor() {
    this.checks = [];
    this.requirements = {
      node: { min: '18.0.0', recommended: '20.0.0' },
      npm: { min: '8.0.0', recommended: '10.0.0' },
      java: { min: '11.0.0', recommended: '17.0.0' },
      gradle: { min: '7.0.0', recommended: '8.0.0' },
      androidSdk: { min: '33', recommended: '34' },
      reactNative: { min: '0.70.0', current: '0.79.5' },
      expo: { min: '50.0.0', current: '53.0.20' }
    };
  }

  async initialize() {
    console.log('🔍 Initializing Environment Validator...');
    this.setupChecks();
  }

  setupChecks() {
    this.checks = [
      { name: 'Node.js', check: () => this.checkNodeVersion() },
      { name: 'NPM', check: () => this.checkNpmVersion() },
      { name: 'Java', check: () => this.checkJavaVersion() },
      { name: 'Android SDK', check: () => this.checkAndroidSdk() },
      { name: 'Android Build Tools', check: () => this.checkAndroidBuildTools() },
      { name: 'Gradle', check: () => this.checkGradleVersion() },
      { name: 'React Native', check: () => this.checkReactNativeVersion() },
      { name: 'Expo CLI', check: () => this.checkExpoVersion() },
      { name: 'ADB', check: () => this.checkAdbConnection() },
      { name: 'Environment Variables', check: () => this.checkEnvironmentVariables() },
      { name: 'Project Dependencies', check: () => this.checkProjectDependencies() }
    ];
  }

  async validateAll() {
    console.log('🔍 Running comprehensive environment validation...');
    
    const results = {
      success: true,
      errors: [],
      warnings: [],
      checks: []
    };

    for (const check of this.checks) {
      try {
        console.log(`  Checking ${check.name}...`);
        const result = await check.check();
        
        results.checks.push({
          name: check.name,
          status: result.status,
          version: result.version,
          message: result.message,
          resolution: result.resolution
        });

        if (result.status === 'error') {
          results.success = false;
          results.errors.push(`${check.name}: ${result.message}`);
        } else if (result.status === 'warning') {
          results.warnings.push(`${check.name}: ${result.message}`);
        }
      } catch (error) {
        results.success = false;
        results.errors.push(`${check.name}: ${error.message}`);
        results.checks.push({
          name: check.name,
          status: 'error',
          message: error.message
        });
      }
    }

    this.printValidationResults(results);
    return results;
  }

  async checkNodeVersion() {
    try {
      const version = execSync('node --version', { encoding: 'utf8' }).trim().substring(1);
      const isValid = this.compareVersions(version, this.requirements.node.min) >= 0;
      
      return {
        status: isValid ? 'success' : 'error',
        version,
        message: isValid ? 'Node.js version is compatible' : `Node.js version ${version} is below minimum ${this.requirements.node.min}`,
        resolution: isValid ? null : `Update Node.js to version ${this.requirements.node.recommended} or higher`
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Node.js not found',
        resolution: 'Install Node.js from https://nodejs.org/'
      };
    }
  }

  async checkNpmVersion() {
    try {
      const version = execSync('npm --version', { encoding: 'utf8' }).trim();
      const isValid = this.compareVersions(version, this.requirements.npm.min) >= 0;
      
      return {
        status: isValid ? 'success' : 'warning',
        version,
        message: isValid ? 'NPM version is compatible' : `NPM version ${version} is below recommended ${this.requirements.npm.min}`,
        resolution: isValid ? null : 'Update NPM with: npm install -g npm@latest'
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'NPM not found',
        resolution: 'NPM should be installed with Node.js'
      };
    }
  }

  async checkJavaVersion() {
    try {
      const output = execSync('java -version 2>&1', { encoding: 'utf8' });
      const versionMatch = output.match(/version "([^"]+)"/);
      
      if (!versionMatch) {
        throw new Error('Could not parse Java version');
      }

      const version = versionMatch[1];
      const majorVersion = version.split('.')[0];
      const isValid = parseInt(majorVersion) >= 11;
      
      return {
        status: isValid ? 'success' : 'error',
        version,
        message: isValid ? 'Java version is compatible' : `Java version ${version} is below minimum Java 11`,
        resolution: isValid ? null : 'Install Java 11 or higher (recommended: Java 17)'
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Java not found',
        resolution: 'Install Java Development Kit (JDK) 11 or higher'
      };
    }
  }

  async checkAndroidSdk() {
    const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    
    if (!androidHome) {
      return {
        status: 'error',
        message: 'ANDROID_HOME environment variable not set',
        resolution: 'Set ANDROID_HOME to your Android SDK installation path'
      };
    }

    if (!fs.existsSync(androidHome)) {
      return {
        status: 'error',
        message: `Android SDK not found at ${androidHome}`,
        resolution: 'Install Android SDK or update ANDROID_HOME path'
      };
    }

    // Check for required SDK platforms
    const platformsDir = path.join(androidHome, 'platforms');
    if (!fs.existsSync(platformsDir)) {
      return {
        status: 'error',
        message: 'Android SDK platforms not found',
        resolution: 'Install Android SDK platforms using Android Studio SDK Manager'
      };
    }

    const platforms = fs.readdirSync(platformsDir);
    const hasRequiredPlatform = platforms.some(platform => 
      platform.includes('android-33') || platform.includes('android-34')
    );

    return {
      status: hasRequiredPlatform ? 'success' : 'warning',
      version: androidHome,
      message: hasRequiredPlatform ? 'Android SDK is properly configured' : 'Required Android SDK platforms not found',
      resolution: hasRequiredPlatform ? null : 'Install Android SDK API 33 or 34 using SDK Manager'
    };
  }

  async checkAndroidBuildTools() {
    const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    
    if (!androidHome) {
      return {
        status: 'error',
        message: 'Cannot check build tools without ANDROID_HOME',
        resolution: 'Set ANDROID_HOME environment variable'
      };
    }

    const buildToolsDir = path.join(androidHome, 'build-tools');
    if (!fs.existsSync(buildToolsDir)) {
      return {
        status: 'error',
        message: 'Android build tools not found',
        resolution: 'Install Android build tools using SDK Manager'
      };
    }

    const buildToolVersions = fs.readdirSync(buildToolsDir);
    const hasRecentVersion = buildToolVersions.some(version => 
      this.compareVersions(version, '33.0.0') >= 0
    );

    return {
      status: hasRecentVersion ? 'success' : 'warning',
      version: buildToolVersions.join(', '),
      message: hasRecentVersion ? 'Android build tools are up to date' : 'Consider updating Android build tools',
      resolution: hasRecentVersion ? null : 'Update build tools using Android Studio SDK Manager'
    };
  }

  async checkGradleVersion() {
    try {
      const output = execSync('gradle --version', { encoding: 'utf8' });
      const versionMatch = output.match(/Gradle (\d+\.\d+)/);
      
      if (!versionMatch) {
        throw new Error('Could not parse Gradle version');
      }

      const version = versionMatch[1];
      const isValid = this.compareVersions(version, this.requirements.gradle.min) >= 0;
      
      return {
        status: isValid ? 'success' : 'warning',
        version,
        message: isValid ? 'Gradle version is compatible' : `Gradle version ${version} is below recommended ${this.requirements.gradle.min}`,
        resolution: isValid ? null : 'Update Gradle wrapper or install newer Gradle version'
      };
    } catch (error) {
      // Check for Gradle wrapper
      const gradlewPath = path.join(process.cwd(), 'android', 'gradlew');
      if (fs.existsSync(gradlewPath)) {
        return {
          status: 'success',
          version: 'wrapper',
          message: 'Using Gradle wrapper (recommended)',
          resolution: null
        };
      }

      return {
        status: 'warning',
        message: 'Gradle not found globally, but wrapper may be available',
        resolution: 'Install Gradle or ensure Gradle wrapper is present'
      };
    }
  }

  async checkReactNativeVersion() {
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const version = packageJson.dependencies['react-native'];
      
      if (!version) {
        throw new Error('React Native not found in dependencies');
      }

      const cleanVersion = version.replace(/[\^~]/, '');
      const isValid = this.compareVersions(cleanVersion, this.requirements.reactNative.min) >= 0;
      
      return {
        status: isValid ? 'success' : 'warning',
        version: cleanVersion,
        message: isValid ? 'React Native version is compatible' : `React Native version ${cleanVersion} is below recommended ${this.requirements.reactNative.min}`,
        resolution: isValid ? null : 'Consider updating React Native version'
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Could not determine React Native version',
        resolution: 'Ensure React Native is properly installed'
      };
    }
  }

  async checkExpoVersion() {
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const version = packageJson.dependencies['expo'];
      
      if (!version) {
        throw new Error('Expo not found in dependencies');
      }

      const cleanVersion = version.replace(/[\^~]/, '');
      const isValid = this.compareVersions(cleanVersion, this.requirements.expo.min) >= 0;
      
      return {
        status: isValid ? 'success' : 'warning',
        version: cleanVersion,
        message: isValid ? 'Expo version is compatible' : `Expo version ${cleanVersion} is below recommended ${this.requirements.expo.min}`,
        resolution: isValid ? null : 'Consider updating Expo SDK version'
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Could not determine Expo version',
        resolution: 'Ensure Expo is properly installed'
      };
    }
  }

  async checkAdbConnection() {
    try {
      const output = execSync('adb devices', { encoding: 'utf8' });
      const devices = output.split('\n').filter(line => 
        line.includes('\tdevice') || line.includes('\temulator')
      );
      
      return {
        status: devices.length > 0 ? 'success' : 'warning',
        version: `${devices.length} device(s)`,
        message: devices.length > 0 ? `${devices.length} Android device(s) connected` : 'No Android devices connected',
        resolution: devices.length > 0 ? null : 'Connect an Android device or start an emulator'
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'ADB not found or not working',
        resolution: 'Ensure Android SDK platform-tools are installed and in PATH'
      };
    }
  }

  async checkEnvironmentVariables() {
    const requiredVars = ['ANDROID_HOME', 'JAVA_HOME'];
    const missing = [];
    const present = [];

    for (const varName of requiredVars) {
      const value = process.env[varName] || process.env[varName.replace('_HOME', '_SDK_ROOT')];
      if (value) {
        present.push(`${varName}=${value}`);
      } else {
        missing.push(varName);
      }
    }

    return {
      status: missing.length === 0 ? 'success' : 'warning',
      version: present.join(', '),
      message: missing.length === 0 ? 'All required environment variables are set' : `Missing: ${missing.join(', ')}`,
      resolution: missing.length === 0 ? null : `Set missing environment variables: ${missing.join(', ')}`
    };
  }

  async checkProjectDependencies() {
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const nodeModulesExists = fs.existsSync('node_modules');
      
      if (!nodeModulesExists) {
        return {
          status: 'error',
          message: 'node_modules not found',
          resolution: 'Run npm install to install dependencies'
        };
      }

      // Check for common problematic dependencies
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      const warnings = [];

      // Check for potential version conflicts
      if (dependencies['react'] && dependencies['react-native']) {
        const reactVersion = dependencies['react'].replace(/[\^~]/, '');
        const rnVersion = dependencies['react-native'].replace(/[\^~]/, '');
        
        // Add version compatibility checks here if needed
      }

      return {
        status: warnings.length === 0 ? 'success' : 'warning',
        version: `${Object.keys(dependencies).length} packages`,
        message: warnings.length === 0 ? 'Project dependencies look good' : warnings.join(', '),
        resolution: warnings.length === 0 ? null : 'Review dependency versions for compatibility'
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Could not check project dependencies',
        resolution: 'Ensure package.json exists and is valid'
      };
    }
  }

  compareVersions(version1, version2) {
    const v1parts = version1.split('.').map(Number);
    const v2parts = version2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
      const v1part = v1parts[i] || 0;
      const v2part = v2parts[i] || 0;
      
      if (v1part > v2part) return 1;
      if (v1part < v2part) return -1;
    }
    
    return 0;
  }

  printValidationResults(results) {
    console.log('\n📋 Environment Validation Results:');
    console.log('================================');
    
    results.checks.forEach(check => {
      const icon = check.status === 'success' ? '✅' : 
                   check.status === 'warning' ? '⚠️' : '❌';
      
      console.log(`${icon} ${check.name}: ${check.message}`);
      if (check.version) {
        console.log(`   Version: ${check.version}`);
      }
      if (check.resolution) {
        console.log(`   Resolution: ${check.resolution}`);
      }
    });

    console.log('\n📊 Summary:');
    console.log(`   ✅ Passed: ${results.checks.filter(c => c.status === 'success').length}`);
    console.log(`   ⚠️  Warnings: ${results.warnings.length}`);
    console.log(`   ❌ Errors: ${results.errors.length}`);
    
    if (results.success) {
      console.log('\n🎉 Environment validation passed!');
    } else {
      console.log('\n⚠️  Environment validation found issues that need attention.');
    }
  }
}

module.exports = EnvironmentValidator;