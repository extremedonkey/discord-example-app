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
git push origin $(git symbolic-ref --short HEAD)

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

# Function to check and terminate any process using port 3000
function Stop-ProcessOnPort {
    param (
        [int]$port
    )
    $netstat = netstat -ano | Select-String ":$port\s+.*LISTENING\s+(\d+)"
    if ($netstat) {
        $pid = $netstat.Matches[0].Groups[1].Value
        echo "Terminating process with PID $pid using port $port..."
        Stop-Process -Id $pid -Force
    }
}

# Terminate any process using port 3000
Stop-ProcessOnPort -port 3000

# Run npm start in the background
echo "Running npm start..."
Start-Process -NoNewWindow -FilePath "npm" -ArgumentList "run start"
