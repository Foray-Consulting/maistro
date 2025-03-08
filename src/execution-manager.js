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
   * @param {string} dataDir - Data directory path
   */
  constructor(configManager, dataDir) {
    this.configManager = configManager;
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
   * Execute a sequence of prompts
   * @param {string} executionId - Execution ID
   * @param {WebSocket} ws - WebSocket connection
   * @param {number} currentIndex - Current prompt index
   */
  async executePromptSequence(executionId, ws, currentIndex = 0) {
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
      this.sendMessage(ws, 'end', { message: 'All prompts completed' });
      this.activeExecutions.delete(executionId);
      return;
    }

    const promptFile = promptFiles[currentIndex];
    const isFirstPrompt = currentIndex === 0;
    const sessionName = `maistro-${config.id}`;

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

      // Before starting a new session, attempt to delete any existing session file
      if (isFirstPrompt) {
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
        
        // First prompt: start a new session (with clean session now)
        args = ['run', '--name', sessionName, '--instructions', absolutePromptPath];
      } else {
        // Subsequent prompts: resume existing session
        args = ['run', '--resume', '--name', sessionName, '--instructions', absolutePromptPath];
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
        setTimeout(() => {
          this.executePromptSequence(executionId, ws, currentIndex + 1);
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
        
        // Send initial command notification to client
        this.sendOutput(ws, `Executing command: ${fullCommand}\n`);
        
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
  sendOutput(ws, content) {
    if (!content) return;
    
    // Ensure the content is a string
    const contentStr = String(content);
    
    // Only send if we have a valid WebSocket connection
    if (ws && ws.readyState === 1) {
      try {
        // Log output size being sent (for debugging)
        this.log(`Sending output of size ${contentStr.length} bytes`);
        
        // Send the output
        ws.send(JSON.stringify({
          type: 'output',
          content: contentStr
        }));
      } catch (error) {
        this.log(`Error sending output: ${error.message}`, true);
      }
    } else if (!ws) {
      this.log('Cannot send output: WebSocket connection is null', true);
    } else if (ws.readyState !== 1) {
      this.log(`Cannot send output: WebSocket connection is in state ${ws.readyState}`, true);
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
      ws.send(JSON.stringify({
        type,
        ...data
      }));
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
