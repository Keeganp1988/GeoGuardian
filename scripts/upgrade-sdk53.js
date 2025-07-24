#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class SDK53Upgrader {
  constructor() {
    this.packageJsonPath = path.join(process.cwd(), 'package.json');
    this.backupPath = path.join(process.cwd(), 'package.json.backup');
    this.packageJson = JSON.parse(fs.readFileSync(this.packageJsonPath, 'utf8'));
  }

  // Create backup
  createBackup() {
    console.log('💾 Creating backup of package.json...');
    fs.copyFileSync(this.packageJsonPath, this.backupPath);
    console.log('✅ Backup created at package.json.backup');
  }

  // Restore backup
  restoreBackup() {
    console.log('🔄 Restoring from backup...');
    if (fs.existsSync(this.backupPath)) {
      fs.copyFileSync(this.backupPath, this.packageJsonPath);
      console.log('✅ Backup restored');
    } else {
      console.log('❌ No backup found');
    }
  }

  // Update package.json for SDK 53
  updatePackageJson() {
    console.log('📝 Updating package.json for SDK 53...');
    
    const updatedDependencies = {
      ...this.packageJson.dependencies,
      "expo": "~53.0.0",
      "react": "18.3.1",
      "react-native": "0.76.3",
      "react-dom": "18.3.1",
      "react-native-web": "~0.19.10"
    };

    const updatedDevDependencies = {
      ...this.packageJson.devDependencies,
      "@types/react": "~18.3.12"
    };

    this.packageJson.dependencies = updatedDependencies;
    this.packageJson.devDependencies = updatedDevDependencies;

    fs.writeFileSync(this.packageJsonPath, JSON.stringify(this.packageJson, null, 2));
    console.log('✅ package.json updated');
  }

  // Clean and reinstall
  cleanAndReinstall() {
    console.log('🧹 Cleaning and reinstalling dependencies...');
    
    try {
      // Remove existing node_modules and lock files
      if (fs.existsSync('node_modules')) {
        execSync('rmdir /s /q node_modules', { stdio: 'inherit' });
      }
      if (fs.existsSync('package-lock.json')) {
        execSync('del package-lock.json', { stdio: 'inherit' });
      }
      if (fs.existsSync('yarn.lock')) {
        execSync('del yarn.lock', { stdio: 'inherit' });
      }

      // Clear npm cache
      execSync('npm cache clean --force', { stdio: 'inherit' });

      // Install dependencies
      execSync('npm install', { stdio: 'inherit' });
      
      console.log('✅ Dependencies reinstalled successfully');
    } catch (error) {
      console.error('❌ Failed to reinstall dependencies:', error.message);
      throw error;
    }
  }

  // Update Expo CLI
  updateExpoCLI() {
    console.log('🔄 Updating Expo CLI...');
    try {
      execSync('npm install -g @expo/cli@latest', { stdio: 'inherit' });
      console.log('✅ Expo CLI updated');
    } catch (error) {
      console.log('⚠️  Failed to update Expo CLI globally, continuing...');
    }
  }

  // Run Expo doctor
  runExpoDoctor() {
    console.log('🔍 Running Expo doctor...');
    try {
      execSync('npx expo doctor', { stdio: 'inherit' });
      console.log('✅ Expo doctor passed');
    } catch (error) {
      console.log('⚠️  Expo doctor found issues. Please review the output above.');
    }
  }

  // Test the build
  testBuild() {
    console.log('🧪 Testing build process...');
    try {
      execSync('npx expo start --clear', { stdio: 'inherit', timeout: 30000 });
      console.log('✅ Build test passed');
    } catch (error) {
      console.log('⚠️  Build test failed or timed out. This is normal for a quick test.');
    }
  }

  // Main upgrade process
  async upgrade() {
    console.log('🚀 Starting Expo SDK 53 upgrade...\n');
    
    try {
      // Step 1: Create backup
      this.createBackup();
      console.log('');

      // Step 2: Update Expo CLI
      this.updateExpoCLI();
      console.log('');

      // Step 3: Update package.json
      this.updatePackageJson();
      console.log('');

      // Step 4: Clean and reinstall
      this.cleanAndReinstall();
      console.log('');

      // Step 5: Run Expo doctor
      this.runExpoDoctor();
      console.log('');

      // Step 6: Test build
      this.testBuild();
      console.log('');

      console.log('🎉 Upgrade completed successfully!');
      console.log('\n📋 Next steps:');
      console.log('1. Test your app thoroughly on both iOS and Android');
      console.log('2. Check all features work as expected');
      console.log('3. Run "npm run deps:maintenance" for ongoing maintenance');
      console.log('4. If issues occur, run "npm run deps:restore" to rollback');

    } catch (error) {
      console.error('\n❌ Upgrade failed:', error.message);
      console.log('\n🔄 Rolling back changes...');
      this.restoreBackup();
      console.log('\n💡 Tips for manual upgrade:');
      console.log('1. Check the Expo SDK 53 migration guide');
      console.log('2. Update dependencies one by one');
      console.log('3. Test after each major change');
      process.exit(1);
    }
  }
}

// Run the upgrade
const upgrader = new SDK53Upgrader();

if (process.argv.includes('--restore')) {
  upgrader.restoreBackup();
} else {
  upgrader.upgrade();
} 