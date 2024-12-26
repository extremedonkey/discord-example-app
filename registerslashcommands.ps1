# Run npm run register
echo "Running npm run register..."
npm run register

# Check if npm run register was successful
if ($LASTEXITCODE -ne 0) {
    echo "npm run register failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

# Run npm run registerguild
echo "Running npm run registerguild..."
npm run registerguild

# Check if npm run registerguild was successful
if ($LASTEXITCODE -ne 0) {
    echo "npm run registerguild failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

# Logging
echo "Both npm run register and npm run registerguild have been executed successfully."
