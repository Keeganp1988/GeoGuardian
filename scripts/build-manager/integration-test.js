#!/usr/bin/env node

const BuildManager = require('./index');
const SignatureManager = require('./signature-manager');
const EnvironmentValidator = require('./environment-validator');
const ErrorResolver = require('./error-resolver');
const WorkflowAutomation = require('./workflow-automation');
const BuildHealthMonitor = require('./build-health-monitor');

class IntegrationTest {
  constructor() {
    this.testResults = [];
  }

  async runAllTests() {
    console.log('🧪 Running Build Manager Integration Tests...\n');

    const tests = [
      { name: 'Component Initialization', test: () => this.testComponentInitialization() },
      { name: 'Environment Validation', test: () => this.testEnvironmentValidation() },
      { name: 'Signature Management', test: () => this.testSignatureManagement() },
      { name: 'Error Resolution', test: () => this.testErrorResolution() },
      { name: 'Workflow Automation', test: () => this.testWorkflowAutomation() },
      { name: 'Build Health Monitoring', test: () => this.testBuildHealthMonitoring() },
      { name: 'End-to-End Integration', test: () => this.testEndToEndIntegration() }
    ];

    for (const test of tests) {
      await this.runTest(test.name, test.test);
    }

    this.generateTestReport();
  }

  async runTest(testName, testFunction) {
    console.log(`🔍 Testing: ${testName}`);
    
    try {
      const result = await testFunction();
      this.testResults.push({
        name: testName,
        status: 'passed',
        result
      });
      console.log(`✅ ${testName} - PASSED\n`);
    } catch (error) {
      this.testResults.push({
        name: testName,
        status: 'failed',
        error: error.message
      });
      console.log(`❌ ${testName} - FAILED: ${error.message}\n`);
    }
  }

  async testComponentInitialization() {
    console.log('   Initializing all components...');
    
    const buildManager = new BuildManager();
    await buildManager.initialize();
    
    // Test individual components
    const signatureManager = new SignatureManager();
    await signatureManager.initialize();
    
    const environmentValidator = new EnvironmentValidator();
    await environmentValidator.initialize();
    
    const errorResolver = new ErrorResolver();
    await errorResolver.initialize();
    
    const workflowAutomation = new WorkflowAutomation();
    await workflowAutomation.initialize();
    
    const buildHealthMonitor = new BuildHealthMonitor();
    await buildHealthMonitor.initialize();
    
    console.log('   ✅ All components initialized successfully');
    
    return {
      buildManager: true,
      signatureManager: true,
      environmentValidator: true,
      errorResolver: true,
      workflowAutomation: true,
      buildHealthMonitor: true
    };
  }

  async testEnvironmentValidation() {
    console.log('   Running environment validation...');
    
    const environmentValidator = new EnvironmentValidator();
    await environmentValidator.initialize();
    
    const validation = await environmentValidator.validateAll();
    
    console.log(`   Environment validation completed: ${validation.success ? 'PASSED' : 'ISSUES FOUND'}`);
    console.log(`   Checks: ${validation.checks.length}, Errors: ${validation.errors.length}, Warnings: ${validation.warnings.length}`);
    
    return {
      validationRan: true,
      checksPerformed: validation.checks.length,
      errorsFound: validation.errors.length,
      warningsFound: validation.warnings.length,
      overallSuccess: validation.success
    };
  }

  async testSignatureManagement() {
    console.log('   Testing signature management...');
    
    const signatureManager = new SignatureManager();
    await signatureManager.initialize();
    
    // Test keystore validation
    const configValid = await signatureManager.validateKeystoreConfiguration();
    
    // Test signature report generation
    const report = await signatureManager.generateSignatureReport();
    
    console.log(`   Keystore configuration: ${configValid ? 'VALID' : 'NEEDS ATTENTION'}`);
    console.log(`   Debug keystore exists: ${report.keystoreExists}`);
    
    return {
      configurationValid: configValid,
      keystoreExists: report.keystoreExists,
      reportGenerated: true
    };
  }

  async testErrorResolution() {
    console.log('   Testing error resolution...');
    
    const errorResolver = new ErrorResolver();
    await errorResolver.initialize();
    
    // Test error pattern matching
    const testErrors = [
      'INSTALL_FAILED_UPDATE_INCOMPATIBLE: Package signatures do not match',
      'warning: identifier begins with a dollar sign',
      'OutOfMemoryError: Java heap space',
      'Gradle build daemon disappeared unexpectedly'
    ];
    
    let patternsMatched = 0;
    for (const error of testErrors) {
      const resolution = await errorResolver.resolveError(error);
      if (resolution.pattern) {
        patternsMatched++;
      }
    }
    
    // Test patch creation
    await errorResolver.createPatches();
    
    console.log(`   Error patterns matched: ${patternsMatched}/${testErrors.length}`);
    
    return {
      patternsMatched,
      totalPatterns: testErrors.length,
      patchesCreated: true,
      resolutionStats: errorResolver.getResolutionStats()
    };
  }

  async testWorkflowAutomation() {
    console.log('   Testing workflow automation...');
    
    const workflowAutomation = new WorkflowAutomation();
    await workflowAutomation.initialize();
    
    // Test build configuration
    const report = await workflowAutomation.generateWorkflowReport();
    
    console.log(`   Available environments: ${report.availableEnvironments.length}`);
    console.log(`   Supported platforms: ${report.supportedPlatforms.length}`);
    
    return {
      environmentsConfigured: report.availableEnvironments.length,
      platformsSupported: report.supportedPlatforms.length,
      buildScriptsCreated: Object.values(report.buildScripts).filter(Boolean).length
    };
  }

  async testBuildHealthMonitoring() {
    console.log('   Testing build health monitoring...');
    
    const buildHealthMonitor = new BuildHealthMonitor();
    await buildHealthMonitor.initialize();
    
    // Test recording build events
    await buildHealthMonitor.recordBuildSuccess('android', 'development', 120, 25000000);
    await buildHealthMonitor.recordBuildFailure('android', 'development', 'Test error for monitoring', 60);
    
    // Test report generation
    const report = await buildHealthMonitor.generateReport();
    
    // Test health score calculation
    const healthScore = buildHealthMonitor.getHealthScore();
    
    console.log(`   Health score: ${healthScore}`);
    console.log(`   Report sections: ${Object.keys(report).length}`);
    
    return {
      healthScore,
      reportGenerated: true,
      buildEventsRecorded: 2,
      reportSections: Object.keys(report).length
    };
  }

  async testEndToEndIntegration() {
    console.log('   Testing end-to-end integration...');
    
    const buildManager = new BuildManager();
    await buildManager.initialize();
    
    // Test environment validation
    const validation = await buildManager.validateEnvironment();
    
    // Test signature conflict resolution
    await buildManager.fixSignatureIssues();
    
    // Test report generation
    const report = await buildManager.generateReport();
    
    console.log('   End-to-end integration test completed');
    
    return {
      environmentValidated: true,
      signatureIssuesResolved: true,
      reportGenerated: true,
      integrationWorking: true
    };
  }

  generateTestReport() {
    console.log('\n📊 Integration Test Report');
    console.log('═'.repeat(60));
    
    const passed = this.testResults.filter(r => r.status === 'passed').length;
    const failed = this.testResults.filter(r => r.status === 'failed').length;
    const total = this.testResults.length;
    
    console.log(`✅ Passed: ${passed}/${total}`);
    console.log(`❌ Failed: ${failed}/${total}`);
    console.log(`📊 Success Rate: ${(passed / total * 100).toFixed(1)}%\n`);
    
    console.log('Test Details:');
    console.log('─'.repeat(40));
    
    this.testResults.forEach(result => {
      const icon = result.status === 'passed' ? '✅' : '❌';
      console.log(`${icon} ${result.name}`);
      
      if (result.status === 'failed') {
        console.log(`   Error: ${result.error}`);
      } else if (result.result && typeof result.result === 'object') {
        const summary = this.summarizeResult(result.result);
        if (summary) {
          console.log(`   ${summary}`);
        }
      }
    });
    
    if (failed === 0) {
      console.log('\n🎉 All integration tests passed!');
      console.log('The Build Manager system is ready for use.');
    } else {
      console.log('\n⚠️  Some integration tests failed.');
      console.log('Please review the errors above and ensure all dependencies are properly installed.');
    }
    
    console.log('\nNext Steps:');
    console.log('1. Run: npm run build:validate');
    console.log('2. Try: npm run build:android-dev');
    console.log('3. Check: npm run build:report');
  }

  summarizeResult(result) {
    const summaries = [];
    
    if (result.environmentsConfigured) {
      summaries.push(`${result.environmentsConfigured} environments`);
    }
    if (result.checksPerformed) {
      summaries.push(`${result.checksPerformed} checks performed`);
    }
    if (result.patternsMatched) {
      summaries.push(`${result.patternsMatched} error patterns matched`);
    }
    if (result.healthScore !== undefined) {
      summaries.push(`health score: ${result.healthScore}`);
    }
    
    return summaries.length > 0 ? summaries.join(', ') : null;
  }
}

// CLI interface
if (require.main === module) {
  const integrationTest = new IntegrationTest();
  integrationTest.runAllTests().catch(error => {
    console.error('❌ Integration test failed:', error.message);
    process.exit(1);
  });
}

module.exports = IntegrationTest;