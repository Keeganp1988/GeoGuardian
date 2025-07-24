#!/bin/bash
echo "Building iOS application..."

echo "Validating environment..."
node scripts/build-manager/index.js validate
if [ $? -ne 0 ]; then
    echo "Environment validation failed"
    exit 1
fi

echo "Building iOS app..."
npx expo run:ios

echo "iOS build completed!"