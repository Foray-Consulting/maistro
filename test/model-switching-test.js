#!/usr/bin/env node
/**
 * Test script for Maistro's model switching functionality
 * 
 * This script tests the ModelManager and its ability to update
 * the Goose configuration file for model switching.
 */

const path = require('path');
const fs = require('fs-extra');
const yaml = require('js-yaml');
const { execSync } = require('child_process');

// Import the ModelManager
const ModelManager = require('../src/model-manager');

// Create a temporary directory for test data
const testDir = path.join(__dirname, 'temp-test-data');
fs.ensureDirSync(testDir);

// Path to a temporary model config file for testing
const testConfigPath = path.join(testDir, 'test-models.json');

// Path to a temporary goose config for testing
const gooseConfigPath = path.join(testDir, 'test-goose-config.yaml');

// Initialize ModelManager with test configuration
const modelManager = new ModelManager(testConfigPath);

// Override gooseConfigPath for testing
modelManager.gooseConfigPath = gooseConfigPath;

// Test models
const TEST_MODELS = [
  'anthropic/claude-3.7-sonnet',
  'openai/o3-mini-high'
];

// Test API key
const TEST_API_KEY = 'sk-or-testapikey123456789';

/**
 * Run the tests
 */
async function runTests() {
  console.log('Starting model switching tests...\n');
  
  // Test 1: Initialize with default models
  console.log('Test 1: Initializing ModelManager');
  
  try {
    console.log('  - Default model:', modelManager.getDefaultModel());
    console.log('  - Available models:', modelManager.getAllModels());
    console.log('  ✓ Initialization passed');
  } catch (error) {
    console.error('  ✗ Initialization failed:', error.message);
    process.exit(1);
  }
  
  // Test 2: Set API key
  console.log('\nTest 2: Setting API key');
  
  try {
    await modelManager.setAPIKey(TEST_API_KEY);
    const apiKey = modelManager.getAPIKey();
    console.log('  - Stored API key:', apiKey ? '***Key stored***' : 'No key stored');
    console.log('  ✓ API key setting passed');
  } catch (error) {
    console.error('  ✗ API key setting failed:', error.message);
    process.exit(1);
  }
  
  // Test 3: Switch to first test model
  console.log('\nTest 3: Switching to first test model');
  
  try {
    await modelManager.switchToModel(TEST_MODELS[0]);
    
    // Read the config file to verify
    const configContent = fs.readFileSync(gooseConfigPath, 'utf8');
    const config = yaml.load(configContent);
    
    console.log('  - Config file written to:', gooseConfigPath);
    console.log('  - Provider:', config.provider);
    console.log('  - Model:', config.GOOSE_MODEL);
    
    if (config.GOOSE_MODEL !== TEST_MODELS[0]) {
      throw new Error(`Model was not set correctly: ${config.GOOSE_MODEL}`);
    }
    
    console.log('  ✓ First model switch passed');
  } catch (error) {
    console.error('  ✗ First model switch failed:', error.message);
    process.exit(1);
  }
  
  // Test 4: Switch to second test model
  console.log('\nTest 4: Switching to second test model');
  
  try {
    await modelManager.switchToModel(TEST_MODELS[1]);
    
    // Read the config file to verify
    const configContent = fs.readFileSync(gooseConfigPath, 'utf8');
    const config = yaml.load(configContent);
    
    console.log('  - Provider:', config.provider);
    console.log('  - Model:', config.GOOSE_MODEL);
    
    if (config.GOOSE_MODEL !== TEST_MODELS[1]) {
      throw new Error(`Model was not set correctly: ${config.GOOSE_MODEL}`);
    }
    
    console.log('  ✓ Second model switch passed');
  } catch (error) {
    console.error('  ✗ Second model switch failed:', error.message);
    process.exit(1);
  }
  
  // Test 5: Set default model and switch to it
  console.log('\nTest 5: Setting and using default model');
  
  try {
    await modelManager.setDefaultModel(TEST_MODELS[0]);
    console.log('  - Default model set to:', modelManager.getDefaultModel());
    
    await modelManager.switchToDefaultModel();
    
    // Read the config file to verify
    const configContent = fs.readFileSync(gooseConfigPath, 'utf8');
    const config = yaml.load(configContent);
    
    console.log('  - Model in config:', config.GOOSE_MODEL);
    
    if (config.GOOSE_MODEL !== TEST_MODELS[0]) {
      throw new Error(`Model was not set correctly: ${config.GOOSE_MODEL}`);
    }
    
    console.log('  ✓ Default model switch passed');
  } catch (error) {
    console.error('  ✗ Default model switch failed:', error.message);
    process.exit(1);
  }
  
  // Clean up
  try {
    fs.removeSync(testDir);
    console.log('\nTest data cleaned up successfully');
  } catch (error) {
    console.error('\nError cleaning up test data:', error.message);
  }
  
  console.log('\nAll tests completed successfully! 🎉');
}

// Run the tests
runTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
