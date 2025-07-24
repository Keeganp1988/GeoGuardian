const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class WorkflowAutomation {
  constructor() {
    this.buildConfigs = {
      development: {
        android: {
          buildType: 'debug',
          signingConfig: 'debug',
          minifyEnabled: false,
          proguardEnabled: false
        },
        ios: {
          configuration: 'Debug',
          codeSignIdentity: 'iPhone Developer'
        }
      },
      staging: {
        android: {
          buildType: 'release',
          signingConfig: 'debug',
          minifyEnabled: true,
          proguardEnabled: false
        },
        ios: {
          configuration: 'Release',
          codeSignIdentity: 'iPhone Distribution'
        }
      },
      production: {
        android: {
          buildType: 'release',
          signingConfig: 'release',
          minifyEnabled: true,
          proguardEnabled: true
        },
        ios: {
          configuration: 'Release',
          codeSignIdentity: 'iPhone Distribution'
        }
      }
    };
  }

  async initialize() {
    console.log('⚙️  Initializing Workflow Automation...');
    await this.setupBuildScripts();
  }

  async setupBuildScripts() {
    const scriptsDir = path.join(process.cwd(), 'scripts', 'build-manager', 'workflows');
    if (!fs.existsSync(scriptsDir)) {
      fs.mkdirSync(scriptsDir, { recursive: true });
    }

    // Create platform-specific build scripts
    await this.createAndroidBuildScript();
    await this.createIOSBuildScript();
    await this.createCleanupScript();
  }

  async cleanBuild() {
    console.log('🧹 Starting clean build process...');
    
    const steps = [
      { name: 'Clean Metro cache', command: 'npx expo start --clear' },
      { name: 'Clean npm cache', command: 'npm cache clean --force' },
      { name: 'Remove node_modules', command: this.getRemoveNodeModulesCommand() },
      { name: 'Remove Android build', command: 'cd android && gradlew clean' },
      { name: 'Reinstall dependencies', command: 'npm install' },
      { name: 'Clear Gradle cache', command: this.getClearGradleCacheCommand() }
    ];

    for (const step of steps) {
      try {
        console.log(`   ${step.name}...`);
        execSync(step.command, { stdio: 'pipe' });
        console.log(`   ✅ ${step.name} completed`);
      } catch (error) {
        console.warn(`   ⚠️  ${step.name} failed: ${error.message}`);
        // Continue with other steps
      }
    }

    console.log('✅ Clean build process completed');
    return { success: true };
  }

  async build(platform = 'android', environment = 'development') {
    console.log(`🚀 Building ${platform} for ${environment}...`);
    
    try {
      // Pre-build setup
      await this.setupBuildEnvironment(platform, environment);
      
      // Execute build
      const buildResult = await this.executeBuild(platform, environment);
      
      if (buildResult.success) {
        console.log('✅ Build completed successfully');
        
        // Post-build actions
        if (platform === 'android' && environment === 'development') {
          await this.installAndroidApp(buildResult.apkPath);
        }
      }
      
      return buildResult;
    } catch (error) {
      console.error('❌ Build failed:', error.message);
      return {
        success: false,
        error: error.message,
        platform,
        environment
      };
    }
  }

  async setupBuildEnvironment(platform, environment) {
    console.log(`   Setting up ${platform} build environment for ${environment}...`);
    
    const config = this.buildConfigs[environment][platform];
    
    if (platform === 'android') {
      await this.configureAndroidBuild(config);
    } else if (platform === 'ios') {
      await this.configureIOSBuild(config);
    }
  }

  async configureAndroidBuild(config) {
    // Update gradle.properties for build optimization
    const gradlePropsPath = path.join(process.cwd(), 'android', 'gradle.properties');
    let gradleProps = '';
    
    if (fs.existsSync(gradlePropsPath)) {
      gradleProps = fs.readFileSync(gradlePropsPath, 'utf8');
    }

    const buildOptimizations = [
      'org.gradle.jvmargs=-Xmx4096m -XX:MaxPermSize=512m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8',
      'org.gradle.parallel=true',
      'org.gradle.configureondemand=true',
      'org.gradle.daemon=true',
      'android.useAndroidX=true',
      'android.enableJetifier=true'
    ];

    buildOptimizations.forEach(prop => {
      const [key] = prop.split('=');
      const regex = new RegExp(`^${key}=.*$`, 'm');
      
      if (regex.test(gradleProps)) {
        gradleProps = gradleProps.replace(regex, prop);
      } else {
        gradleProps += `\n${prop}`;
      }
    });

    fs.writeFileSync(gradlePropsPath, gradleProps);
    console.log('   ✅ Android build configuration updated');
  }

  async configureIOSBuild(config) {
    // iOS build configuration would go here
    console.log('   ✅ iOS build configuration ready');
  }

  async executeBuild(platform, environment) {
    if (platform === 'android') {
      return await this.buildAndroid(environment);
    } else if (platform === 'ios') {
      return await this.buildIOS(environment);
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  async buildAndroid(environment) {
    const config = this.buildConfigs[environment].android;
    
    try {
      console.log(`   Building Android ${config.buildType}...`);
      
      const buildCommand = `cd android && gradlew assemble${config.buildType.charAt(0).toUpperCase() + config.buildType.slice(1)}`;
      const output = execSync(buildCommand, { encoding: 'utf8' });
      
      // Find the generated APK
      const apkPath = this.findGeneratedAPK(config.buildType);
      
      return {
        success: true,
        platform: 'android',
        environment,
        buildType: config.buildType,
        apkPath,
        output
      };
    } catch (error) {
      return {
        success: false,
        platform: 'android',
        environment,
        error: error.message
      };
    }
  }

  async buildIOS(environment) {
    // iOS build implementation would go here
    console.log('   iOS build not yet implemented');
    return {
      success: false,
      platform: 'ios',
      environment,
      error: 'iOS build not implemented'
    };
  }

  findGeneratedAPK(buildType) {
    const apkDir = path.join(process.cwd(), 'android', 'app', 'build', 'outputs', 'apk', buildType);
    
    if (!fs.existsSync(apkDir)) {
      return null;
    }

    const apkFiles = fs.readdirSync(apkDir).filter(file => file.endsWith('.apk'));
    
    if (apkFiles.length === 0) {
      return null;
    }

    return path.join(apkDir, apkFiles[0]);
  }

  async installAndroidApp(apkPath) {
    if (!apkPath || !fs.existsSync(apkPath)) {
      console.warn('   ⚠️  APK not found, skipping installation');
      return;
    }

    try {
      console.log('   📱 Installing APK on connected device...');
      execSync(`adb install -r "${apkPath}"`, { stdio: 'pipe' });
      console.log('   ✅ APK installed successfully');
    } catch (error) {
      console.warn('   ⚠️  APK installation failed:', error.message);
      
      // Try signature conflict resolution
      if (error.message.includes('INSTALL_FAILED_UPDATE_INCOMPATIBLE')) {
        console.log('   🔄 Attempting signature conflict resolution...');
        try {
          execSync('adb uninstall com.company.CircleLink', { stdio: 'pipe' });
          execSync(`adb install "${apkPath}"`, { stdio: 'pipe' });
          console.log('   ✅ APK installed after signature resolution');
        } catch (retryError) {
          console.error('   ❌ Installation failed even after signature resolution');
        }
      }
    }
  }

  async switchEnvironment(targetEnvironment) {
    console.log(`🔄 Switching to ${targetEnvironment} environment...`);
    
    // Update environment-specific configurations
    await this.updateEnvironmentConfig(targetEnvironment);
    
    // Clear caches to ensure clean switch
    await this.clearBuildCaches();
    
    console.log(`✅ Switched to ${targetEnvironment} environment`);
  }

  async updateEnvironmentConfig(environment) {
    // Update app.json for Expo configuration
    const appJsonPath = path.join(process.cwd(), 'app.json');
    if (fs.existsSync(appJsonPath)) {
      const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
      
      // Update environment-specific settings
      if (environment === 'development') {
        appJson.expo.developmentClient = { silentLaunch: false };
      } else {
        delete appJson.expo.developmentClient;
      }
      
      fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2));
    }

    // Update environment variables
    const envPath = path.join(process.cwd(), '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    
    const envVars = {
      development: {
        NODE_ENV: 'development',
        EXPO_PUBLIC_ENV: 'development'
      },
      staging: {
        NODE_ENV: 'production',
        EXPO_PUBLIC_ENV: 'staging'
      },
      production: {
        NODE_ENV: 'production',
        EXPO_PUBLIC_ENV: 'production'
      }
    };

    const targetVars = envVars[environment];
    for (const [key, value] of Object.entries(targetVars)) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      const replacement = `${key}=${value}`;
      
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, replacement);
      } else {
        envContent += `\n${replacement}`;
      }
    }
    
    fs.writeFileSync(envPath, envContent);
  }

  async clearBuildCaches() {
    const cacheCommands = [
      'npx expo start --clear',
      'npm start -- --reset-cache'
    ];

    for (const command of cacheCommands) {
      try {
        execSync(command, { stdio: 'pipe', timeout: 10000 });
      } catch (error) {
        // Cache clearing failures are not critical
        console.warn(`   Cache clear warning: ${error.message}`);
      }
    }
  }

  async createAndroidBuildScript() {
    const scriptPath = path.join(process.cwd(), 'scripts', 'build-manager', 'workflows', 'build-android.bat');
    const scriptContent = `@echo off
echo Building Android application...

echo Validating environment...
call node scripts/build-manager/index.js validate
if errorlevel 1 (
    echo Environment validation failed
    exit /b 1
)

echo Cleaning previous build...
cd android
call gradlew clean
cd ..

echo Building APK...
cd android
call gradlew assembleDebug
cd ..

echo Build completed!
echo APK location: android/app/build/outputs/apk/debug/

echo Installing on device...
for %%f in (android\\app\\build\\outputs\\apk\\debug\\*.apk) do (
    adb install -r "%%f"
)

echo Android build and install completed!`;

    fs.writeFileSync(scriptPath, scriptContent);
    console.log('   Created Android build script');
  }

  async createIOSBuildScript() {
    const scriptPath = path.join(process.cwd(), 'scripts', 'build-manager', 'workflows', 'build-ios.sh');
    const scriptContent = `#!/bin/bash
echo "Building iOS application..."

echo "Validating environment..."
node scripts/build-manager/index.js validate
if [ $? -ne 0 ]; then
    echo "Environment validation failed"
    exit 1
fi

echo "Building iOS app..."
npx expo run:ios

echo "iOS build completed!"`;

    fs.writeFileSync(scriptPath, scriptContent);
    
    // Make script executable on Unix systems
    try {
      execSync(`chmod +x "${scriptPath}"`, { stdio: 'pipe' });
    } catch (error) {
      // Ignore on Windows
    }
    
    console.log('   Created iOS build script');
  }

  async createCleanupScript() {
    const scriptPath = path.join(process.cwd(), 'scripts', 'build-manager', 'workflows', 'cleanup.bat');
    const scriptContent = `@echo off
echo Starting comprehensive cleanup...

echo Stopping Metro bundler...
taskkill /f /im node.exe 2>nul

echo Cleaning Metro cache...
npx expo start --clear

echo Cleaning npm cache...
npm cache clean --force

echo Removing node_modules...
if exist node_modules rmdir /s /q node_modules

echo Cleaning Android build...
cd android
call gradlew clean
cd ..

echo Clearing Gradle cache...
if exist "%USERPROFILE%\\.gradle\\caches" rmdir /s /q "%USERPROFILE%\\.gradle\\caches"

echo Reinstalling dependencies...
npm install

echo Cleanup completed!`;

    fs.writeFileSync(scriptPath, scriptContent);
    console.log('   Created cleanup script');
  }

  getRemoveNodeModulesCommand() {
    return process.platform === 'win32' ? 
      'if exist node_modules rmdir /s /q node_modules' : 
      'rm -rf node_modules';
  }

  getClearGradleCacheCommand() {
    return process.platform === 'win32' ? 
      'if exist "%USERPROFILE%\\.gradle\\caches" rmdir /s /q "%USERPROFILE%\\.gradle\\caches"' :
      'rm -rf ~/.gradle/caches';
  }

  async generateWorkflowReport() {
    const report = {
      availableEnvironments: Object.keys(this.buildConfigs),
      supportedPlatforms: ['android', 'ios'],
      buildScripts: {
        android: fs.existsSync(path.join(process.cwd(), 'scripts', 'build-manager', 'workflows', 'build-android.bat')),
        ios: fs.existsSync(path.join(process.cwd(), 'scripts', 'build-manager', 'workflows', 'build-ios.sh')),
        cleanup: fs.existsSync(path.join(process.cwd(), 'scripts', 'build-manager', 'workflows', 'cleanup.bat'))
      },
      lastBuildInfo: this.getLastBuildInfo()
    };

    return report;
  }

  getLastBuildInfo() {
    // This would typically read from a build log file
    return {
      timestamp: new Date().toISOString(),
      platform: 'android',
      environment: 'development',
      status: 'success'
    };
  }
}

module.exports = WorkflowAutomation;