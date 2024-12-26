# Add all changes to git
echo "Adding changes to git..."
git add .

# Commit changes with a default message
echo "Committing changes..."
$commitMessage = git commit -m "Auto-commit" 2>&1

# Check if commit was successful
if ($LASTEXITCODE -ne 0) {
    if ($commitMessage -match "nothing to commit, working tree clean") {
        echo "No changes to commit, continuing..."
    } else {
        echo "git commit failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
} else {
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
}

# Function to check and terminate any process using port 3000
function Stop-ProcessOnPort {
    param (
        [int]$port
    )
    $netstat = netstat -ano | Select-String ":$port\s+.*LISTENING\s+(\d+)"
    if ($netstat) {
        $processId = $netstat.Matches[0].Groups[1].Value
        echo "Terminating process with PID $processId using port $port..."
        Stop-Process -Id $processId -Force
    }
}

# Terminate any process using port 3000
Stop-ProcessOnPort -port 3000

# Run npm start in the foreground
echo "Running npm start...."
npm run start
