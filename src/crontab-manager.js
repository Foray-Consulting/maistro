const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const cron = require('node-cron');
const path = require('path');

/**
 * Manages crontab entries for scheduled executions
 */
class CrontabManager {
  /**
   * Constructor
   * @param {ConfigManager} configManager - Config manager instance
   * @param {ExecutionManager} executionManager - Execution manager instance
   */
  constructor(configManager, executionManager) {
    this.configManager = configManager;
    this.executionManager = executionManager;
    this.activeJobs = new Map();
  }

  /**
   * Initialize cron jobs from existing configurations
   */
  async initializeCronJobs() {
    const configs = this.configManager.getAllConfigs();
    
    for (const config of configs) {
      if (config.schedule && config.schedule.enabled) {
        await this.updateCronJob(config);
      }
    }
  }

  /**
   * Update or create a cron job for a configuration
   * @param {Object} config - Configuration object
   */
  async updateCronJob(config) {
    // Remove existing job if any
    await this.removeCronJob(config.id);
    
    if (!config.schedule || !config.schedule.enabled) {
      return;
    }
    
    // Convert schedule to cron expression
    const cronExpression = this.scheduleToCronExpression(config.schedule);
    if (!cronExpression) {
      console.error(`Invalid schedule for config ${config.id}`);
      return;
    }
    
    try {
      // Create node-cron job (for in-process scheduling)
      const job = cron.schedule(cronExpression, () => {
        console.log(`Executing scheduled config: ${config.name} (${config.id})`);
        this.executionManager.executeConfig(config);
      });
      
      this.activeJobs.set(config.id, job);
      
      // Also add to system crontab as a backup
      await this.addToSystemCrontab(config, cronExpression);
      
      console.log(`Scheduled job for ${config.name} with cron: ${cronExpression}`);
    } catch (error) {
      console.error(`Error scheduling job for ${config.id}:`, error);
    }
  }

  /**
   * Remove a cron job
   * @param {string} configId - Configuration ID
   */
  async removeCronJob(configId) {
    // Stop node-cron job if active
    const job = this.activeJobs.get(configId);
    if (job) {
      job.stop();
      this.activeJobs.delete(configId);
    }
    
    // Remove from system crontab
    await this.removeFromSystemCrontab(configId);
  }

  /**
   * Convert schedule object to cron expression
   * @param {Object} schedule - Schedule configuration
   * @returns {string|null} - Cron expression or null if invalid
   */
  scheduleToCronExpression(schedule) {
    if (!schedule || !schedule.time) {
      return null;
    }
    
    // Parse time (HH:MM)
    const [hours, minutes] = schedule.time.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) {
      return null;
    }
    
    // Build cron expression based on frequency
    switch (schedule.frequency) {
      case 'daily':
        return `${minutes} ${hours} * * *`;
        
      case 'weekly':
        if (!schedule.days || schedule.days.length === 0) {
          return null;
        }
        
        const dayMap = {
          'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6, 'sun': 0
        };
        
        const daysList = schedule.days
          .map(day => dayMap[day])
          .filter(day => day !== undefined)
          .join(',');
          
        return `${minutes} ${hours} * * ${daysList}`;
        
      case 'monthly':
        const day = schedule.dayOfMonth || 1;
        return `${minutes} ${hours} ${day} * *`;
        
      default:
        return null;
    }
  }

  /**
   * Add a job to the system crontab
   * @param {Object} config - Configuration
   * @param {string} cronExpression - Cron expression
   */
  async addToSystemCrontab(config, cronExpression) {
    try {
      // Get current crontab
      const { stdout: currentCrontab } = await execPromise('crontab -l 2>/dev/null || echo ""');
      
      // Create command to execute
      const serverPath = path.resolve(__dirname, '../src/server.js');
      const command = `NODE_ENV=production node ${serverPath} execute-config ${config.id}`;
      
      // Create comment to identify this entry
      const comment = `# Maistro - ${config.name} (${config.id})`;
      
      // Remove any existing entries for this config
      let lines = currentCrontab.split('\n');
      lines = lines.filter(line => !line.includes(`(${config.id})`));
      
      // Add new entry
      lines.push(comment);
      lines.push(`${cronExpression} ${command}`);
      
      // Write back to crontab
      const newCrontab = lines.join('\n').trim() + '\n';
      
      // Create a temporary file with the new crontab content
      const tempFile = path.join('/tmp', `maistro-crontab-${Date.now()}`);
      await execPromise(`echo "${newCrontab}" > ${tempFile}`);
      
      // Install the new crontab
      await execPromise(`crontab ${tempFile}`);
      
      // Clean up
      await execPromise(`rm ${tempFile}`);
    } catch (error) {
      console.error('Error updating system crontab:', error);
    }
  }

  /**
   * Remove a job from the system crontab
   * @param {string} configId - Configuration ID
   */
  async removeFromSystemCrontab(configId) {
    try {
      // Get current crontab
      const { stdout: currentCrontab } = await execPromise('crontab -l 2>/dev/null || echo ""');
      
      // Remove any existing entries for this config
      let lines = currentCrontab.split('\n');
      let i = 0;
      
      // We need to check each line - if it's a comment with our config ID, 
      // we remove both the comment line and the following cron line
      while (i < lines.length) {
        if (lines[i].includes(`(${configId})`)) {
          // If this is a comment line for our config, remove it
          lines.splice(i, 1);
          
          // If there's a line after this (which should be the cron command), 
          // remove that too
          if (i < lines.length) {
            lines.splice(i, 1);
          }
        } else {
          i++;
        }
      }
      
      // Write back to crontab
      const newCrontab = lines.join('\n').trim() + '\n';
      
      // Create a temporary file with the new crontab content
      const tempFile = path.join('/tmp', `maistro-crontab-${Date.now()}`);
      await execPromise(`echo "${newCrontab}" > ${tempFile}`);
      
      // Install the new crontab
      await execPromise(`crontab ${tempFile}`);
      
      // Clean up
      await execPromise(`rm ${tempFile}`);
    } catch (error) {
      console.error('Error updating system crontab:', error);
    }
  }
}

module.exports = CrontabManager;
