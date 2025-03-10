const fs = require('fs-extra');
const path = require('path');

/**
 * Manages configuration storage and retrieval
 */
class ConfigManager {
  /**
   * Constructor
   * @param {string} configPath - Path to the config file
   */
  constructor(configPath) {
    this.configPath = configPath;
    this.configs = [];
    this.loadConfigs();
  }

  /**
   * Load configurations from disk
   */
  loadConfigs() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        this.configs = JSON.parse(data);
      } else {
        // Initialize with empty array if file doesn't exist
        this.configs = [];
        fs.writeFileSync(this.configPath, JSON.stringify(this.configs, null, 2));
      }
    } catch (error) {
      console.error('Error loading configs:', error);
      this.configs = [];
    }
  }

  /**
   * Save configurations to disk
   */
  async saveConfigs() {
    try {
      await fs.writeFile(this.configPath, JSON.stringify(this.configs, null, 2));
    } catch (error) {
      console.error('Error saving configs:', error);
      throw new Error('Failed to save configurations');
    }
  }

  /**
   * Get all configurations
   * @returns {Array} - Array of configurations
   */
  getAllConfigs() {
    return this.configs;
  }

  /**
   * Get configuration by ID
   * @param {string} id - Configuration ID
   * @returns {Object|null} - Configuration object or null if not found
   */
  getConfigById(id) {
    return this.configs.find(config => config.id === id) || null;
  }

  /**
   * Save a configuration
   * @param {Object} config - Configuration object
   * @returns {Object} - Saved configuration
   */
  async saveConfig(config) {
    const existingIndex = this.configs.findIndex(c => c.id === config.id);
    
    if (existingIndex >= 0) {
      // Update existing
      this.configs[existingIndex] = config;
    } else {
      // Add new
      this.configs.push(config);
    }
    
    await this.saveConfigs();
    return config;
  }

  /**
   * Delete a configuration
   * @param {string} id - Configuration ID
   * @returns {boolean} - True if deleted, false if not found
   */
  async deleteConfig(id) {
    const initialLength = this.configs.length;
    this.configs = this.configs.filter(config => config.id !== id);
    
    if (this.configs.length !== initialLength) {
      await this.saveConfigs();
      return true;
    }
    
    return false;
  }

  /**
   * Save prompt to a file
   * @param {string} configId - Configuration ID
   * @param {string} prompt - Prompt text or prompt object
   * @param {number} index - Prompt index
   * @param {string} promptsDir - Directory to save prompts in
   * @returns {string} - File path
   */
  async savePromptToFile(configId, prompt, index, promptsDir) {
    const fileName = `${configId}_prompt_${index}.md`;
    const filePath = path.join(promptsDir, fileName);
    
    // Handle both string prompts and prompt objects
    const promptText = typeof prompt === 'object' ? prompt.text : prompt;
    
    await fs.writeFile(filePath, promptText);
    return filePath;
  }

  /**
   * Get prompt text from a prompt object or string
   * @param {Object|string} prompt - Prompt object or string
   * @returns {string} - Prompt text
   */
  getPromptText(prompt) {
    return typeof prompt === 'object' ? prompt.text : prompt;
  }

/**
 * Get enabled MCP server IDs for a prompt
 * @param {Object|string} prompt - Prompt object or string
 * @returns {Array} - Array of enabled MCP server IDs
 */
getPromptMCPServerIds(prompt) {
  if (typeof prompt === 'object' && prompt.mcpServerIds) {
    return prompt.mcpServerIds;
  }
  return [];
}

/**
 * Get model for a prompt
 * @param {Object|string} prompt - Prompt object or string
 * @returns {string|null} - Model ID or null if not set
 */
getPromptModel(prompt) {
  if (typeof prompt === 'object' && prompt.model) {
    return prompt.model;
  }
  return null;
}
}

module.exports = ConfigManager;
