#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Try to find the goose command
function findGoosePath() {
  try {
    // Try using the 'which' command
    const whichOutput = execSync('which goose', { encoding: 'utf8' }).trim();
    if (whichOutput) {
      console.log(`Found goose using 'which': ${whichOutput}`);
      return whichOutput;
    }
  } catch (error) {
    console.log("Could not find goose using 'which' command");
  }

  // Try common locations
  const commonLocations = [
    '/usr/local/bin/goose',
    '/usr/bin/goose',
    '/bin/goose',
    process.env.HOME + '/.local/bin/goose',
    process.env.HOME + '/bin/goose'
  ];

  for (const location of commonLocations) {
    try {
      if (fs.existsSync(location)) {
        console.log(`Found goose at common location: ${location}`);
        return location;
      }
    } catch (error) {
      // Ignore errors from existsSync
    }
  }

  // If still not found, try checking PATH directories manually
  if (process.env.PATH) {
    const pathDirs = process.env.PATH.split(path.delimiter);
    for (const dir of pathDirs) {
      const possiblePath = path.join(dir, 'goose');
      try {
        if (fs.existsSync(possiblePath)) {
          console.log(`Found goose in PATH directory: ${possiblePath}`);
          return possiblePath;
        }
      } catch (error) {
        // Ignore errors from existsSync
      }
    }
  }

  console.log('Could not find goose command. Please ensure it is installed and in your PATH.');
  return null;
}

// Check PATH environment variable
console.log('PATH environment variable:');
console.log(process.env.PATH);

// Find goose
const goosePath = findGoosePath();
if (goosePath) {
  console.log('\nGoose command found at:', goosePath);
  
  // Test if it's executable
  try {
    const versionOutput = execSync(`${goosePath} --version`, { encoding: 'utf8' }).trim();
    console.log('Goose version:', versionOutput);
  } catch (error) {
    console.log('Error executing goose:', error.message);
  }
  
  // Save the path to a file for the main application to use
  const configPath = path.join(__dirname, '..', 'data', 'goose-path.txt');
  fs.writeFileSync(configPath, goosePath);
  console.log(`Saved goose path to ${configPath}`);
} else {
  console.log('\nGoose command not found. Please make sure it is installed and in your PATH.');
}
