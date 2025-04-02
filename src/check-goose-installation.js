#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

console.log('Checking Goose CLI installation...');

/**
 * Verifies if Goose is properly installed and accessible
 */
async function checkGooseInstallation() {
  const nodeModulesPath = path.join(__dirname, '..', 'node_modules', '.bin', 'goose');
  const dataDir = path.join(__dirname, '..', 'data');
  const goosePathFile = path.join(dataDir, 'goose-path.txt');
  
  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`Created data directory: ${dataDir}`);
  }

  // Check for Goose in node_modules
  let goosePath = null;
  
  if (fs.existsSync(nodeModulesPath)) {
    goosePath = nodeModulesPath;
    console.log(`Found Goose in node_modules: ${goosePath}`);
  }
  
  // If not found in node_modules, check PATH
  if (!goosePath) {
    try {
      const whichOutput = execSync('which goose', { encoding: 'utf8' }).trim();
      if (whichOutput) {
        goosePath = whichOutput;
        console.log(`Found Goose in PATH: ${goosePath}`);
      }
    } catch (error) {
      console.log("Could not find Goose using 'which' command");
    }
  }
  
  // Final check for goose path
  if (goosePath) {
    try {
      const versionOutput = execSync(`"${goosePath}" --version`, { encoding: 'utf8' }).trim();
      console.log(`✅ Goose installation verified: ${versionOutput}`);
      
      // Save the path to a file for the application to use
      fs.writeFileSync(goosePathFile, goosePath);
      console.log(`Saved Goose path to: ${goosePathFile}`);
      return true;
    } catch (error) {
      console.error(`Error executing Goose: ${error.message}`);
    }
  }
  
  console.warn('⚠️  Goose CLI was not found or is not executable.');
  console.warn('   This may cause issues when running Maistro.');
  console.warn('   Attempting to use bundled Goose installation...');
  
  return false;
}

checkGooseInstallation()
  .then(success => {
    if (success) {
      console.log('Goose installation check completed successfully.');
    } else {
      console.log('Goose installation check completed with warnings.');
    }
  });