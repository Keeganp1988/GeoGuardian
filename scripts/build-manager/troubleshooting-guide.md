# Build and Deployment Troubleshooting Guide

## Quick Start

If you're experiencing build issues, run the automated diagnostics first:

```bash
node scripts/build-manager/index.js validate
```

## Common Issues and Solutions

### 1. Signature Mismatch Errors

**Error:** `INSTALL_FAILED_UPDATE_INCOMPATIBLE`

**Cause:** The app on your device was signed with a different certificate than the one you're trying to install.

**Automated Solution:**
```bash
node scripts/build-manager/index.js fix-signatures
```

**Manual Solution:**
1. Uninstall the existing app: `adb uninstall com.company.CircleLink`
2. Reinstall: `adb install path/to/your/app.apk`

### 2. C++ Compilation Warnings

**Error:** `warning: identifier 'X' begins with a dollar sign`

**Cause:** React Native SVG module generates C++ code with dollar sign identifiers.

**Automated Solution:**
```bash
npx patch-package
```

**Manual Solution:**
1. The patch is automatically applied during `npm install`
2. If issues persist, check `patches/react-native-svg+15.11.2.patch`

### 3. Gradle Build Failures

**Error:** `Gradle build daemon disappeared unexpectedly`

**Automated Solution:**
```bash
node scripts/build-manager/index.js clean
```

**Manual Solution:**
```bash
cd android
gradlew --stop
gradlew clean
gradlew build
```

### 4. Memory Issues

**Error:** `OutOfMemoryError` or `Java heap space`

**Solution:** The build manager automatically configures Gradle with increased memory:
- Check `android/gradle.properties` for memory settings
- Ensure you have at least 8GB RAM available
- Close other applications during build

### 5. Environment Setup Issues

**Error:** `SDK location not found` or `ANDROID_HOME not set`

**Solution:**
1. Install Android Studio
2. Set environment variables:
   ```bash
   set ANDROID_HOME=C:\Users\YourName\AppData\Local\Android\Sdk
   set PATH=%PATH%;%ANDROID_HOME%\platform-tools
   ```
3. Restart your terminal/IDE

### 6. Dependency Conflicts

**Error:** `Duplicate class` or `Multiple dex files define`

**Automated Solution:**
```bash
node scripts/build-manager/index.js clean
```

**Manual Solution:**
```bash
rm -rf node_modules
npm install
cd android && gradlew clean
```

### 7. Metro Bundler Issues

**Error:** `Unable to resolve module` or Metro cache issues

**Solution:**
```bash
npx expo start --clear
# or
npm start -- --reset-cache
```

## Build Environment Validation

Run comprehensive environment validation:

```bash
node scripts/build-manager/index.js validate
```

This checks:
- Node.js version
- NPM version
- Java version
- Android SDK
- Gradle
- Environment variables
- Project dependencies

## Performance Optimization

### Build Time Optimization

1. **Gradle Configuration** (automatically applied):
   - Parallel builds enabled
   - Increased memory allocation
   - Build cache enabled

2. **Development Workflow**:
   - Use `expo run:android` for development
   - Use `eas build` for production builds

### Memory Optimization

The build manager automatically configures:
- JVM heap size: 4GB
- Gradle daemon memory optimization
- Build cache management

## Automated Workflows

### Clean Build
```bash
node scripts/build-manager/index.js clean
```

### Build and Deploy
```bash
node scripts/build-manager/index.js build android development
```

### Environment Switch
```bash
node scripts/build-manager/index.js switch-env staging
```

## Monitoring and Health Checks

### Build Health Report
```bash
node scripts/build-manager/index.js report
```

### Real-time Monitoring
The build manager automatically tracks:
- Build success rates
- Build times
- Error patterns
- Performance trends

## Emergency Recovery

If all else fails, use the nuclear option:

```bash
# Stop all processes
taskkill /f /im node.exe
taskkill /f /im java.exe

# Complete cleanup
node scripts/build-manager/workflows/cleanup.bat

# Fresh start
npm install
node scripts/build-manager/index.js validate
node scripts/build-manager/index.js build android development
```

## Getting Help

1. **Check Build Health Report**: `node scripts/build-manager/index.js report`
2. **Review Error Logs**: Check `.kiro/build-manager/` directory
3. **Environment Validation**: Ensure all tools are properly installed
4. **Community Resources**: React Native and Expo documentation

## Advanced Configuration

### Custom Build Configurations

Edit `scripts/build-manager/workflow-automation.js` to customize:
- Build environments
- Signing configurations
- Build optimization settings

### Error Pattern Recognition

Add custom error patterns in `scripts/build-manager/error-resolver.js`:
```javascript
{
  id: 'custom_error',
  pattern: /your error pattern/i,
  category: 'custom',
  severity: 'error',
  resolution: {
    automated: true,
    commands: ['your', 'resolution', 'commands'],
    description: 'Description of the fix'
  }
}
```

## Maintenance

### Regular Maintenance Tasks

1. **Weekly**: Run `node scripts/build-manager/index.js report`
2. **Monthly**: Clean build caches and update dependencies
3. **As Needed**: Review and resolve active alerts

### Updating the Build Manager

The build manager is self-contained in the `scripts/build-manager/` directory. Updates can be made by modifying the individual component files.