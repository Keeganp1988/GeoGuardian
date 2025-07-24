const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

class SignatureManager {
  constructor() {
    this.androidPath = path.join(process.cwd(), 'android');
    this.keystorePath = path.join(this.androidPath, 'app', 'debug.keystore');
    this.packageName = 'com.company.CircleLink';
  }

  async initialize() {
    console.log('🔑 Initializing Signature Manager...');
    await this.ensureDebugKeystore();
  }

  async ensureDebugKeystore() {
    if (!fs.existsSync(this.keystorePath)) {
      console.log('📱 Creating debug keystore...');
      await this.createDebugKeystore();
    } else {
      console.log('✅ Debug keystore exists');
    }
  }

  async createDebugKeystore() {
    const keystoreDir = path.dirname(this.keystorePath);
    if (!fs.existsSync(keystoreDir)) {
      fs.mkdirSync(keystoreDir, { recursive: true });
    }

    const keytoolCmd = `keytool -genkey -v -keystore "${this.keystorePath}" -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -storepass android -keypass android -dname "CN=Android Debug,O=Android,C=US"`;
    
    try {
      execSync(keytoolCmd, { stdio: 'pipe' });
      console.log('✅ Debug keystore created successfully');
    } catch (error) {
      console.error('❌ Failed to create debug keystore:', error.message);
      throw error;
    }
  }

  async detectSignatureMismatch(installOutput) {
    const signatureMismatchPatterns = [
      /INSTALL_FAILED_UPDATE_INCOMPATIBLE/,
      /signatures do not match/i,
      /Package .* signatures do not match/,
      /INSTALL_PARSE_FAILED_INCONSISTENT_CERTIFICATES/
    ];

    return signatureMismatchPatterns.some(pattern => pattern.test(installOutput));
  }

  async resolveConflicts() {
    console.log('🔍 Checking for signature conflicts...');
    
    try {
      // Check if app is installed
      const isInstalled = await this.isAppInstalled();
      
      if (isInstalled) {
        console.log('📱 App is installed, checking signature compatibility...');
        
        // Try to get installed app signature
        const installedSignature = await this.getInstalledAppSignature();
        const debugSignature = await this.getDebugKeystoreSignature();
        
        if (installedSignature && debugSignature && installedSignature !== debugSignature) {
          console.log('⚠️  Signature mismatch detected, uninstalling existing app...');
          await this.uninstallApp();
          console.log('✅ App uninstalled successfully');
        } else {
          console.log('✅ No signature conflicts detected');
        }
      } else {
        console.log('✅ App not installed, no conflicts to resolve');
      }
    } catch (error) {
      console.warn('⚠️  Could not fully resolve signature conflicts:', error.message);
      // Continue anyway, as this might not be critical
    }
  }

  async isAppInstalled() {
    try {
      const output = execSync(`adb shell pm list packages | findstr ${this.packageName}`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      return output.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  async getInstalledAppSignature() {
    try {
      const output = execSync(`adb shell dumpsys package ${this.packageName} | findstr "signatures"`, {
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      // Extract signature hash from output
      const match = output.match(/\[([a-f0-9]+)\]/);
      return match ? match[1] : null;
    } catch (error) {
      return null;
    }
  }

  async getDebugKeystoreSignature() {
    try {
      const output = execSync(`keytool -list -v -keystore "${this.keystorePath}" -alias androiddebugkey -storepass android -keypass android`, {
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      // Extract SHA1 fingerprint
      const match = output.match(/SHA1:\s*([A-F0-9:]+)/);
      return match ? match[1].replace(/:/g, '').toLowerCase() : null;
    } catch (error) {
      return null;
    }
  }

  async uninstallApp() {
    try {
      execSync(`adb uninstall ${this.packageName}`, { stdio: 'pipe' });
      return true;
    } catch (error) {
      console.warn('⚠️  Could not uninstall app via adb:', error.message);
      return false;
    }
  }

  async installWithSignatureHandling(apkPath) {
    console.log('📱 Installing APK with signature handling...');
    
    try {
      // First attempt normal install
      execSync(`adb install "${apkPath}"`, { stdio: 'pipe' });
      console.log('✅ APK installed successfully');
      return { success: true };
    } catch (error) {
      const errorOutput = error.message || error.toString();
      
      if (await this.detectSignatureMismatch(errorOutput)) {
        console.log('🔄 Signature mismatch detected, attempting resolution...');
        
        // Uninstall existing app
        await this.uninstallApp();
        
        // Retry installation
        try {
          execSync(`adb install "${apkPath}"`, { stdio: 'pipe' });
          console.log('✅ APK installed successfully after signature resolution');
          return { success: true };
        } catch (retryError) {
          return { 
            success: false, 
            error: `Installation failed after signature resolution: ${retryError.message}` 
          };
        }
      } else {
        return { 
          success: false, 
          error: `Installation failed: ${errorOutput}` 
        };
      }
    }
  }

  async validateKeystoreConfiguration() {
    const buildGradlePath = path.join(this.androidPath, 'app', 'build.gradle');
    
    if (!fs.existsSync(buildGradlePath)) {
      throw new Error('build.gradle not found');
    }

    const buildGradleContent = fs.readFileSync(buildGradlePath, 'utf8');
    
    // Check if debug signing config is properly set
    const hasDebugSigningConfig = buildGradleContent.includes('signingConfigs') && 
                                  buildGradleContent.includes('debug') &&
                                  buildGradleContent.includes('debug.keystore');

    if (!hasDebugSigningConfig) {
      console.log('⚠️  Debug signing configuration not found in build.gradle');
      return false;
    }

    console.log('✅ Keystore configuration is valid');
    return true;
  }

  async generateSignatureReport() {
    const report = {
      keystoreExists: fs.existsSync(this.keystorePath),
      appInstalled: await this.isAppInstalled(),
      debugSignature: await this.getDebugKeystoreSignature(),
      installedSignature: await this.getInstalledAppSignature(),
      configurationValid: await this.validateKeystoreConfiguration()
    };

    report.signatureMatch = report.debugSignature === report.installedSignature;
    
    return report;
  }
}

module.exports = SignatureManager;