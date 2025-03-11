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
   * Create a virtual folder structure from config paths
   * @returns {Object} - Folder structure
   */
  getFolderStructure() {
    const folders = {};
    
    // Add all folders from config paths
    this.configs.forEach(config => {
      if (config.path) {
        const pathParts = config.path.split('/');
        let currentPath = '';
        
        // Create each level of the path
        pathParts.forEach(part => {
          if (part) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            folders[currentPath] = {
              name: part,
              path: currentPath,
              parentPath: currentPath.includes('/') 
                ? currentPath.substring(0, currentPath.lastIndexOf('/')) 
                : '',
              isFolder: true
            };
          }
        });
      }
    });
    
    return folders;
  }
  
  /**
   * Get all folders
   * @returns {Array} - Array of folder objects
   */
  getAllFolders() {
    const folderStructure = this.getFolderStructure();
    return Object.values(folderStructure);
  }
  
  /**
   * Create a new folder
   * @param {string} path - Folder path
   * @returns {Object} - Created folder
   */
  async createFolder(path) {
    // Nothing to save for folders as they're virtual
    // Just return the folder object
    return {
      path,
      name: path.includes('/') ? path.split('/').pop() : path,
      parentPath: path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '',
      isFolder: true
    };
  }
  
  /**
   * Delete a folder and move its configs to parent folder
   * @param {string} path - Folder path to delete
   * @returns {boolean} - True if deleted
   */
  async deleteFolder(path) {
    // Find configs in this folder or subfolders
    const affected = this.configs.filter(config => 
      config.path === path || config.path.startsWith(`${path}/`));
    
    // Get parent path
    const parentPath = path.includes('/') 
      ? path.substring(0, path.lastIndexOf('/')) 
      : '';
    
    // Move configs to parent folder
    let modified = false;
    for (const config of affected) {
      config.path = parentPath;
      modified = true;
    }
    
    if (modified) {
      await this.saveConfigs();
    }
    
    return true;
  }
  
  /**
   * Rename a folder
   * @param {string} oldPath - Current folder path
   * @param {string} newPath - New folder path
   * @returns {boolean} - True if renamed
   */
  async renameFolder(oldPath, newPath) {
    // Find configs in this folder or subfolders
    const affected = this.configs.filter(config => 
      config.path === oldPath || config.path.startsWith(`${oldPath}/`));
    
    // Update paths
    let modified = false;
    for (const config of affected) {
      config.path = config.path.replace(oldPath, newPath);
      modified = true;
    }
    
    if (modified) {
      await this.saveConfigs();
    }
    
    return true;
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
        // If file doesn't exist, start with empty configs array
        this.configs = [];
        // Ensure the directory exists
        fs.ensureDirSync(path.dirname(this.configPath));
        // Create empty configs file
        fs.writeFileSync(this.configPath, JSON.stringify([], null, 2));
      }
    } catch (error) {
      console.error('Error loading configs:', error);
      // Start with empty configs if there was an error
      this.configs = [];
    }
  }

  /**
   * Validate a configuration object
   * @param {Object} config - The configuration object to validate
   * @returns {boolean} True if valid, false otherwise
   */
  validateConfig(config) {
    if (!config || typeof config !== 'object') {
      console.error('Invalid configuration: Not an object');
      return false;
    }

    if (!config.id || typeof config.id !== 'string') {
      console.error('Invalid configuration: Missing or invalid id');
      return false;
    }

    if (!config.name || typeof config.name !== 'string') {
      console.error('Invalid configuration: Missing or invalid name');
      return false;
    }

    if (!Array.isArray(config.prompts)) {
      console.error('Invalid configuration: prompts is not an array');
      return false;
    }

    if (config.prompts.length === 0) {
      console.error('Invalid configuration: prompts array is empty');
      return false;
    }

    // Validate trigger if present
    if (config.trigger) {
      if (typeof config.trigger !== 'object') {
        console.error('Invalid configuration: trigger is not an object');
        return false;
      }

      if (!config.trigger.configId || typeof config.trigger.configId !== 'string') {
        console.error('Invalid configuration: trigger missing or invalid configId');
        return false;
      }

      // preserveSession is optional, but if provided must be boolean
      if (config.trigger.preserveSession !== undefined && 
          typeof config.trigger.preserveSession !== 'boolean') {
        console.error('Invalid configuration: trigger.preserveSession must be a boolean');
        return false;
      }
    }

    return true;
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
   * @param {string} [folderPath] - Optional folder path to filter by
   * @returns {Array} - Array of configurations
   */
  getAllConfigs(folderPath) {
    if (folderPath === undefined) {
      return this.configs;
    }
    
    // Filter configs by folder path
    return this.configs.filter(config => config.path === folderPath);
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
