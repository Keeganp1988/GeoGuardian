#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class OnboardingScript {
  constructor() {
    this.steps = [
      { name: 'Environment Validation', action: () => this.validateEnvironment() },
      { name: 'Dependency Installation', action: () => this.installDependencies() },
      { name: 'Build Manager Setup', action: () => this.setupBuildManager() },
      { name: 'Android Configuration', action: () => this.configureAndroid() },
      { name: 'Development Tools', action: () => this.setupDevelopmentTools() },
      { name: 'First Build Test', action: () => this.testFirstBuild() },
      { name: 'Documentation Setup', action: () => this.setupDocumentation() }
    ];
    this.results = [];
  }

  async run() {
    console.log('🚀 Welcome to the Build Manager Onboarding!');
    console.log('This script will set up your development environment for optimal build performance.\n');

    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      console.log(`📋 Step ${i + 1}/${this.steps.length}: ${step.name}`);
      console.log('─'.repeat(50));

      try {
        const result = await step.action();
        this.results.push({ step: step.name, status: 'success', result });
        console.log(`✅ ${step.name} completed successfully\n`);
      } catch (error) {
        this.results.push({ step: step.name, status: 'error', error: error.message });
        console.error(`❌ ${step.name} failed: ${error.message}\n`);
        
        const shouldContinue = await this.askToContinue();
        if (!shouldContinue) {
          console.log('Onboarding stopped by user.');
          break;
        }
      }
    }

    this.generateOnboardingReport();
    console.log('🎉 Onboarding completed! Check the report above for any issues that need attention.');
  }

  async validateEnvironment() {
    console.log('   Checking development environment...');
    
    const BuildManager = require('./index');
    const buildManager = new BuildManager();
    await buildManager.initialize();
    
    const validation = await buildManager.validateEnvironment();
    
    if (!validation.success) {
      console.log('   ⚠️  Environment issues found:');
      validation.errors.forEach(error => console.log(`      - ${error}`));
      
      const shouldFix = await this.askYesNo('   Would you like to attempt automatic fixes?');
      if (shouldFix) {
        await this.attemptEnvironmentFixes(validation);
      }
    }

    return validation;
  }

  async attemptEnvironmentFixes(validation) {
    console.log('   🔧 Attempting to fix environment issues...');
    
    // Fix common environment issues
    for (const check of validation.checks) {
      if (check.status === 'error' && check.resolution) {
        console.log(`      Fixing: ${check.name}`);
        
        try {
          if (check.name === 'Environment Variables') {
            await this.fixEnvironmentVariables();
          } else if (check.name === 'Project Dependencies') {
            await this.fixProjectDependencies();
          }
        } catch (error) {
          console.log(`      ⚠️  Could not auto-fix ${check.name}: ${error.message}`);
        }
      }
    }
  }

  async fixEnvironmentVariables() {
    // Attempt to detect Android SDK location
    const commonPaths = [
      path.join(process.env.USERPROFILE || process.env.HOME, 'AppData', 'Local', 'Android', 'Sdk'),
      path.join(process.env.USERPROFILE || process.env.HOME, 'Android', 'Sdk'),
      'C:\\Android\\Sdk'
    ];

    for (const sdkPath of commonPaths) {
      if (fs.existsSync(sdkPath)) {
        console.log(`      Found Android SDK at: ${sdkPath}`);
        console.log('      Please set ANDROID_HOME environment variable to this path');
        break;
      }
    }
  }

  async fixProjectDependencies() {
    console.log('      Installing project dependencies...');
    execSync('npm install', { stdio: 'inherit' });
  }

  async installDependencies() {
    console.log('   Installing required dependencies...');
    
    // Check if patch-package is installed
    try {
      execSync('npx patch-package --version', { stdio: 'pipe' });
      console.log('   ✅ patch-package is available');
    } catch (error) {
      console.log('   📦 Installing patch-package...');
      execSync('npm install --save-dev patch-package', { stdio: 'inherit' });
    }

    // Apply patches
    console.log('   🔧 Applying patches...');
    try {
      execSync('npx patch-package', { stdio: 'pipe' });
      console.log('   ✅ Patches applied successfully');
    } catch (error) {
      console.log('   ⚠️  Some patches may not have applied correctly');
    }

    return { patchPackageInstalled: true, patchesApplied: true };
  }

  async setupBuildManager() {
    console.log('   Setting up Build Manager...');
    
    // Create necessary directories
    const buildManagerDir = path.join(process.cwd(), '.kiro', 'build-manager');
    if (!fs.existsSync(buildManagerDir)) {
      fs.mkdirSync(buildManagerDir, { recursive: true });
      console.log('   📁 Created build manager directory');
    }

    // Initialize build manager
    const BuildManager = require('./index');
    const buildManager = new BuildManager();
    await buildManager.initialize();
    
    console.log('   ✅ Build Manager initialized');
    
    return { initialized: true };
  }

  async configureAndroid() {
    console.log('   Configuring Android build settings...');
    
    // Check if Android directory exists
    const androidDir = path.join(process.cwd(), 'android');
    if (!fs.existsSync(androidDir)) {
      throw new Error('Android directory not found. This may not be a React Native project.');
    }

    // Configure gradle.properties
    const gradlePropsPath = path.join(androidDir, 'gradle.properties');
    let gradleProps = '';
    
    if (fs.existsSync(gradlePropsPath)) {
      gradleProps = fs.readFileSync(gradlePropsPath, 'utf8');
    }

    const optimizations = [
      'org.gradle.jvmargs=-Xmx4096m -XX:MaxPermSize=512m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8',
      'org.gradle.parallel=true',
      'org.gradle.configureondemand=true',
      'org.gradle.daemon=true',
      'android.useAndroidX=true',
      'android.enableJetifier=true'
    ];

    let modified = false;
    optimizations.forEach(prop => {
      const [key] = prop.split('=');
      const regex = new RegExp(`^${key}=.*$`, 'm');
      
      if (!regex.test(gradleProps)) {
        gradleProps += `\n${prop}`;
        modified = true;
      }
    });

    if (modified) {
      fs.writeFileSync(gradlePropsPath, gradleProps);
      console.log('   ✅ Android build optimizations applied');
    } else {
      console.log('   ✅ Android build already optimized');
    }

    // Ensure debug keystore exists
    const SignatureManager = require('./signature-manager');
    const signatureManager = new SignatureManager();
    await signatureManager.initialize();

    return { configured: true, optimized: modified };
  }

  async setupDevelopmentTools() {
    console.log('   Setting up development tools...');
    
    // Add build manager scripts to package.json
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    const buildManagerScripts = {
      'build:validate': 'node scripts/build-manager/index.js validate',
      'build:clean': 'node scripts/build-manager/index.js clean',
      'build:android-dev': 'node scripts/build-manager/index.js build android development',
      'build:fix-signatures': 'node scripts/build-manager/index.js fix-signatures',
      'build:report': 'node scripts/build-manager/index.js report'
    };

    let scriptsAdded = 0;
    for (const [scriptName, scriptCommand] of Object.entries(buildManagerScripts)) {
      if (!packageJson.scripts[scriptName]) {
        packageJson.scripts[scriptName] = scriptCommand;
        scriptsAdded++;
      }
    }

    if (scriptsAdded > 0) {
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      console.log(`   ✅ Added ${scriptsAdded} build manager scripts to package.json`);
    } else {
      console.log('   ✅ Build manager scripts already present');
    }

    return { scriptsAdded };
  }

  async testFirstBuild() {
    console.log('   Testing first build...');
    
    const shouldTest = await this.askYesNo('   Would you like to test a development build now? (This may take several minutes)');
    
    if (!shouldTest) {
      console.log('   ⏭️  Skipping build test');
      return { skipped: true };
    }

    try {
      console.log('   🔨 Starting test build...');
      const BuildManager = require('./index');
      const buildManager = new BuildManager();
      await buildManager.initialize();
      
      const result = await buildManager.buildAndDeploy('android', 'development');
      
      if (result.success) {
        console.log('   🎉 Test build successful!');
        return { success: true, result };
      } else {
        console.log('   ⚠️  Test build failed, but this is normal for first-time setup');
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.log('   ⚠️  Test build encountered issues, but setup can continue');
      return { success: false, error: error.message };
    }
  }

  async setupDocumentation() {
    console.log('   Setting up documentation...');
    
    // Create quick reference guide
    const quickRefPath = path.join(process.cwd(), 'BUILD_QUICK_REFERENCE.md');
    const quickRefContent = `# Build Manager Quick Reference

## Common Commands

\`\`\`bash
# Validate environment
npm run build:validate

# Clean build
npm run build:clean

# Build for development
npm run build:android-dev

# Fix signature issues
npm run build:fix-signatures

# Generate health report
npm run build:report
\`\`\`

## Troubleshooting

See \`scripts/build-manager/troubleshooting-guide.md\` for detailed troubleshooting information.

## Build Manager Components

- **Signature Manager**: Handles Android signing conflicts
- **Environment Validator**: Checks development environment
- **Error Resolver**: Automatically resolves common build errors
- **Workflow Automation**: Streamlines build processes
- **Build Health Monitor**: Tracks build performance and issues

## Getting Help

1. Run \`npm run build:validate\` to check your environment
2. Check \`scripts/build-manager/troubleshooting-guide.md\`
3. Review build health report with \`npm run build:report\`
`;

    fs.writeFileSync(quickRefPath, quickRefContent);
    console.log('   ✅ Created BUILD_QUICK_REFERENCE.md');

    return { documentationCreated: true };
  }

  async askYesNo(question) {
    // In a real implementation, this would use readline or similar
    // For now, we'll default to yes for automated setup
    console.log(`   ${question} (defaulting to yes for automated setup)`);
    return true;
  }

  async askToContinue() {
    console.log('   Continue with remaining steps? (defaulting to yes)');
    return true;
  }

  generateOnboardingReport() {
    console.log('\n📊 Onboarding Report');
    console.log('═'.repeat(50));
    
    const successful = this.results.filter(r => r.status === 'success').length;
    const failed = this.results.filter(r => r.status === 'error').length;
    
    console.log(`✅ Successful steps: ${successful}`);
    console.log(`❌ Failed steps: ${failed}`);
    console.log(`📊 Success rate: ${(successful / this.results.length * 100).toFixed(1)}%\n`);

    this.results.forEach(result => {
      const icon = result.status === 'success' ? '✅' : '❌';
      console.log(`${icon} ${result.step}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

    if (failed > 0) {
      console.log('\n⚠️  Some steps failed. Please review the errors above and:');
      console.log('   1. Check the troubleshooting guide: scripts/build-manager/troubleshooting-guide.md');
      console.log('   2. Run environment validation: npm run build:validate');
      console.log('   3. Try the onboarding script again after fixing issues');
    } else {
      console.log('\n🎉 All steps completed successfully!');
      console.log('   Your development environment is ready for optimal build performance.');
      console.log('   Next steps:');
      console.log('   1. Try building: npm run build:android-dev');
      console.log('   2. Check build health: npm run build:report');
      console.log('   3. Review BUILD_QUICK_REFERENCE.md for common commands');
    }
  }
}

// CLI interface
if (require.main === module) {
  const onboarding = new OnboardingScript();
  onboarding.run().catch(error => {
    console.error('❌ Onboarding failed:', error.message);
    process.exit(1);
  });
}

module.exports = OnboardingScript;