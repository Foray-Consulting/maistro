// Global state
let configs = [];
let activeConfigId = null;
let editingConfig = null;
let socket = null;
let hasUnsavedChanges = false;

// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
    // Event listeners
    document.getElementById('createConfigBtn').addEventListener('click', createNewConfig);
    document.getElementById('saveConfigBtn').addEventListener('click', saveConfig);
    document.getElementById('cancelConfigBtn').addEventListener('click', cancelConfigEdit);
    document.getElementById('addPromptBtn').addEventListener('click', addPrompt);
    document.getElementById('scheduleEnabled').addEventListener('change', toggleScheduleOptions);
    document.getElementById('scheduleFrequency').addEventListener('change', updateScheduleFields);
    document.getElementById('runConfigBtn').addEventListener('click', runConfig);
    document.getElementById('clearOutputBtn').addEventListener('click', clearOutput);
    
    // Initialize
    loadConfigs();
    initializeScheduleDays();
});

// Configuration management
function loadConfigs() {
    fetch('/api/configs')
        .then(response => response.json())
        .then(data => {
            configs = data;
            renderConfigsList();
        })
        .catch(error => {
            console.error('Error loading configurations:', error);
        });
}

function renderConfigsList() {
    const container = document.getElementById('configsList');
    container.innerHTML = '';
    
    if (configs.length === 0) {
        container.innerHTML = '<div class="empty-state">No configurations yet</div>';
        return;
    }
    
    configs.forEach(config => {
        const configElement = document.createElement('div');
        configElement.className = `config-item ${config.id === activeConfigId ? 'active' : ''}`;
        configElement.dataset.id = config.id;
        
        let scheduleInfo = 'Not scheduled';
        if (config.schedule && config.schedule.enabled) {
            scheduleInfo = getScheduleDisplayText(config.schedule);
        }
        
        configElement.innerHTML = `
            <div class="config-item-header">
                <strong>${config.name}</strong>
                <div class="config-actions">
                    <button class="icon-btn edit-config" title="Edit">✏️</button>
                    <button class="icon-btn danger delete-config" title="Delete">🗑️</button>
                </div>
            </div>
            <div class="config-scheduled">${scheduleInfo}</div>
        `;
        
        configElement.addEventListener('click', (e) => {
            if (!e.target.closest('.config-actions')) {
                selectConfig(config.id);
            }
        });
        
        container.appendChild(configElement);
    });
    
    // Add event listeners for action buttons
    document.querySelectorAll('.edit-config').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const configId = e.target.closest('.config-item').dataset.id;
            editConfig(configId);
            e.stopPropagation();
        });
    });
    
    document.querySelectorAll('.delete-config').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const configId = e.target.closest('.config-item').dataset.id;
            deleteConfig(configId);
            e.stopPropagation();
        });
    });
}

function selectConfig(configId) {
    activeConfigId = configId;
    
    // Update UI
    document.querySelectorAll('.config-item').forEach(item => {
        item.classList.toggle('active', item.dataset.id === configId);
    });
    
    const config = configs.find(c => c.id === configId);
    if (!config) return;
    
    // Show both edit form and execution panel
    document.getElementById('configForm').classList.remove('hidden');
    document.getElementById('executionPanel').classList.remove('hidden');
    
    // Update config form
    editingConfig = { ...config };
    
    document.getElementById('configFormTitle').textContent = config.name;
    document.getElementById('configStatus').textContent = 'Saved';
    document.getElementById('configStatus').className = 'status-indicator saved';
    
    document.getElementById('configName').value = config.name;
    renderPromptsList(config.prompts);
    document.getElementById('scheduleEnabled').checked = config.schedule?.enabled || false;
    toggleScheduleOptions();
    
    if (config.schedule) {
        document.getElementById('scheduleFrequency').value = config.schedule.frequency || 'daily';
        document.getElementById('scheduleTime').value = config.schedule.time || '09:00';
        
        if (config.schedule.days) {
            document.querySelectorAll('.day-checkbox').forEach(checkbox => {
                const day = checkbox.id.replace('day-', '');
                checkbox.checked = config.schedule.days.includes(day);
            });
        }
        
        if (config.schedule.dayOfMonth) {
            document.getElementById('scheduleDay').value = config.schedule.dayOfMonth;
        }
    }
    
    updateScheduleFields();
    
    // Update execution panel
    document.getElementById('executionTitle').textContent = `Run: ${config.name}`;
    
    // Add event listeners for form changes to track unsaved changes
    setupFormChangeTracking();
}

function setupFormChangeTracking() {
    hasUnsavedChanges = false;
    
    // Track form field changes
    document.getElementById('configName').addEventListener('input', markAsUnsaved);
    document.getElementById('scheduleEnabled').addEventListener('change', markAsUnsaved);
    document.getElementById('scheduleFrequency').addEventListener('change', markAsUnsaved);
    document.getElementById('scheduleTime').addEventListener('change', markAsUnsaved);
    document.querySelectorAll('.day-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', markAsUnsaved);
    });
    document.getElementById('scheduleDay').addEventListener('change', markAsUnsaved);
}

function markAsUnsaved() {
    if (!hasUnsavedChanges && editingConfig) {
        hasUnsavedChanges = true;
        document.getElementById('configStatus').textContent = 'Unsaved';
        document.getElementById('configStatus').className = 'status-indicator unsaved';
    }
}

function createNewConfig() {
    activeConfigId = null;
    editingConfig = {
        id: generateId(),
        name: '',
        prompts: [],
        schedule: {
            enabled: false,
            frequency: 'daily',
            time: '09:00'
        }
    };
    
    document.getElementById('configFormTitle').textContent = 'New Configuration';
    document.getElementById('configStatus').textContent = 'Unsaved';
    document.getElementById('configStatus').className = 'status-indicator unsaved';
    
    document.getElementById('configName').value = '';
    renderPromptsList([]);
    document.getElementById('scheduleEnabled').checked = false;
    document.getElementById('scheduleConfig').classList.add('hidden');
    document.getElementById('scheduleFrequency').value = 'daily';
    document.getElementById('scheduleTime').value = '09:00';
    updateScheduleFields();
    
    // Show form, hide execution panel
    document.getElementById('configForm').classList.remove('hidden');
    document.getElementById('executionPanel').classList.add('hidden');
    
    // Set up form change tracking
    setupFormChangeTracking();
}

function editConfig(configId) {
    selectConfig(configId);
}

function saveConfig() {
    const name = document.getElementById('configName').value.trim();
    if (!name) {
        alert('Please enter a configuration name');
        return;
    }
    
    if (editingConfig.prompts.length === 0) {
        alert('Please add at least one prompt');
        return;
    }
    
    editingConfig.name = name;
    
    // Gather schedule data
    const scheduleEnabled = document.getElementById('scheduleEnabled').checked;
    const scheduleFrequency = document.getElementById('scheduleFrequency').value;
    const scheduleTime = document.getElementById('scheduleTime').value;
    
    editingConfig.schedule = {
        enabled: scheduleEnabled,
        frequency: scheduleFrequency,
        time: scheduleTime
    };
    
    if (scheduleEnabled) {
        if (scheduleFrequency === 'weekly') {
            const selectedDays = [];
            document.querySelectorAll('.day-checkbox:checked').forEach(checkbox => {
                selectedDays.push(checkbox.id.replace('day-', ''));
            });
            
            if (selectedDays.length === 0) {
                alert('Please select at least one day of the week');
                return;
            }
            
            editingConfig.schedule.days = selectedDays;
        } else if (scheduleFrequency === 'monthly') {
            editingConfig.schedule.dayOfMonth = document.getElementById('scheduleDay').value;
        }
    }
    
    // Save to server
    fetch('/api/configs', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(editingConfig)
    })
    .then(response => response.json())
    .then(data => {
        // Update local data
        const existingIndex = configs.findIndex(c => c.id === editingConfig.id);
        if (existingIndex >= 0) {
            configs[existingIndex] = editingConfig;
        } else {
            configs.push(editingConfig);
        }
        
        // Update UI
        renderConfigsList();
        
        // Set status to saved
        hasUnsavedChanges = false;
        document.getElementById('configStatus').textContent = 'Saved';
        document.getElementById('configStatus').className = 'status-indicator saved';
        
        // Keep the same config selected 
        activeConfigId = editingConfig.id;
        
        // Enable execution panel
        document.getElementById('executionTitle').textContent = `Run: ${editingConfig.name}`;
        document.getElementById('executionPanel').classList.remove('hidden');
    })
    .catch(error => {
        console.error('Error saving configuration:', error);
        alert('Failed to save configuration');
    });
}

function cancelConfigEdit() {
    if (hasUnsavedChanges) {
        if (!confirm('You have unsaved changes. Are you sure you want to cancel?')) {
            return;
        }
    }
    
    // If we're editing an existing config, reload it
    if (activeConfigId) {
        selectConfig(activeConfigId);
    } else {
        // Otherwise, just hide the form
        document.getElementById('configForm').classList.add('hidden');
    }
    
    hasUnsavedChanges = false;
}

function deleteConfig(configId) {
    if (!confirm('Are you sure you want to delete this configuration?')) {
        return;
    }
    
    fetch(`/api/configs/${configId}`, {
        method: 'DELETE'
    })
    .then(response => {
        if (response.ok) {
            configs = configs.filter(c => c.id !== configId);
            
            if (activeConfigId === configId) {
                activeConfigId = null;
                document.getElementById('configForm').classList.add('hidden');
                document.getElementById('executionPanel').classList.add('hidden');
            }
            
            renderConfigsList();
        } else {
            alert('Failed to delete configuration');
        }
    })
    .catch(error => {
        console.error('Error deleting configuration:', error);
        alert('Failed to delete configuration');
    });
}

// Prompt management
function renderPromptsList(prompts) {
    const container = document.getElementById('promptsList');
    container.innerHTML = '';
    
    if (!prompts || prompts.length === 0) {
        return;
    }
    
    prompts.forEach((prompt, index) => {
        const promptElement = document.createElement('div');
        promptElement.className = 'prompt-item';
        promptElement.innerHTML = `
            <div class="prompt-content">
                <input type="text" class="prompt-text" value="${escapeHtml(prompt)}" placeholder="Enter prompt text">
            </div>
            <div class="prompt-tools">
                ${index > 0 ? '<button class="icon-btn move-up" title="Move Up">⬆️</button>' : ''}
                ${index < prompts.length - 1 ? '<button class="icon-btn move-down" title="Move Down">⬇️</button>' : ''}
                <button class="icon-btn danger remove-prompt" title="Remove">✖️</button>
            </div>
        `;
        
        container.appendChild(promptElement);
    });
    
    // Add event listeners
    document.querySelectorAll('.prompt-text').forEach((input, index) => {
        input.addEventListener('input', () => {
            editingConfig.prompts[index] = input.value;
            markAsUnsaved();
        });
    });
    
    document.querySelectorAll('.move-up').forEach((btn, index) => {
        btn.addEventListener('click', () => movePrompt(index, 'up'));
    });
    
    document.querySelectorAll('.move-down').forEach((btn, index) => {
        btn.addEventListener('click', () => movePrompt(index, 'down'));
    });
    
    document.querySelectorAll('.remove-prompt').forEach((btn, index) => {
        btn.addEventListener('click', () => removePrompt(index));
    });
}

function addPrompt() {
    if (!editingConfig) return;
    
    editingConfig.prompts.push('');
    renderPromptsList(editingConfig.prompts);
    markAsUnsaved();
    
    // Focus the new input
    const inputs = document.querySelectorAll('.prompt-text');
    const lastInput = inputs[inputs.length - 1];
    if (lastInput) {
        lastInput.focus();
    }
}

function movePrompt(index, direction) {
    if (!editingConfig) return;
    
    if (direction === 'up' && index > 0) {
        const temp = editingConfig.prompts[index];
        editingConfig.prompts[index] = editingConfig.prompts[index - 1];
        editingConfig.prompts[index - 1] = temp;
    } else if (direction === 'down' && index < editingConfig.prompts.length - 1) {
        const temp = editingConfig.prompts[index];
        editingConfig.prompts[index] = editingConfig.prompts[index + 1];
        editingConfig.prompts[index + 1] = temp;
    }
    
    renderPromptsList(editingConfig.prompts);
    markAsUnsaved();
}

function removePrompt(index) {
    if (!editingConfig) return;
    
    editingConfig.prompts.splice(index, 1);
    renderPromptsList(editingConfig.prompts);
    markAsUnsaved();
}

// Schedule management
function toggleScheduleOptions() {
    const enabled = document.getElementById('scheduleEnabled').checked;
    document.getElementById('scheduleConfig').classList.toggle('hidden', !enabled);
    
    if (editingConfig) {
        editingConfig.schedule.enabled = enabled;
    }
}

function updateScheduleFields() {
    const frequency = document.getElementById('scheduleFrequency').value;
    
    document.getElementById('scheduleDays').classList.toggle('hidden', frequency !== 'weekly');
    document.getElementById('scheduleDate').classList.toggle('hidden', frequency !== 'monthly');
    
    if (editingConfig) {
        editingConfig.schedule.frequency = frequency;
    }
}

function initializeScheduleDays() {
    const scheduleDay = document.getElementById('scheduleDay');
    scheduleDay.innerHTML = '';
    
    for (let i = 1; i <= 31; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        scheduleDay.appendChild(option);
    }
}

function getScheduleDisplayText(schedule) {
    if (!schedule || !schedule.enabled) {
        return 'Not scheduled';
    }
    
    let text = '';
    
    switch (schedule.frequency) {
        case 'daily':
            text = `Daily at ${schedule.time}`;
            break;
        case 'weekly':
            if (schedule.days && schedule.days.length > 0) {
                const dayNames = schedule.days.map(d => {
                    const dayMap = {
                        'mon': 'Monday',
                        'tue': 'Tuesday',
                        'wed': 'Wednesday',
                        'thu': 'Thursday',
                        'fri': 'Friday',
                        'sat': 'Saturday',
                        'sun': 'Sunday'
                    };
                    return dayMap[d] || d;
                });
                
                if (dayNames.length === 7) {
                    text = `Every day at ${schedule.time}`;
                } else {
                    text = `Every ${dayNames.join(', ')} at ${schedule.time}`;
                }
            } else {
                text = `Weekly at ${schedule.time}`;
            }
            break;
        case 'monthly':
            const day = schedule.dayOfMonth || 1;
            text = `Monthly on day ${day} at ${schedule.time}`;
            break;
    }
    
    return text;
}

// Execution
function runConfig() {
    if (!activeConfigId) return;
    
    const config = configs.find(c => c.id === activeConfigId);
    if (!config) return;
    
    // Clear previous output
    clearOutput();
    
    // Disable the run button during execution
    const runBtn = document.getElementById('runConfigBtn');
    runBtn.disabled = true;
    runBtn.textContent = 'Running...';
    
    // Connect to WebSocket for real-time output
    connectSocket(activeConfigId);
    
    // Trigger execution
    fetch(`/api/run/${activeConfigId}`, {
        method: 'POST'
    })
    .catch(error => {
        console.error('Error starting execution:', error);
        appendOutput('Error starting execution: ' + error.message, 'error');
        runBtn.disabled = false;
        runBtn.textContent = 'Run Now';
    });
}

/**
 * Update connection status indicator
 * @param {string} status - Status type: 'offline', 'connecting', 'connected', 'active'
 * @param {string} [text] - Optional text to display (defaults to status name)
 */
function updateConnectionStatus(status, text) {
    const statusElement = document.getElementById('connectionStatus');
    
    // Remove all status classes
    statusElement.classList.remove('offline', 'connecting', 'connected', 'active');
    
    // Add the new status class
    statusElement.classList.add(status);
    
    // Set the text
    statusElement.textContent = text || status.charAt(0).toUpperCase() + status.slice(1);
}

// Track when the last message was received to show animation
let lastMessageTime = 0;
let statusCheckInterval = null;

function connectSocket(configId) {
    // Close existing socket if any
    if (socket) {
        socket.close();
    }
    
    // Update status to connecting
    updateConnectionStatus('connecting', 'Connecting...');
    
    // Create new socket
    socket = new WebSocket(`ws://${window.location.host}/ws/execution/${configId}`);
    
    // Set timeout for connection
    const connectionTimeout = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
            console.error('WebSocket connection timeout');
            updateConnectionStatus('offline', 'Connection failed');
            appendOutput('Connection timeout. Please try again.\n', 'error');
        }
    }, 5000);
    
    socket.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log('WebSocket connected');
        updateConnectionStatus('connected');
        appendOutput('Connected, waiting for execution to start...\n', 'info');
        
        // Start checking for activity
        if (statusCheckInterval) {
            clearInterval(statusCheckInterval);
        }
        
        statusCheckInterval = setInterval(() => {
            // If we've received a message in the last 2 seconds, show "active"
            const now = Date.now();
            if (now - lastMessageTime < 2000) {
                updateConnectionStatus('active', 'Receiving data...');
            } else {
                updateConnectionStatus('connected');
            }
        }, 1000);
    };
    
    socket.onmessage = (event) => {
        // Update last message time
        lastMessageTime = Date.now();
        
        try {
            console.log('WebSocket message received of length:', event.data.length);
            // Show first 200 chars in console for debugging
            if (event.data.length > 0) {
                console.log('Message preview:', event.data.substring(0, 200) + 
                    (event.data.length > 200 ? '...' : ''));
            }
            
            const data = JSON.parse(event.data);
            
            // Log message type for debugging
            console.log('Message type:', data.type);
            
            // Handle message based on type
            if (data.type === 'connection') {
                // This is the initial connection confirmation
                console.log('Connection confirmed:', data.message);
            } else if (data.type === 'output') {
                // For output type, specifically log the content length
                console.log('Output content length:', data.content?.length || 0);
                if (data.content && data.content.trim().length > 0) {
                    appendOutput(data.content);
                }
            } else if (data.type === 'start') {
                appendOutput(`Starting prompt ${data.promptIndex + 1}/${data.totalPrompts}: ${data.prompt}\n`, 'info');
            } else if (data.type === 'complete') {
                appendOutput('\nPrompt completed\n', 'success');
            } else if (data.type === 'error') {
                appendOutput('\nError: ' + data.message + '\n', 'error');
            } else if (data.type === 'end') {
                appendOutput('\nExecution completed\n', 'success');
                
                // Re-enable run button
                const runBtn = document.getElementById('runConfigBtn');
                runBtn.disabled = false;
                runBtn.textContent = 'Run Now';
                
                // Close socket
                socket.close();
            }
        } catch (error) {
            console.error('Error processing WebSocket message:', error);
            console.error('Raw message data:', event.data);
            appendOutput('Error processing output: ' + error.message, 'error');
        }
    };
    
    socket.onerror = (error) => {
        clearTimeout(connectionTimeout);
        console.error('WebSocket error:', error);
        updateConnectionStatus('offline', 'Connection error');
        appendOutput('WebSocket error: Connection failed', 'error');
    };
    
    socket.onclose = () => {
        clearTimeout(connectionTimeout);
        console.log('WebSocket closed');
        updateConnectionStatus('offline', 'Disconnected');
        
        // Clear the status check interval
        if (statusCheckInterval) {
            clearInterval(statusCheckInterval);
            statusCheckInterval = null;
        }
    };
}

/**
 * Parse ANSI escape sequences and convert to HTML classes
 * @param {string} text - The text containing ANSI escape sequences
 * @return {string} - HTML with classes representing the ANSI codes
 */
function parseAnsiEscapeCodes(text) {
    if (!text) return '';
    
    // Replace ANSI color codes with placeholder markers
    // This is a simplified version - a full implementation would handle more codes
    let result = text
        // Remove carriage returns to prevent line overwriting issues
        .replace(/\r/g, '')
        // Replace color codes with markers
        .replace(/\u001b\[(\d+)m/g, (match, p1) => {
            const code = parseInt(p1);
            // Map ANSI codes to color classes
            if (code === 0) return '</span>'; // Reset
            if (code === 31) return '<span class="ansi-red">'; // Red
            if (code === 32) return '<span class="ansi-green">'; // Green
            if (code === 33) return '<span class="ansi-yellow">'; // Yellow
            if (code === 34) return '<span class="ansi-blue">'; // Blue
            if (code === 35) return '<span class="ansi-magenta">'; // Magenta
            if (code === 36) return '<span class="ansi-cyan">'; // Cyan
            if (code === 37) return '<span class="ansi-white">'; // White
            return ''; // Unknown codes are removed
        });
    
    // Close any unclosed spans
    if (result.includes('<span') && !result.endsWith('</span>')) {
        result += '</span>';
    }
    
    return result;
}

function appendOutput(text, className = '') {
    const outputDisplay = document.getElementById('outputDisplay');
    
    if (!text) return;
    
    // Create a pre element to preserve whitespace and line breaks
    const pre = document.createElement('pre');
    pre.style.margin = '0';
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.wordBreak = 'break-word';
    
    if (className) {
        pre.className = className;
    }
    
    // Handle ANSI escape codes
    const ansiConverted = parseAnsiEscapeCodes(text);
    
    // For safety, if the ANSI parsing returns empty, use the original text
    if (!ansiConverted || ansiConverted.trim() === '') {
        pre.textContent = text;
    } else {
        // Set HTML content with ANSI parsed as classes
        pre.innerHTML = ansiConverted;
    }
    
    // Append the output and scroll to the bottom
    outputDisplay.appendChild(pre);
    outputDisplay.scrollTop = outputDisplay.scrollHeight;
    
    // Debug output (limited length for console)
    console.log('Appended output:', 
        text.substring(0, 100) + (text.length > 100 ? '...' : ''));
}

function clearOutput() {
    document.getElementById('outputDisplay').innerHTML = '';
}

// Utilities
function generateId() {
    return 'config-' + Date.now().toString();
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
