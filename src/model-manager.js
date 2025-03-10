const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Manages LLM model configurations and Goose CLI integration
 */
class ModelManager {
  /**
   * Constructor
   * @param {string} configPath - Path to the model config file
   */
  constructor(configPath) {
    this.configPath = configPath;
    this.gooseConfigPath = path.join(process.env.HOME, '.config', 'goose', 'config.yaml');
    this.modelConfig = {
      defaultModel: 'anthropic/claude-3.7-sonnet',
      apiKey: '',
      availableModels: [
        'anthropic/claude-3.7-sonnet:thinking',
        'anthropic/claude-3.7-sonnet',
        'openai/o3-mini-high',
        'openai/gpt-4o-2024-11-20'
      ]
    };
    this.loadModelConfig();
  }

  /**
   * Load model configuration from disk
   */
  loadModelConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        this.modelConfig = JSON.parse(data);
      } else {
        // Initialize with default config if file doesn't exist
        fs.writeFileSync(this.configPath, JSON.stringify(this.modelConfig, null, 2));
      }
    } catch (error) {
      console.error('Error loading model config:', error);
    }
  }

  /**
   * Save model configuration to disk
   */
  async saveModelConfig() {
    try {
      await fs.writeFile(this.configPath, JSON.stringify(this.modelConfig, null, 2));
    } catch (error) {
      console.error('Error saving model config:', error);
      throw new Error('Failed to save model configuration');
    }
  }

  /**
   * Get all available models
   * @returns {Array} - Array of model IDs
   */
  getAllModels() {
    return this.modelConfig.availableModels || [];
  }

  /**
   * Get default model
   * @returns {string} - Default model ID
   */
  getDefaultModel() {
    return this.modelConfig.defaultModel || 'anthropic/claude-3.7-sonnet';
  }

  /**
   * Set default model
   * @param {string} modelId - Model ID to set as default
   */
  async setDefaultModel(modelId) {
    // Ensure the model exists in available models
    if (!this.modelConfig.availableModels.includes(modelId)) {
      throw new Error(`Model ${modelId} is not in the list of available models`);
    }

    this.modelConfig.defaultModel = modelId;
    await this.saveModelConfig();
    return this.modelConfig.defaultModel;
  }

  /**
   * Add a new model to available models
   * @param {string} modelId - Model ID to add
   */
  async addModel(modelId) {
    if (!modelId || typeof modelId !== 'string') {
      throw new Error('Invalid model ID');
    }

    // Check if model already exists
    if (this.modelConfig.availableModels.includes(modelId)) {
      return this.modelConfig.availableModels;
    }

    this.modelConfig.availableModels.push(modelId);
    await this.saveModelConfig();
    return this.modelConfig.availableModels;
  }

  /**
   * Remove a model from available models
   * @param {string} modelId - Model ID to remove
   */
  async removeModel(modelId) {
    // Don't allow removing the default model
    if (this.modelConfig.defaultModel === modelId) {
      throw new Error('Cannot remove the default model');
    }

    const initialLength = this.modelConfig.availableModels.length;
    this.modelConfig.availableModels = this.modelConfig.availableModels.filter(m => m !== modelId);
    
    if (this.modelConfig.availableModels.length !== initialLength) {
      await this.saveModelConfig();
    }
    
    return this.modelConfig.availableModels;
  }

  /**
   * Get the stored API key
   * @returns {string} - OpenRouter API key
   */
  getAPIKey() {
    return this.modelConfig.apiKey || '';
  }

  /**
   * Set the API key
   * @param {string} apiKey - OpenRouter API key
   */
  async setAPIKey(apiKey) {
    this.modelConfig.apiKey = apiKey;
    await this.saveModelConfig();
    return true;
  }

  /**
   * Check if Goose config file exists
   * @returns {boolean} - True if config exists
   */
  gooseConfigExists() {
    return fs.existsSync(this.gooseConfigPath);
  }

  /**
   * Get current model from Goose config
   * @returns {string|null} - Current model ID or null if not found
   */
  async getCurrentGooseModel() {
    try {
      if (!this.gooseConfigExists()) {
        return null;
      }

      const configContent = await fs.readFile(this.gooseConfigPath, 'utf8');
      const config = yaml.load(configContent);
      
      if (config.provider === 'openrouter' && 
          config.provider_settings && 
          config.provider_settings.openrouter && 
          config.provider_settings.openrouter.model) {
        return config.provider_settings.openrouter.model;
      }
      
      return null;
    } catch (error) {
      console.error('Error getting current Goose model:', error);
      return null;
    }
  }

  /**
   * Validate a model ID and API key
   * @param {string} modelId - Model ID to validate
   * @returns {boolean} - True if valid
   * @throws {Error} - If invalid
   */
  validateModelAndApiKey(modelId) {
    // Validate model
    if (!this.modelConfig.availableModels.includes(modelId)) {
      throw new Error(`Model ${modelId} is not in the list of available models`);
    }

    // Check if we have an API key
    if (!this.modelConfig.apiKey) {
      throw new Error('OpenRouter API key is not configured');
    }
    
    return true;
  }

  /**
   * Switch to a specific model by directly updating the config file
   * @param {string} modelId - Model ID to switch to
   * @returns {boolean} - True if successful
   */
  async switchToModel(modelId) {
    try {
      // Validate model and API key
      this.validateModelAndApiKey(modelId);

      // Read current Goose config or create new one
      let config = {};
      if (this.gooseConfigExists()) {
        const configContent = await fs.readFile(this.gooseConfigPath, 'utf8');
        config = yaml.load(configContent) || {};
      }
      
      // Update provider and model settings
      config.provider = 'openrouter';
      config.GOOSE_PROVIDER = 'openrouter';
      config.GOOSE_MODEL = modelId;
      
      // Make sure API key is set
      config.provider_settings = config.provider_settings || {};
      config.provider_settings.openrouter = config.provider_settings.openrouter || {};
      config.provider_settings.openrouter.api_key = this.modelConfig.apiKey;
      
      // Ensure the directory exists
      await fs.ensureDir(path.dirname(this.gooseConfigPath));
      
      // Write updated config
      await fs.writeFile(this.gooseConfigPath, yaml.dump(config), 'utf8');
      
      console.log(`Updated config file with model: ${modelId}`);
      return true;
    } catch (error) {
      console.error('Error updating model config:', error);
      throw new Error(`Failed to update model config for ${modelId}: ${error.message}`);
    }
  }

  /**
   * Switch to the default model
   * @returns {boolean} - True if successful
   */
  async switchToDefaultModel() {
    return this.switchToModel(this.getDefaultModel());
  }
}

module.exports = ModelManager;
