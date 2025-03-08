const fs = require('fs-extra');
const path = require('path');

/**
 * Manages MCP server configurations
 */
class MCPServerManager {
  /**
   * Constructor
   * @param {string} configPath - Path to the MCP server config file
   */
  constructor(configPath) {
    this.configPath = configPath;
    this.mcpServers = [];
    this.loadMCPServers();
  }

  /**
   * Load MCP server configurations from disk
   */
  loadMCPServers() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        this.mcpServers = JSON.parse(data);
      } else {
        // Initialize with empty array if file doesn't exist
        this.mcpServers = [];
        fs.writeFileSync(this.configPath, JSON.stringify(this.mcpServers, null, 2));
      }
    } catch (error) {
      console.error('Error loading MCP server configs:', error);
      this.mcpServers = [];
    }
  }

  /**
   * Save MCP server configurations to disk
   */
  async saveMCPServers() {
    try {
      await fs.writeFile(this.configPath, JSON.stringify(this.mcpServers, null, 2));
    } catch (error) {
      console.error('Error saving MCP server configs:', error);
      throw new Error('Failed to save MCP server configurations');
    }
  }

  /**
   * Get all MCP server configurations
   * @returns {Array} - Array of MCP server configurations
   */
  getAllMCPServers() {
    return this.mcpServers;
  }

  /**
   * Get MCP server configuration by ID
   * @param {string} id - MCP server configuration ID
   * @returns {Object|null} - MCP server configuration object or null if not found
   */
  getMCPServerById(id) {
    return this.mcpServers.find(mcpServer => mcpServer.id === id) || null;
  }

  /**
   * Get MCP server extension string for Goose CLI
   * @param {string} id - MCP server configuration ID
   * @returns {string} - Formatted extension string for --with-extension parameter
   */
  getMCPServerExtensionString(id) {
    const mcpServer = this.getMCPServerById(id);
    if (!mcpServer) return '';

    // Build environment variables part
    const envVarString = Object.entries(mcpServer.env || {})
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');

    // Return the full extension string
    return `${envVarString} ${mcpServer.command} ${mcpServer.args || ''}`.trim();
  }

  /**
   * Save a MCP server configuration
   * @param {Object} mcpServer - MCP server configuration object
   * @returns {Object} - Saved MCP server configuration
   */
  async saveMCPServer(mcpServer) {
    // Validate MCP server configuration
    if (!mcpServer.name || !mcpServer.command) {
      throw new Error('MCP server configuration must have a name and command');
    }

    // Ensure ID exists
    if (!mcpServer.id) {
      mcpServer.id = `mcp-server-${Date.now()}`;
    }

    const existingIndex = this.mcpServers.findIndex(m => m.id === mcpServer.id);
    
    if (existingIndex >= 0) {
      // Update existing
      this.mcpServers[existingIndex] = mcpServer;
    } else {
      // Add new
      this.mcpServers.push(mcpServer);
    }
    
    await this.saveMCPServers();
    return mcpServer;
  }

  /**
   * Delete a MCP server configuration
   * @param {string} id - MCP server configuration ID
   * @returns {boolean} - True if deleted, false if not found
   */
  async deleteMCPServer(id) {
    const initialLength = this.mcpServers.length;
    this.mcpServers = this.mcpServers.filter(mcpServer => mcpServer.id !== id);
    
    if (this.mcpServers.length !== initialLength) {
      await this.saveMCPServers();
      return true;
    }
    
    return false;
  }

  /**
   * Build the --with-extension parameter for Goose command
   * @param {Array} enabledServerIds - Array of enabled MCP server IDs
   * @returns {Array} - Array of arguments to add to the Goose command
   */
  buildExtensionArgs(enabledServerIds) {
    if (!enabledServerIds || enabledServerIds.length === 0) {
      return [];
    }

    const args = [];
    
    // Add each enabled MCP server's extension string
    for (const id of enabledServerIds) {
      const extensionString = this.getMCPServerExtensionString(id);
      if (extensionString) {
        args.push('--with-extension');
        args.push(extensionString);
      }
    }
    
    return args;
  }
}

module.exports = MCPServerManager;
