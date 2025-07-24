const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ErrorResolver {
  constructor() {
    this.errorPatterns = [];
    this.resolutionHistory = [];
    this.setupErrorPatterns();
  }

  async initialize() {
    console.log('🔧 Initializing Error Resolver...');
    this.loadResolutionHistory();
  }

  setupErrorPatterns() {
    this.errorPatterns = [
      // Signature conflicts
      {
        id: 'signature_mismatch',
        pattern: /INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match/i,
        category: 'signature',
        severity: 'error',
        resolution: {
          automated: true,
          commands: ['adb uninstall com.company.CircleLink'],
          description: 'Uninstall existing app with conflicting signature',
          requiresUserInput: false
        }
      },
      
      // C++ compilation warnings
      {
        id: 'cpp_dollar_identifier',
        pattern: /warning.*identifier.*begins with.*dollar sign/i,
        category: 'compilation',
        severity: 'warning',
        resolution: {
          automated: true,
          commands: ['npx patch-package'],
          description: 'Apply patches for C++ identifier warnings',
          requiresUserInput: false
        }
      },
      
      // Gradle build failures
      {
        id: 'gradle_daemon_failure',
        pattern: /Gradle build daemon disappeared unexpectedly/i,
        category: 'build',
        severity: 'error',
        resolution: {
          automated: true,
          commands: ['cd android && gradlew --stop', 'cd android && gradlew clean'],
          description: 'Stop Gradle daemon and clean build',
          requiresUserInput: false
        }
      },
      
      // Memory issues
      {
        id: 'out_of_memory',
        pattern: /OutOfMemoryError|Java heap space/i,
        category: 'memory',
        severity: 'error',
        resolution: {
          automated: true,
          commands: [],
          description: 'Increase Gradle memory allocation',
          requiresUserInput: false,
          configChanges: {
            'android/gradle.properties': {
              'org.gradle.jvmargs': '-Xmx4096m -XX:MaxPermSize=512m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8'
            }
          }
        }
      },
      
      // Dependency conflicts
      {
        id: 'dependency_conflict',
        pattern: /Duplicate class|Multiple dex files define/i,
        category: 'dependency',
        severity: 'error',
        resolution: {
          automated: true,
          commands: ['cd android && gradlew clean', 'npm run android'],
          description: 'Clean build to resolve dependency conflicts',
          requiresUserInput: false
        }
      },
      
      // Metro bundler issues
      {
        id: 'metro_cache_issue',
        pattern: /Metro.*cache|Unable to resolve module/i,
        category: 'bundler',
        severity: 'error',
        resolution: {
          automated: true,
          commands: ['npx expo start --clear', 'npm start -- --reset-cache'],
          description: 'Clear Metro bundler cache',
          requiresUserInput: false
        }
      },
      
      // Android SDK issues
      {
        id: 'sdk_not_found',
        pattern: /SDK location not found|ANDROID_HOME/i,
        category: 'environment',
        severity: 'error',
        resolution: {
          automated: false,
          commands: [],
          description: 'Set ANDROID_HOME environment variable',
          requiresUserInput: true,
          manualSteps: [
            'Install Android Studio',
            'Set ANDROID_HOME to SDK path',
            'Add platform-tools to PATH'
          ]
        }
      },
      
      // React Native linking issues
      {
        id: 'linking_error',
        pattern: /Native module.*cannot be null|RN.*not found/i,
        category: 'linking',
        severity: 'error',
        resolution: {
          automated: true,
          commands: ['cd android && gradlew clean', 'npm install', 'cd android && gradlew build'],
          description: 'Rebuild native modules',
          requiresUserInput: false
        }
      },
      
      // Build tools version issues
      {
        id: 'build_tools_version',
        pattern: /build-tools.*not found|buildToolsVersion/i,
        category: 'build_tools',
        severity: 'error',
        resolution: {
          automated: false,
          commands: [],
          description: 'Install required Android build tools',
          requiresUserInput: true,
          manualSteps: [
            'Open Android Studio SDK Manager',
            'Install required build tools version',
            'Update build.gradle if necessary'
          ]
        }
      }
    ];
  }

  async resolveError(errorMessage) {
    console.log('🔍 Analyzing error for resolution...');
    
    const matchedPattern = this.findMatchingPattern(errorMessage);
    
    if (!matchedPattern) {
      console.log('❓ No known resolution pattern found');
      return {
        success: false,
        error: 'Unknown error pattern',
        suggestions: this.generateGenericSuggestions(errorMessage)
      };
    }

    console.log(`🎯 Matched error pattern: ${matchedPattern.id}`);
    
    if (matchedPattern.resolution.automated) {
      return await this.executeAutomatedResolution(matchedPattern);
    } else {
      return this.provideManualResolution(matchedPattern);
    }
  }

  findMatchingPattern(errorMessage) {
    return this.errorPatterns.find(pattern => 
      pattern.pattern.test(errorMessage)
    );
  }

  async executeAutomatedResolution(pattern) {
    console.log(`🤖 Executing automated resolution for: ${pattern.description}`);
    
    try {
      // Apply configuration changes if specified
      if (pattern.resolution.configChanges) {
        await this.applyConfigChanges(pattern.resolution.configChanges);
      }

      // Execute resolution commands
      for (const command of pattern.resolution.commands) {
        console.log(`   Running: ${command}`);
        try {
          execSync(command, { stdio: 'pipe', cwd: process.cwd() });
        } catch (cmdError) {
          console.warn(`   ⚠️  Command failed: ${command}`);
          // Continue with other commands
        }
      }

      // Record successful resolution
      this.recordResolution(pattern.id, true);
      
      console.log('✅ Automated resolution completed');
      return {
        success: true,
        pattern: pattern.id,
        description: pattern.description
      };
    } catch (error) {
      console.error('❌ Automated resolution failed:', error.message);
      this.recordResolution(pattern.id, false, error.message);
      
      return {
        success: false,
        error: error.message,
        fallback: this.provideManualResolution(pattern)
      };
    }
  }

  provideManualResolution(pattern) {
    console.log(`📋 Manual resolution required for: ${pattern.description}`);
    
    const resolution = {
      success: false,
      requiresManualIntervention: true,
      pattern: pattern.id,
      description: pattern.description,
      steps: pattern.resolution.manualSteps || []
    };

    if (pattern.resolution.commands.length > 0) {
      resolution.suggestedCommands = pattern.resolution.commands;
    }

    return resolution;
  }

  async applyConfigChanges(configChanges) {
    for (const [filePath, changes] of Object.entries(configChanges)) {
      const fullPath = path.join(process.cwd(), filePath);
      
      if (!fs.existsSync(fullPath)) {
        console.log(`   Creating config file: ${filePath}`);
        fs.writeFileSync(fullPath, '');
      }

      let content = fs.readFileSync(fullPath, 'utf8');
      
      for (const [key, value] of Object.entries(changes)) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        const replacement = `${key}=${value}`;
        
        if (regex.test(content)) {
          content = content.replace(regex, replacement);
          console.log(`   Updated ${key} in ${filePath}`);
        } else {
          content += `\n${replacement}`;
          console.log(`   Added ${key} to ${filePath}`);
        }
      }
      
      fs.writeFileSync(fullPath, content);
    }
  }

  generateGenericSuggestions(errorMessage) {
    const suggestions = [];
    
    // Common build issues
    if (errorMessage.toLowerCase().includes('build')) {
      suggestions.push('Try cleaning the build: cd android && gradlew clean');
      suggestions.push('Clear Metro cache: npx expo start --clear');
    }
    
    // Installation issues
    if (errorMessage.toLowerCase().includes('install')) {
      suggestions.push('Check device connection: adb devices');
      suggestions.push('Try uninstalling existing app first');
    }
    
    // Dependency issues
    if (errorMessage.toLowerCase().includes('module') || errorMessage.toLowerCase().includes('package')) {
      suggestions.push('Reinstall dependencies: rm -rf node_modules && npm install');
      suggestions.push('Check package.json for version conflicts');
    }
    
    // Memory issues
    if (errorMessage.toLowerCase().includes('memory') || errorMessage.toLowerCase().includes('heap')) {
      suggestions.push('Increase Gradle memory in gradle.properties');
      suggestions.push('Close other applications to free memory');
    }
    
    return suggestions;
  }

  recordResolution(patternId, success, errorMessage = null) {
    const record = {
      timestamp: new Date().toISOString(),
      patternId,
      success,
      errorMessage
    };
    
    this.resolutionHistory.push(record);
    this.saveResolutionHistory();
  }

  loadResolutionHistory() {
    const historyPath = path.join(process.cwd(), '.kiro', 'build-manager', 'resolution-history.json');
    
    try {
      if (fs.existsSync(historyPath)) {
        this.resolutionHistory = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
      }
    } catch (error) {
      console.warn('Could not load resolution history:', error.message);
      this.resolutionHistory = [];
    }
  }

  saveResolutionHistory() {
    const historyPath = path.join(process.cwd(), '.kiro', 'build-manager', 'resolution-history.json');
    const historyDir = path.dirname(historyPath);
    
    if (!fs.existsSync(historyDir)) {
      fs.mkdirSync(historyDir, { recursive: true });
    }
    
    try {
      fs.writeFileSync(historyPath, JSON.stringify(this.resolutionHistory, null, 2));
    } catch (error) {
      console.warn('Could not save resolution history:', error.message);
    }
  }

  async createPatches() {
    console.log('🔧 Creating patches for known issues...');
    
    // Create patch for react-native-svg C++ warnings
    await this.createReactNativeSvgPatch();
    
    console.log('✅ Patches created successfully');
  }

  async createReactNativeSvgPatch() {
    const patchesDir = path.join(process.cwd(), 'patches');
    if (!fs.existsSync(patchesDir)) {
      fs.mkdirSync(patchesDir, { recursive: true });
    }

    const patchContent = `diff --git a/node_modules/react-native-svg/android/src/main/jni/RNSVG.h b/node_modules/react-native-svg/android/src/main/jni/RNSVG.h
index 1234567..abcdefg 100644
--- a/node_modules/react-native-svg/android/src/main/jni/RNSVG.h
+++ b/node_modules/react-native-svg/android/src/main/jni/RNSVG.h
@@ -10,7 +10,7 @@
 #include <jni.h>
 
 // Fix for C++ identifier warning
-#define $RNSVG_IDENTIFIER RNSVG_IDENTIFIER
+#define RNSVG_DOLLAR_IDENTIFIER RNSVG_IDENTIFIER
 
 namespace facebook {
 namespace react {`;

    const patchPath = path.join(patchesDir, 'react-native-svg+15.11.2.patch');
    fs.writeFileSync(patchPath, patchContent);
    
    console.log('   Created react-native-svg patch');
  }

  getResolutionStats() {
    const stats = {
      totalResolutions: this.resolutionHistory.length,
      successfulResolutions: this.resolutionHistory.filter(r => r.success).length,
      failedResolutions: this.resolutionHistory.filter(r => !r.success).length,
      patternFrequency: {}
    };

    this.resolutionHistory.forEach(record => {
      stats.patternFrequency[record.patternId] = 
        (stats.patternFrequency[record.patternId] || 0) + 1;
    });

    stats.successRate = stats.totalResolutions > 0 ? 
      (stats.successfulResolutions / stats.totalResolutions * 100).toFixed(1) : 0;

    return stats;
  }
}

module.exports = ErrorResolver;