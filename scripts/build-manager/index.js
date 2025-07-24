#!/usr/bin/env node

const SignatureManager = require('./signature-manager');
const EnvironmentValidator = require('./environment-validator');
const ErrorResolver = require('./error-resolver');
const WorkflowAutomation = require('./workflow-automation');
const BuildHealthMonitor = require('./build-health-monitor');

class BuildManager {
  constructor() {
    this.signatureManager = new SignatureManager();
    this.environmentValidator = new EnvironmentValidator();
    this.errorResolver = new ErrorResolver();
    this.workflowAutomation = new WorkflowAutomation();
    this.buildHealthMonitor = new BuildHealthMonitor();
  }

  async initialize() {
    console.log('🔧 Initializing Build Manager...');
    
    // Initialize all components
    await this.signatureManager.initialize();
    await this.environmentValidator.initialize();
    await this.errorResolver.initialize();
    await this.workflowAutomation.initialize();
    await this.buildHealthMonitor.initialize();
    
    console.log('✅ Build Manager initialized successfully');
  }

  async validateEnvironment() {
    console.log('🔍 Validating build environment...');
    return await this.environmentValidator.validateAll();
  }

  async fixSignatureIssues() {
    console.log('🔑 Resolving signature conflicts...');
    return await this.signatureManager.resolveConflicts();
  }

  async cleanBuild() {
    console.log('🧹 Performing clean build...');
    return await this.workflowAutomation.cleanBuild();
  }

  async buildAndDeploy(platform = 'android', environment = 'development') {
    console.log(`🚀 Building and deploying for ${platform} (${environment})...`);
    
    try {
      // Pre-build validation
      const envValid = await this.validateEnvironment();
      if (!envValid.success) {
        throw new Error(`Environment validation failed: ${envValid.errors.join(', ')}`);
      }

      // Resolve any signature issues
      await this.fixSignatureIssues();

      // Perform build
      const buildResult = await this.workflowAutomation.build(platform, environment);
      
      if (!buildResult.success) {
        // Attempt error resolution
        const resolved = await this.errorResolver.resolveError(buildResult.error);
        if (resolved.success) {
          // Retry build after resolution
          return await this.workflowAutomation.build(platform, environment);
        }
        throw new Error(`Build failed: ${buildResult.error}`);
      }

      // Monitor build health
      await this.buildHealthMonitor.recordBuildSuccess(platform, environment);
      
      return buildResult;
    } catch (error) {
      await this.buildHealthMonitor.recordBuildFailure(platform, environment, error.message);
      throw error;
    }
  }

  async generateReport() {
    console.log('📊 Generating build health report...');
    return await this.buildHealthMonitor.generateReport();
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const buildManager = new BuildManager();
  
  try {
    await buildManager.initialize();
    
    switch (args[0]) {
      case 'validate':
        const validation = await buildManager.validateEnvironment();
        console.log(validation.success ? '✅ Environment valid' : '❌ Environment issues found');
        if (!validation.success) {
          validation.errors.forEach(error => console.log(`  - ${error}`));
        }
        break;
        
      case 'fix-signatures':
        await buildManager.fixSignatureIssues();
        break;
        
      case 'clean':
        await buildManager.cleanBuild();
        break;
        
      case 'build':
        const platform = args[1] || 'android';
        const environment = args[2] || 'development';
        await buildManager.buildAndDeploy(platform, environment);
        break;
        
      case 'report':
        const report = await buildManager.generateReport();
        console.log(JSON.stringify(report, null, 2));
        break;
        
      default:
        console.log(`
🔧 Build Manager

Usage:
  node scripts/build-manager/index.js <command>

Commands:
  validate              - Validate build environment
  fix-signatures        - Resolve signature conflicts
  clean                 - Perform clean build
  build [platform] [env] - Build and deploy (default: android development)
  report                - Generate build health report

Examples:
  node scripts/build-manager/index.js validate
  node scripts/build-manager/index.js build android development
  node scripts/build-manager/index.js report
        `);
    }
  } catch (error) {
    console.error('❌ Build Manager Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = BuildManager;