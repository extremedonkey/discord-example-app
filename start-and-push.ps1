# Run npm start in the background
echo "Running npm start..."
Start-Process -NoNewWindow -FilePath "npm" -ArgumentList "run start"

# Wait for a few seconds to ensure npm start has initiated
Start-Sleep -Seconds 5

# Add all changes to git
echo "Adding changes to git..."
git add .

# Commit changes with a default message
echo "Committing changes..."
git commit -m "Auto-commit"

# Check if commit was successful
if ($LASTEXITCODE -ne 0) {
    echo "git commit failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

# Push changes to the remote repository
echo "Pushing changes to remote repository..."
git push

# Check if push was successful
if ($LASTEXITCODE -ne 0) {
    echo "git push failed with exit code $LASTEXITCODE"
    echo "Setting upstream branch and pushing again..."
    git push --set-upstream origin $(git symbolic-ref --short HEAD)
    if ($LASTEXITCODE -ne 0) {
        echo "git push with upstream failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
}

# Logging
echo "Changes have been committed and pushed."
