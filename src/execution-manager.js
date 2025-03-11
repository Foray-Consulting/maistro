const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

/**
 * Manages execution of prompt commands
 */
class ExecutionManager {
  /**
   * Constructor
   * @param {ConfigManager} configManager - Config manager instance
   * @param {MCPServerManager} mcpServerManager - MCP server manager instance
   * @param {ModelManager} modelManager - Model manager instance
   * @param {string} dataDir - Data directory path
   */
  constructor(configManager, mcpServerManager, modelManager, dataDir) {
    this.configManager = configManager;
    this.mcpServerManager = mcpServerManager;
    this.modelManager = modelManager;
    this.dataDir = dataDir;
    this.promptsDir = path.join(dataDir, 'prompts');
    this.activeExecutions = new Map();
    this.debug = process.env.DEBUG === 'true';
    
    // Try to load the goose path from the finder script
    try {
      const goosePathFile = path.join(dataDir, 'goose-path.txt');
      if (fs.existsSync(goosePathFile)) {
        this.goosePath = fs.readFileSync(goosePathFile, 'utf8').trim();
        this.log(`Loaded goose path from file: ${this.goosePath}`);
      } else {
        this.goosePath = 'goose';  // Default to just 'goose' and let PATH find it
        this.log('No saved goose path found, using default: goose');
      }
    } catch (error) {
      this.goosePath = 'goose';
      this.log(`Error loading goose path: ${error.message}, using default: goose`);
    }
  }

  /**
   * Execute a configuration
   * @param {Object} config - Configuration to execute
   * @param {WebSocket} ws - WebSocket connection for streaming output
   */
  async executeConfig(config, ws) {
    if (!config || !config.prompts || config.prompts.length === 0) {
      this.sendError(ws, 'Invalid configuration or no prompts to execute');
      return;
    }

    this.log(`Starting execution of config: ${config.id} (${config.name})`);

    // Prepare prompts
    const promptFiles = [];
    try {
      for (let i = 0; i < config.prompts.length; i++) {
        const promptPath = await this.configManager.savePromptToFile(
          config.id,
          config.prompts[i],
          i,
          this.promptsDir
        );
        promptFiles.push(promptPath);
        this.log(`Saved prompt ${i+1} to: ${promptPath}`);
      }
    } catch (error) {
      this.log(`Error preparing prompts: ${error.message}`, true);
      this.sendError(ws, `Failed to prepare prompts: ${error.message}`);
      return;
    }

    // Track this execution
    const executionId = `${config.id}-${Date.now()}`;
    this.activeExecutions.set(executionId, { config, promptFiles });
    this.log(`Created execution with ID: ${executionId}`);

    // Execute prompts in sequence
    this.executePromptSequence(executionId, ws);
  }

  /**
   * Switch models by updating the Goose config file
   * @param {string} modelId - Model ID to switch to
   * @param {WebSocket} ws - WebSocket connection for streaming output
   * @returns {Promise<void>} - Resolves when model is switched
   */
  async switchModel(modelId, ws) {
    try {
      this.log(`Switching to model: ${modelId}`);
      this.sendOutput(ws, `Switching to model: ${modelId}...\n`);
      
      // Use the model manager to update the config file
      await this.modelManager.switchToModel(modelId);
      
      this.log(`Successfully switched to model: ${modelId}`);
      this.sendOutput(ws, `Model set to: ${modelId}\n`);
    } catch (error) {
      this.log(`Error switching to model: ${error.message}`, true);
      this.sendOutput(ws, `Warning: Failed to switch model: ${error.message}\n`);
      throw error;
    }
  }

  /**
   * Execute a sequence of prompts
   * @param {string} executionId - Execution ID
   * @param {WebSocket} ws - WebSocket connection
   * @param {number} currentIndex - Current prompt index
   * @param {Object} [options] - Additional options
   * @param {string} [options.parentExecutionId] - ID of the parent execution if this is a triggered execution
   * @param {string} [options.sessionName] - Optional session name to use (for preserving session)
   */
  async executePromptSequence(executionId, ws, currentIndex = 0, options = {}) {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      this.log(`Execution not found: ${executionId}`, true);
      this.sendError(ws, 'Execution not found');
      return;
    }

    const { config, promptFiles } = execution;

    // Check if we've completed all prompts
    if (currentIndex >= promptFiles.length) {
      this.log(`All prompts completed for execution: ${executionId}`);
      
      // Check if there's a trigger configured
      if (config.trigger && config.trigger.configId) {
        this.log(`Trigger found for configuration: ${config.id} -> ${config.trigger.configId}`);
        this.sendOutput(ws, `\nTriggering execution of: ${config.trigger.configId}\n`);
        
        // Execute the triggered configuration
        await this.executeTrigger(config, ws, executionId);
      } else {
        this.sendMessage(ws, 'end', { message: 'All prompts completed' });
      }
      
      this.activeExecutions.delete(executionId);
      return;
    }

    const promptFile = promptFiles[currentIndex];
    const isFirstPrompt = currentIndex === 0;
    
    // Use the provided session name if available (for preserved sessions), otherwise create a new one
    const sessionName = options.sessionName || `maistro-${config.id}`;
    const isUsingParentSession = !!options.sessionName;

    try {
      // Notify client
      this.sendMessage(ws, 'start', {
        promptIndex: currentIndex,
        totalPrompts: promptFiles.length,
        prompt: config.prompts[currentIndex]
      });

      this.log(`Executing prompt ${currentIndex + 1}/${promptFiles.length}: ${config.prompts[currentIndex]}`);

      // Use the discovered goose path
      let command = this.goosePath;
      let args = [];
      
      // Check if the prompt file exists
      if (!fs.existsSync(promptFile)) {
        this.log(`Prompt file does not exist: ${promptFile}`, true);
        this.sendError(ws, `Prompt file does not exist: ${promptFile}`);
        throw new Error(`Prompt file does not exist: ${promptFile}`);
      }
      
      // Ensure the prompt path is absolute
      const absolutePromptPath = path.resolve(promptFile);
      this.log(`Using absolute prompt path: ${absolutePromptPath}`);

      // Only clean up the session if we're not using a parent session
      if (isFirstPrompt && !isUsingParentSession) {
        try {
          this.log(`Attempting to remove any existing session with name: ${sessionName}`);
          
          // Find and remove the session file directly from the goose sessions directory
          const sessionFilePath = path.join(process.env.HOME, '.local', 'share', 'goose', 'sessions', `${sessionName}.jsonl`);
          
          if (fs.existsSync(sessionFilePath)) {
            this.log(`Found existing session file at: ${sessionFilePath}`);
            fs.unlinkSync(sessionFilePath);
            this.log(`Successfully removed session file: ${sessionFilePath}`);
          } else {
            this.log(`No existing session file found at: ${sessionFilePath}`);
          }
          
          this.log(`Session cleanup complete for: ${sessionName}`);
        } catch (error) {
          // Ignore cleanup errors, just log them
          this.log(`Error during session cleanup: ${error.message}`, true);
        }
      }
      
      // Set up command arguments
      if (isFirstPrompt && !isUsingParentSession) {
        // First prompt: start a new session (with clean session now)
        args = ['run', '--name', sessionName, '--instructions', absolutePromptPath];
      } else {
        // Subsequent prompts or using parent session: resume existing session
        args = ['run', '--resume', '--name', sessionName, '--instructions', absolutePromptPath];
      }

      // Get the prompt being executed
      const promptObj = config.prompts[currentIndex];
      
      // Check if we need to switch models for this prompt
      const requestedModel = this.configManager.getPromptModel(promptObj);
      if (requestedModel) {
        try {
          await this.switchModel(requestedModel, ws);
        } catch (error) {
          this.log(`Error switching model: ${error.message}`, true);
          this.sendOutput(ws, `Warning: Failed to switch model: ${error.message}\n`);
          // Continue with execution despite model switch failure
        }
      } else if (isFirstPrompt) {
        // First prompt uses default model if none specified
        try {
          const defaultModel = this.modelManager.getDefaultModel();
          this.log(`Using default model: ${defaultModel}`);
          this.sendOutput(ws, `Setting default model: ${defaultModel}...\n`);
          await this.switchModel(defaultModel, ws);
        } catch (error) {
          this.log(`Error setting default model: ${error.message}`, true);
          this.sendOutput(ws, `Warning: Failed to set default model: ${error.message}\n`);
        }
      }
      
      // Check if this prompt has MCP server extensions enabled
      if (typeof promptObj === 'object' && promptObj.mcpServerIds && promptObj.mcpServerIds.length > 0) {
        const mcpServerIds = promptObj.mcpServerIds;
        this.log(`Prompt has ${mcpServerIds.length} MCP server extensions enabled`);
        
        // Add MCP server extension arguments
        const extensionArgs = this.mcpServerManager.buildExtensionArgs(mcpServerIds);
        
        if (extensionArgs.length > 0) {
          this.log(`Adding ${extensionArgs.length / 2} MCP server extensions to command`);
          args.push(...extensionArgs);
          
          // Log the MCP servers being used
          mcpServerIds.forEach(id => {
            const server = this.mcpServerManager.getMCPServerById(id);
            if (server) {
              this.log(`Using MCP server: ${server.name}`);
              this.sendOutput(ws, `Using MCP extension: ${server.name}\n`);
            }
          });
        }
      }
      
      // Log detailed command information
      this.log(`Command: ${command} ${args.join(' ')}`);
      this.log(`Current working directory: ${process.cwd()}`);
      this.log(`Environment PATH: ${process.env.PATH}`);

      // Execute the command
      await this.executeCommand(command, args, ws, () => {
        // On completion, execute the next prompt
        this.log(`Prompt ${currentIndex + 1} completed successfully`);
        this.sendMessage(ws, 'complete', { promptIndex: currentIndex });
        
        // Schedule the next prompt with a small delay
        // Pass all options to maintain session name for entire sequence
        setTimeout(() => {
          this.executePromptSequence(executionId, ws, currentIndex + 1, options);
        }, 1000);
      });
    } catch (error) {
      this.log(`Error executing prompt ${currentIndex + 1}: ${error.message}`, true);
      this.sendError(ws, `Error executing prompt ${currentIndex + 1}: ${error.message}`);
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * Execute a command and stream output
   * @param {string} command - Command to execute
   * @param {Array} args - Command arguments
   * @param {WebSocket} ws - WebSocket connection
   * @param {Function} onComplete - Callback for completion
   */
  executeCommand(command, args, ws, onComplete) {
    return new Promise((resolve, reject) => {
      try {
        // Try to verify the command exists
        this.log(`Using command '${command}'`);
        
        // Check if this is a direct path and exists
        if (command.includes('/') && !fs.existsSync(command)) {
          this.log(`Warning: Command path does not exist: ${command}`, true);
        }
        
        // Prepare a command string that includes all arguments with proper quoting
        const cmdArgs = args.map(arg => {
          // Quote arguments that contain spaces
          if (arg.includes(' ')) {
            return `"${arg.replace(/"/g, '\\"')}"`;
          }
          return arg;
        });
        
        // Create the full command string for debug and shell execution
        const fullCommand = `${command} ${cmdArgs.join(' ')}`;
        this.log(`Full command: ${fullCommand}`);
        
        // Log command for debug but don't send to client to keep output cleaner
        
        // Use explicit shell and options
        const childProcess = spawn(fullCommand, [], {
          env: Object.assign({}, process.env, { FORCE_COLOR: 'true' }), // Enable colored output
          shell: '/bin/bash', // Use bash explicitly
          windowsVerbatimArguments: false,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let hasError = false;
        let errorOutput = '';
        
        this.log(`Process spawned with PID: ${childProcess.pid || 'unknown'}`);
        // Only send the starting message for clarity
        this.sendOutput(ws, `Starting execution...\n`);

        // Buffer to collect partial lines
        let stdoutBuffer = '';
        let stderrBuffer = '';
        
        childProcess.stdout.on('data', (data) => {
          const output = data.toString();
          this.log(`[stdout] ${output.trim()}`, false, false);
          
          // Add to buffer and process complete lines
          stdoutBuffer += output;
          
          // Immediately send the output to client
          this.sendOutput(ws, output);
        });

        childProcess.stderr.on('data', (data) => {
          const output = data.toString();
          this.log(`[stderr] ${output.trim()}`, true, false);
          
          // Add to buffer and send to client
          stderrBuffer += output;
          this.sendOutput(ws, output);
          
          // Capture error output for debugging
          errorOutput += output;
          
          // Don't treat all stderr as error - some CLI tools use stderr for status messages
          if (output.toLowerCase().includes('error')) {
            hasError = true;
          }
        });

        childProcess.on('close', (code) => {
          this.log(`Process exited with code: ${code}`);
          if (code !== 0) {
            hasError = true;
            const errorMessage = `Command exited with code ${code}. Error output: ${errorOutput}`;
            this.log(errorMessage, true);
            this.sendError(ws, errorMessage);
            reject(new Error(errorMessage));
          } else {
            onComplete();
            resolve();
          }
        });

        childProcess.on('error', (error) => {
          this.log(`Process error: ${error.message}`, true);
          hasError = true;
          this.sendError(ws, error.message);
          reject(error);
        });
      } catch (error) {
        this.log(`Failed to spawn process: ${error.message}`, true);
        this.sendError(ws, `Failed to spawn process: ${error.message}`);
        reject(error);
      }
    });
  }

  /**
   * Log a message to the console
   * @param {string} message - Message to log
   * @param {boolean} isError - Whether this is an error message
   * @param {boolean} includeTimestamp - Whether to include a timestamp
   */
  log(message, isError = false, includeTimestamp = true) {
    if (this.debug || isError) {
      const timestamp = includeTimestamp ? `[${new Date().toISOString()}] ` : '';
      const prefix = isError ? '[ERROR] ' : '[INFO] ';
      const logMethod = isError ? console.error : console.log;
      logMethod(`${timestamp}${prefix}${message}`);
    }
  }

  /**
   * Send output via WebSocket
   * @param {WebSocket} ws - WebSocket connection
   * @param {string} content - Output content
   */
  /**
   * Clean output to make it more human-readable
   * @param {string} content - The original content to clean
   * @return {string} - Cleaned and formatted content
   */
  cleanOutput(content) {
    if (!content) return '';
    
    // Convert to string if it's not already
    const contentStr = String(content);
    
    // Specifically filter out only exact logging lines, not partial matches
    const loggingLineRegex = /^\s*logging to.*\.jsonl\s*$/;
    if (loggingLineRegex.test(contentStr.trim())) {
      return '';
    }
    
    // Extract AI response content from ANSI codes
    // This regex matches quoted content which is typically the AI response
    const aiResponseRegex = /"([^"]+)"/;
    const aiResponseMatch = contentStr.match(aiResponseRegex);
    
    // Check if this is a model switching message
    if (contentStr.includes('Switching to model:') || contentStr.includes('Model set to:')) {
      // Keep model switching messages but clean them up
      return contentStr.replace(/Executing command:.*?\n/, '');
    }
    
    // Check if this appears to be prompt start info
    if (contentStr.includes('Starting prompt')) {
      // Clean up prompt info, removing object notation
      return contentStr.replace(/\[object Object\]/g, '');
    }
    
    // If we found a quoted response or markdown formatted response, return just that
    if (aiResponseMatch && aiResponseMatch[1]) {
      return aiResponseMatch[1];
    }
    
    // For MCP extension messages, clean it up but keep the essential info
    if (contentStr.includes('Using MCP extension:')) {
      return contentStr;
    }
    
    // For success/completion messages, keep them clean
    if (contentStr.includes('Prompt completed') || 
        contentStr.includes('Execution completed') ||
        contentStr.includes('Starting execution')) {
      return contentStr;
    }
    
    // For lines with ANSI formatting (AI output), extract the content
    // The goose output from Claude often has color codes and terminal formatting
    if (contentStr.includes('\u001b[')) {
      // Handle ANSI-formatted text which is likely AI output
      // Strip ANSI codes but keep the actual text content
      return contentStr.replace(/\u001b\[\d+(?:;\d+)*m/g, '');
    }
    
    // For trigger execution messages, simplify them
    if (contentStr.includes('Triggering execution of:')) {
      return contentStr;
    }
    
    // Look for actual content in the text (usually after markdown headers)
    const contentAfterHeaderRegex = /^.*?\n(.*)/s;
    const contentMatch = contentStr.match(contentAfterHeaderRegex);
    if (contentMatch && contentMatch[1] && contentMatch[1].trim().length > 10) {
      return contentMatch[1].trim();
    }
    
    // For all other content, leave as is but remove command execution info
    return contentStr.replace(/Executing command:.*?\n/, '');
  }

  /**
   * Send output via WebSocket with robust error handling
   * @param {WebSocket} ws - WebSocket connection
   * @param {string} content - Output content
   * @returns {boolean} - Whether the output was successfully sent
   */
  sendOutput(ws, content) {
    if (!content) return false;
    
    // Clean the content to make it more human-readable
    const cleanedContent = this.cleanOutput(content);
    
    // Skip empty content after cleaning
    if (!cleanedContent || !cleanedContent.trim()) return false;
    
    // Detailed WebSocket state validation
    if (!ws) {
      // Only log occasionally to avoid spamming the console
      this.log('Skipping output: WebSocket connection is null', true);
      return false;
    }
    
    // Check the WebSocket ready state
    // 0: CONNECTING, 1: OPEN, 2: CLOSING, 3: CLOSED
    if (ws.readyState !== 1) {
      this.log(`Skipping output: WebSocket connection is in state ${ws.readyState} (not OPEN)`, true);
      return false;
    }
    
    // At this point, we have a valid WebSocket connection
    try {
      // Log output size for debugging
      this.log(`Sending output of size ${cleanedContent.length} bytes`);
      
      // Send the cleaned output
      ws.send(JSON.stringify({
        type: 'output',
        content: cleanedContent
      }));
      
      return true;
    } catch (error) {
      this.log(`Error sending output: ${error.message}`, true);
      return false;
    }
  }

  /**
   * Send error via WebSocket
   * @param {WebSocket} ws - WebSocket connection
   * @param {string} message - Error message
   */
  sendError(ws, message) {
    this.log(`Sending error to client: ${message}`, true);
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'error',
        message
      }));
    }
  }

  /**
   * Send message via WebSocket
   * @param {WebSocket} ws - WebSocket connection
   * @param {string} type - Message type
   * @param {Object} data - Message data
   */
  sendMessage(ws, type, data) {
    this.log(`Sending message of type '${type}' to client`);
    if (ws && ws.readyState === 1) {
      // If this is a start message for a prompt, clean up the prompt object display
      if (type === 'start' && data.prompt) {
        // Format prompt nicely for display
        // If it's an object with text property, use just the text
        if (typeof data.prompt === 'object' && data.prompt.text) {
          data.prompt = data.prompt.text;
        }
      }
      
      ws.send(JSON.stringify({
        type,
        ...data
      }));
    }
  }

  /**
   * Execute a triggered configuration
   * @param {Object} parentConfig - The configuration with the trigger
   * @param {WebSocket} ws - WebSocket connection from parent execution
   * @param {string} parentExecutionId - The parent execution ID
   */
  async executeTrigger(parentConfig, ws, parentExecutionId) {
    if (!parentConfig.trigger || !parentConfig.trigger.configId) {
      this.log(`No trigger configured for ${parentConfig.id}`, true);
      this.sendError(ws, 'No trigger configured');
      return;
    }

    const triggeredConfigId = parentConfig.trigger.configId;
    const preserveSession = parentConfig.trigger.preserveSession || false;

    // Get the triggered configuration
    const triggeredConfig = this.configManager.getConfigById(triggeredConfigId);
    if (!triggeredConfig) {
      this.log(`Triggered configuration not found: ${triggeredConfigId}`, true);
      this.sendError(ws, `Triggered configuration not found: ${triggeredConfigId}`);
      return;
    }

    this.log(`Executing triggered configuration: ${triggeredConfig.id} (${triggeredConfig.name})`);
    this.sendOutput(ws, `\nStarting execution of triggered configuration: ${triggeredConfig.name}\n`);

    // Prepare prompts for the triggered config
    const promptFiles = [];
    try {
      for (let i = 0; i < triggeredConfig.prompts.length; i++) {
        const promptPath = await this.configManager.savePromptToFile(
          triggeredConfig.id,
          triggeredConfig.prompts[i],
          i,
          this.promptsDir
        );
        promptFiles.push(promptPath);
        this.log(`Saved prompt ${i+1} to: ${promptPath}`);
      }
    } catch (error) {
      this.log(`Error preparing prompts for triggered config: ${error.message}`, true);
      this.sendError(ws, `Failed to prepare prompts for triggered config: ${error.message}`);
      return;
    }

    // Create a new execution ID for the triggered config
    const triggeredExecutionId = `${triggeredConfig.id}-${Date.now()}`;
    this.activeExecutions.set(triggeredExecutionId, {
      config: triggeredConfig,
      promptFiles,
      isTriggered: true,
      parentExecutionId
    });
    this.log(`Created triggered execution with ID: ${triggeredExecutionId}`);

    // Set up options for execution
    const options = {
      parentExecutionId
    };

    // If preserving session, pass the parent session name
    if (preserveSession) {
      options.sessionName = `maistro-${parentConfig.id}`;
      this.log(`Using parent session for triggered execution: ${options.sessionName}`);
      this.sendOutput(ws, `Using shared session for triggered configuration\n`);
    }

    // Execute the prompted sequence
    try {
      await this.executePromptSequence(triggeredExecutionId, ws, 0, options);
      this.log(`Triggered execution completed: ${triggeredExecutionId}`);
    } catch (error) {
      this.log(`Error in triggered execution: ${error.message}`, true);
      this.sendError(ws, `Error in triggered execution: ${error.message}`);
    }
  }
  
  /**
   * Execute a cleanup command (simpler version of executeCommand that doesn't stream output)
   * @param {string} command - Command to execute
   * @param {Array} args - Command arguments
   * @param {WebSocket} ws - WebSocket connection (optional)
   */
  executeCleanupCommand(command, args, ws = null) {
    return new Promise((resolve, reject) => {
      try {
        // Prepare command string
        const cmdArgs = args.map(arg => {
          if (arg.includes(' ')) {
            return `"${arg.replace(/"/g, '\\"')}"`;
          }
          return arg;
        });
        
        const fullCommand = `${command} ${cmdArgs.join(' ')}`;
        this.log(`Cleanup command: ${fullCommand}`);
        
        // Use silent option to prevent output clutter
        const childProcess = spawn(fullCommand, [], {
          shell: '/bin/bash',
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let output = '';
        let errorOutput = '';
        
        childProcess.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        childProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
        
        childProcess.on('close', (code) => {
          if (code !== 0) {
            this.log(`Cleanup command exited with code ${code}: ${errorOutput}`, true);
            // Don't reject for cleanup commands - allow the process to continue
            resolve();
          } else {
            this.log(`Cleanup command completed successfully: ${output.trim()}`);
            resolve();
          }
        });
        
        childProcess.on('error', (error) => {
          this.log(`Cleanup command error: ${error.message}`, true);
          // Don't reject for cleanup commands
          resolve();
        });
      } catch (error) {
        this.log(`Failed to spawn cleanup process: ${error.message}`, true);
        // Don't reject for cleanup commands
        resolve();
      }
    });
  }
}

module.exports = ExecutionManager;
