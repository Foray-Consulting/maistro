// Global state
let configs = [];
let activeConfigId = null;
let editingConfig = null;
let socket = null;
let hasUnsavedChanges = false;

// MCP Server state
let mcpServers = [];
let activeMCPServerId = null;
let editingMCPServer = null;
let hasMCPServerUnsavedChanges = false;

// Model state
let modelConfig = {
    defaultModel: 'anthropic/claude-3.7-sonnet',
    availableModels: [
        'anthropic/claude-3.7-sonnet:thinking',
        'anthropic/claude-3.7-sonnet',
        'openai/o3-mini-high',
        'openai/gpt-4o-2024-11-20'
    ],
    apiKey: ''
};

// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
    // Config event listeners
    document.getElementById('createConfigBtn').addEventListener('click', createNewConfig);
    document.getElementById('saveConfigBtn').addEventListener('click', saveConfig);
    document.getElementById('cancelConfigBtn').addEventListener('click', cancelConfigEdit);
    document.getElementById('addPromptBtn').addEventListener('click', addPrompt);
    document.getElementById('scheduleEnabled').addEventListener('change', toggleScheduleOptions);
    document.getElementById('scheduleFrequency').addEventListener('change', updateScheduleFields);
    document.getElementById('runConfigBtn').addEventListener('click', runConfig);
    document.getElementById('clearOutputBtn').addEventListener('click', clearOutput);
    
    // MCP Server event listeners
    document.getElementById('createMCPServerBtn').addEventListener('click', createNewMCPServer);
    document.getElementById('saveMCPServerBtn').addEventListener('click', saveMCPServer);
    document.getElementById('cancelMCPServerBtn').addEventListener('click', cancelMCPServerEdit);
    document.getElementById('addEnvVarBtn').addEventListener('click', addEnvVar);
    
    // Navigation event listeners
    document.getElementById('navConfigsBtn').addEventListener('click', () => switchSection('configs'));
    document.getElementById('navMCPServersBtn').addEventListener('click', () => switchSection('mcpServers'));
    document.getElementById('navModelsBtn').addEventListener('click', () => switchSection('models'));
    
    // Model event listeners
    document.getElementById('saveApiKeyBtn').addEventListener('click', saveApiKey);
    document.getElementById('saveDefaultModelBtn').addEventListener('click', saveDefaultModel);
    document.getElementById('addModelBtn').addEventListener('click', addModel);
    
    // Initialize
    loadConfigs();
    loadMCPServers();
    initializeScheduleDays();
});

// Navigation
function switchSection(section) {
    // Hide all sections
    document.getElementById('configsSection').classList.add('hidden');
    document.getElementById('mcpServersSection').classList.add('hidden');
    document.getElementById('modelsSection').classList.add('hidden');
    
    // Deactivate all nav buttons
    document.getElementById('navConfigsBtn').classList.remove('active');
    document.getElementById('navMCPServersBtn').classList.remove('active');
    document.getElementById('navModelsBtn').classList.remove('active');
    
    // Show the requested section
    if (section === 'configs') {
        document.getElementById('configsSection').classList.remove('hidden');
        document.getElementById('navConfigsBtn').classList.add('active');
    } else if (section === 'mcpServers') {
        document.getElementById('mcpServersSection').classList.remove('hidden');
        document.getElementById('navMCPServersBtn').classList.add('active');
    } else if (section === 'models') {
        document.getElementById('modelsSection').classList.remove('hidden');
        document.getElementById('navModelsBtn').classList.add('active');
        loadModels();
    }
}

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
        
    // Also load models for prompt selections
    loadModels();
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
    
    // Update config form with backward compatibility for prompts
    editingConfig = ensurePromptObjects({ ...config });
    
    document.getElementById('configFormTitle').textContent = config.name;
    document.getElementById('configStatus').textContent = 'Saved';
    document.getElementById('configStatus').className = 'status-indicator saved';
    
    document.getElementById('configName').value = config.name;
    renderPromptsList(editingConfig.prompts);
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
        // Convert string prompts to objects if necessary
        const promptObj = typeof prompt === 'string' 
            ? { text: prompt, mcpServerIds: [], model: null } 
            : prompt;
        
        // Ensure editingConfig.prompts has the object version
        if (typeof editingConfig.prompts[index] === 'string') {
            editingConfig.prompts[index] = promptObj;
        }
        
        const promptElement = document.createElement('div');
        promptElement.className = 'prompt-item';
        
        // Create a dropdown of available models
        let modelDropdown = '<select class="prompt-model">';
        modelDropdown += '<option value="">Use Default Model</option>';
        
        modelConfig.availableModels.forEach(model => {
            const selected = promptObj.model === model ? 'selected' : '';
            modelDropdown += `<option value="${escapeHtml(model)}" ${selected}>${escapeHtml(model)}</option>`;
        });
        
        modelDropdown += '</select>';
        
        promptElement.innerHTML = `
            <div class="prompt-content">
                <div class="prompt-editor">
                    <textarea class="prompt-text" placeholder="Enter prompt text">${escapeHtml(promptObj.text)}</textarea>
                    <div class="prompt-options">
                        <button class="btn small select-mcp-servers">MCP Servers: ${promptObj.mcpServerIds?.length || 0} enabled</button>
                        <div class="model-selector">
                            <label>Model:</label>
                            ${modelDropdown}
                        </div>
                    </div>
                </div>
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
            if (typeof editingConfig.prompts[index] === 'string') {
                editingConfig.prompts[index] = { 
                    text: input.value, 
                    mcpServerIds: [],
                    model: null
                };
            } else {
                editingConfig.prompts[index].text = input.value;
            }
            markAsUnsaved();
        });
    });
    
    document.querySelectorAll('.select-mcp-servers').forEach((btn, index) => {
        btn.addEventListener('click', () => showMCPServerSelector(index));
    });
    
    document.querySelectorAll('.prompt-model').forEach((select, index) => {
        select.addEventListener('change', () => {
            if (typeof editingConfig.prompts[index] === 'string') {
                editingConfig.prompts[index] = { 
                    text: editingConfig.prompts[index], 
                    mcpServerIds: [],
                    model: select.value || null
                };
            } else {
                editingConfig.prompts[index].model = select.value || null;
            }
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

function showMCPServerSelector(promptIndex) {
    if (!editingConfig || !mcpServers || mcpServers.length === 0) {
        alert('No MCP servers configured. Add servers in the MCP Servers tab first.');
        return;
    }
    
    // Ensure prompt is an object
    if (typeof editingConfig.prompts[promptIndex] === 'string') {
        editingConfig.prompts[promptIndex] = {
            text: editingConfig.prompts[promptIndex],
            mcpServerIds: []
        };
    }
    
    // Get current selections
    const prompt = editingConfig.prompts[promptIndex];
    const selectedIds = prompt.mcpServerIds || [];
    
    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'mcp-server-dialog';
    dialog.style.position = 'fixed';
    dialog.style.top = '50%';
    dialog.style.left = '50%';
    dialog.style.transform = 'translate(-50%, -50%)';
    dialog.style.backgroundColor = 'white';
    dialog.style.padding = '20px';
    dialog.style.borderRadius = '5px';
    dialog.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    dialog.style.zIndex = '1000';
    dialog.style.maxWidth = '400px';
    dialog.style.width = '100%';
    
    // Add title
    const title = document.createElement('h3');
    title.textContent = 'Select MCP Servers';
    title.style.marginBottom = '15px';
    dialog.appendChild(title);
    
    // Add MCP server options
    mcpServers.forEach(server => {
        const label = document.createElement('div');
        label.style.marginBottom = '10px';
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.style.marginRight = '10px';
        checkbox.checked = selectedIds.includes(server.id);
        checkbox.dataset.id = server.id;
        
        const text = document.createTextNode(server.name);
        
        label.appendChild(checkbox);
        label.appendChild(text);
        dialog.appendChild(label);
    });
    
    // Add buttons
    const buttonArea = document.createElement('div');
    buttonArea.style.display = 'flex';
    buttonArea.style.justifyContent = 'flex-end';
    buttonArea.style.marginTop = '20px';
    buttonArea.style.gap = '10px';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'btn';
    cancelBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
    });
    
    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.className = 'btn primary';
    applyBtn.addEventListener('click', () => {
        // Update prompt with selected servers
        const selectedIds = [];
        dialog.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            if (checkbox.checked) {
                selectedIds.push(checkbox.dataset.id);
            }
        });
        
        // Update the prompt
        editingConfig.prompts[promptIndex].mcpServerIds = selectedIds;
        markAsUnsaved();
        
        // Redraw prompts list
        renderPromptsList(editingConfig.prompts);
        
        // Close dialog
        document.body.removeChild(overlay);
    });
    
    buttonArea.appendChild(cancelBtn);
    buttonArea.appendChild(applyBtn);
    dialog.appendChild(buttonArea);
    
    // Create overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    overlay.style.zIndex = '999';
    overlay.appendChild(dialog);
    
    document.body.appendChild(overlay);
}

function addPrompt() {
    if (!editingConfig) return;
    
    // Add prompt with default MCP server selections
    const defaultEnabledServers = mcpServers
        .filter(server => server.defaultEnabled)
        .map(server => server.id);
    
    editingConfig.prompts.push({
        text: '',
        mcpServerIds: defaultEnabledServers
    });
    
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

// Ensure backward compatibility by converting string prompts to objects
function ensurePromptObjects(config) {
    if (!config || !config.prompts) return config;
    
    config.prompts = config.prompts.map(prompt => {
        if (typeof prompt === 'string') {
            return {
                text: prompt,
                mcpServerIds: [],
                model: null
            };
        }
        return prompt;
    });
    
    return config;
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

// MCP Server Management
function loadMCPServers() {
    fetch('/api/mcp-servers')
        .then(response => response.json())
        .then(data => {
            mcpServers = data;
            renderMCPServersList();
        })
        .catch(error => {
            console.error('Error loading MCP servers:', error);
        });
}

function renderMCPServersList() {
    const container = document.getElementById('mcpServersList');
    container.innerHTML = '';
    
    if (mcpServers.length === 0) {
        container.innerHTML = '<div class="empty-state">No MCP servers configured yet</div>';
        return;
    }
    
    mcpServers.forEach(server => {
        const serverElement = document.createElement('div');
        serverElement.className = `mcp-server-item ${server.id === activeMCPServerId ? 'active' : ''}`;
        serverElement.dataset.id = server.id;
        
        serverElement.innerHTML = `
            <div class="mcp-server-header">
                <strong>${server.name}</strong>
                <div class="mcp-server-actions">
                    <button class="icon-btn edit-mcp-server" title="Edit">✏️</button>
                    <button class="icon-btn danger delete-mcp-server" title="Delete">🗑️</button>
                </div>
            </div>
            <div class="mcp-server-command">${server.command} ${server.args || ''}</div>
        `;
        
        serverElement.addEventListener('click', (e) => {
            if (!e.target.closest('.mcp-server-actions')) {
                selectMCPServer(server.id);
            }
        });
        
        container.appendChild(serverElement);
    });
    
    // Add event listeners for action buttons
    document.querySelectorAll('.edit-mcp-server').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const serverId = e.target.closest('.mcp-server-item').dataset.id;
            editMCPServer(serverId);
            e.stopPropagation();
        });
    });
    
    document.querySelectorAll('.delete-mcp-server').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const serverId = e.target.closest('.mcp-server-item').dataset.id;
            deleteMCPServer(serverId);
            e.stopPropagation();
        });
    });
}

function selectMCPServer(serverId) {
    activeMCPServerId = serverId;
    
    // Update UI
    document.querySelectorAll('.mcp-server-item').forEach(item => {
        item.classList.toggle('active', item.dataset.id === serverId);
    });
    
    const mcpServer = mcpServers.find(s => s.id === serverId);
    if (!mcpServer) return;
    
    // Show edit form
    document.getElementById('mcpServerForm').classList.remove('hidden');
    
    // Update MCP server form
    editingMCPServer = { ...mcpServer };
    if (!editingMCPServer.env) {
        editingMCPServer.env = {};
    }
    
    document.getElementById('mcpServerFormTitle').textContent = mcpServer.name;
    document.getElementById('mcpServerStatus').textContent = 'Saved';
    document.getElementById('mcpServerStatus').className = 'status-indicator saved';
    
    document.getElementById('mcpServerName').value = mcpServer.name || '';
    document.getElementById('mcpServerCommand').value = mcpServer.command || '';
    document.getElementById('mcpServerArgs').value = mcpServer.args || '';
    document.getElementById('mcpServerDescription').value = mcpServer.description || '';
    document.getElementById('mcpServerDefaultEnabled').checked = mcpServer.defaultEnabled || false;
    
    // Render environment variables
    renderEnvVarsList(mcpServer.env || {});
    
    // Set up form change tracking
    setupMCPServerFormChangeTracking();
}

function setupMCPServerFormChangeTracking() {
    hasMCPServerUnsavedChanges = false;
    
    // Track form field changes
    document.getElementById('mcpServerName').addEventListener('input', markMCPServerAsUnsaved);
    document.getElementById('mcpServerCommand').addEventListener('input', markMCPServerAsUnsaved);
    document.getElementById('mcpServerArgs').addEventListener('input', markMCPServerAsUnsaved);
    document.getElementById('mcpServerDescription').addEventListener('input', markMCPServerAsUnsaved);
    document.getElementById('mcpServerDefaultEnabled').addEventListener('change', markMCPServerAsUnsaved);
}

function markMCPServerAsUnsaved() {
    if (!hasMCPServerUnsavedChanges && editingMCPServer) {
        hasMCPServerUnsavedChanges = true;
        document.getElementById('mcpServerStatus').textContent = 'Unsaved';
        document.getElementById('mcpServerStatus').className = 'status-indicator unsaved';
    }
}

function createNewMCPServer() {
    activeMCPServerId = null;
    editingMCPServer = {
        id: `mcp-server-${Date.now()}`,
        name: '',
        command: '',
        args: '',
        env: {},
        description: '',
        defaultEnabled: false
    };
    
    document.getElementById('mcpServerFormTitle').textContent = 'New MCP Server';
    document.getElementById('mcpServerStatus').textContent = 'Unsaved';
    document.getElementById('mcpServerStatus').className = 'status-indicator unsaved';
    
    document.getElementById('mcpServerName').value = '';
    document.getElementById('mcpServerCommand').value = '';
    document.getElementById('mcpServerArgs').value = '';
    document.getElementById('mcpServerDescription').value = '';
    document.getElementById('mcpServerDefaultEnabled').checked = false;
    
    renderEnvVarsList({});
    
    // Show form
    document.getElementById('mcpServerForm').classList.remove('hidden');
    
    // Set up form change tracking
    setupMCPServerFormChangeTracking();
}

function editMCPServer(serverId) {
    selectMCPServer(serverId);
}

function saveMCPServer() {
    const name = document.getElementById('mcpServerName').value.trim();
    if (!name) {
        alert('Please enter a MCP server name');
        return;
    }
    
    const command = document.getElementById('mcpServerCommand').value.trim();
    if (!command) {
        alert('Please enter a command');
        return;
    }
    
    editingMCPServer.name = name;
    editingMCPServer.command = command;
    editingMCPServer.args = document.getElementById('mcpServerArgs').value.trim();
    editingMCPServer.description = document.getElementById('mcpServerDescription').value.trim();
    editingMCPServer.defaultEnabled = document.getElementById('mcpServerDefaultEnabled').checked;
    
    // Save to server
    fetch('/api/mcp-servers', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(editingMCPServer)
    })
    .then(response => response.json())
    .then(data => {
        // Update local data
        const existingIndex = mcpServers.findIndex(s => s.id === editingMCPServer.id);
        if (existingIndex >= 0) {
            mcpServers[existingIndex] = editingMCPServer;
        } else {
            mcpServers.push(editingMCPServer);
        }
        
        // Update UI
        renderMCPServersList();
        
        // Set status to saved
        hasMCPServerUnsavedChanges = false;
        document.getElementById('mcpServerStatus').textContent = 'Saved';
        document.getElementById('mcpServerStatus').className = 'status-indicator saved';
        
        // Keep the same server selected
        activeMCPServerId = editingMCPServer.id;
    })
    .catch(error => {
        console.error('Error saving MCP server:', error);
        alert('Failed to save MCP server');
    });
}

function cancelMCPServerEdit() {
    if (hasMCPServerUnsavedChanges) {
        if (!confirm('You have unsaved changes. Are you sure you want to cancel?')) {
            return;
        }
    }
    
    // If we're editing an existing server, reload it
    if (activeMCPServerId) {
        selectMCPServer(activeMCPServerId);
    } else {
        // Otherwise, just hide the form
        document.getElementById('mcpServerForm').classList.add('hidden');
    }
    
    hasMCPServerUnsavedChanges = false;
}

function deleteMCPServer(serverId) {
    if (!confirm('Are you sure you want to delete this MCP server?')) {
        return;
    }
    
    fetch(`/api/mcp-servers/${serverId}`, {
        method: 'DELETE'
    })
    .then(response => {
        if (response.ok) {
            mcpServers = mcpServers.filter(s => s.id !== serverId);
            
            if (activeMCPServerId === serverId) {
                activeMCPServerId = null;
                document.getElementById('mcpServerForm').classList.add('hidden');
            }
            
            renderMCPServersList();
        } else {
            alert('Failed to delete MCP server');
        }
    })
    .catch(error => {
        console.error('Error deleting MCP server:', error);
        alert('Failed to delete MCP server');
    });
}

// Environment Variable Management
function renderEnvVarsList(env) {
    const container = document.getElementById('envVarsList');
    container.innerHTML = '';
    
    if (!env || Object.keys(env).length === 0) {
        container.innerHTML = '<div class="empty-state">No environment variables defined</div>';
        return;
    }
    
    Object.entries(env).forEach(([key, value], index) => {
        const envVarElement = document.createElement('div');
        envVarElement.className = 'env-var-item';
        envVarElement.innerHTML = `
            <input type="text" class="env-var-key" value="${escapeHtml(key)}" placeholder="Variable name">
            <input type="text" class="env-var-value" value="${escapeHtml(value)}" placeholder="Value">
            <div class="env-var-tools">
                <button class="icon-btn danger remove-env-var" title="Remove">✖️</button>
            </div>
        `;
        
        container.appendChild(envVarElement);
    });
    
    // Add event listeners
    document.querySelectorAll('.env-var-key').forEach((input, index) => {
        input.addEventListener('input', () => {
            updateEnvVarsFromInputs();
            markMCPServerAsUnsaved();
        });
    });
    
    document.querySelectorAll('.env-var-value').forEach((input, index) => {
        input.addEventListener('input', () => {
            updateEnvVarsFromInputs();
            markMCPServerAsUnsaved();
        });
    });
    
    document.querySelectorAll('.remove-env-var').forEach((btn, index) => {
        btn.addEventListener('click', () => {
            btn.closest('.env-var-item').remove();
            updateEnvVarsFromInputs();
            markMCPServerAsUnsaved();
        });
    });
}

function updateEnvVarsFromInputs() {
    if (!editingMCPServer) return;
    
    const env = {};
    document.querySelectorAll('.env-var-item').forEach(item => {
        const keyInput = item.querySelector('.env-var-key');
        const valueInput = item.querySelector('.env-var-value');
        
        const key = keyInput.value.trim();
        const value = valueInput.value.trim();
        
        if (key) {
            env[key] = value;
        }
    });
    
    editingMCPServer.env = env;
}

function addEnvVar() {
    if (!editingMCPServer) return;
    
    // Create a new empty environment variable input row
    const container = document.getElementById('envVarsList');
    
    // If there's an empty state message, clear it
    if (container.querySelector('.empty-state')) {
        container.innerHTML = '';
    }
    
    const envVarElement = document.createElement('div');
    envVarElement.className = 'env-var-item';
    envVarElement.innerHTML = `
        <input type="text" class="env-var-key" placeholder="Variable name">
        <input type="text" class="env-var-value" placeholder="Value">
        <div class="env-var-tools">
            <button class="icon-btn danger remove-env-var" title="Remove">✖️</button>
        </div>
    `;
    
    container.appendChild(envVarElement);
    
    // Add event listeners
    const keyInput = envVarElement.querySelector('.env-var-key');
    keyInput.addEventListener('input', () => {
        updateEnvVarsFromInputs();
        markMCPServerAsUnsaved();
    });
    
    const valueInput = envVarElement.querySelector('.env-var-value');
    valueInput.addEventListener('input', () => {
        updateEnvVarsFromInputs();
        markMCPServerAsUnsaved();
    });
    
    const removeBtn = envVarElement.querySelector('.remove-env-var');
    removeBtn.addEventListener('click', () => {
        envVarElement.remove();
        updateEnvVarsFromInputs();
        markMCPServerAsUnsaved();
    });
    
    // Focus the key input
    keyInput.focus();
    
    // Mark as unsaved
    markMCPServerAsUnsaved();
}

// Utilities
function generateId() {
    return 'config-' + Date.now().toString();
}

// Model Management
function loadModels() {
    fetch('/api/models')
        .then(response => response.json())
        .then(data => {
            modelConfig.defaultModel = data.defaultModel || 'anthropic/claude-3.7-sonnet';
            modelConfig.availableModels = data.availableModels || [
                'anthropic/claude-3.7-sonnet:thinking',
                'anthropic/claude-3.7-sonnet',
                'openai/o3-mini-high',
                'openai/gpt-4o-2024-11-20'
            ];
            
            // Only update API key status, not the actual key value
            if (data.apiKey) {
                modelConfig.apiKey = '***stored***';
                document.getElementById('openRouterApiKey').placeholder = 'API key is stored';
            } else {
                modelConfig.apiKey = '';
                document.getElementById('openRouterApiKey').placeholder = 'Enter your OpenRouter API key';
            }
            
            renderModelsUI();
        })
        .catch(error => {
            console.error('Error loading model configuration:', error);
        });
}

function renderModelsUI() {
    // Update default model dropdown
    const defaultModelSelect = document.getElementById('defaultModel');
    defaultModelSelect.innerHTML = '';
    
    modelConfig.availableModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        option.selected = model === modelConfig.defaultModel;
        defaultModelSelect.appendChild(option);
    });
    
    // Update available models list
    const modelsList = document.getElementById('availableModelsList');
    modelsList.innerHTML = '';
    
    modelConfig.availableModels.forEach(model => {
        const modelElement = document.createElement('div');
        modelElement.className = 'model-item';
        
        modelElement.innerHTML = `
            <div>
                <span>${escapeHtml(model)}</span>
                ${model === modelConfig.defaultModel ? '<span class="model-default-badge">Default</span>' : ''}
            </div>
            ${model === modelConfig.defaultModel ? '' : '<button class="icon-btn danger remove-model" data-model="' + escapeHtml(model) + '">✖️</button>'}
        `;
        
        modelsList.appendChild(modelElement);
    });
    
    // Add event listeners to remove buttons
    document.querySelectorAll('.remove-model').forEach(btn => {
        btn.addEventListener('click', () => {
            removeModel(btn.dataset.model);
        });
    });
    
    // Update any prompt model selectors too
    if (editingConfig && editingConfig.prompts) {
        renderPromptsList(editingConfig.prompts);
    }
}

function saveApiKey() {
    const apiKey = document.getElementById('openRouterApiKey').value.trim();
    if (!apiKey) {
        alert('Please enter an API key');
        return;
    }
    
    fetch('/api/models/apikey', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ apiKey })
    })
    .then(response => {
        if (!response.ok) throw new Error('Failed to save API key');
        return response.json();
    })
    .then(data => {
        alert('API key saved successfully');
        document.getElementById('openRouterApiKey').value = '';
        document.getElementById('openRouterApiKey').placeholder = 'API key is stored';
        modelConfig.apiKey = '***stored***';
    })
    .catch(error => {
        console.error('Error saving API key:', error);
        alert('Failed to save API key: ' + error.message);
    });
}

function saveDefaultModel() {
    const model = document.getElementById('defaultModel').value;
    if (!model) {
        alert('Please select a model');
        return;
    }
    
    fetch('/api/models/default', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model })
    })
    .then(response => {
        if (!response.ok) throw new Error('Failed to set default model');
        return response.json();
    })
    .then(data => {
        alert('Default model set to: ' + model);
        modelConfig.defaultModel = model;
        renderModelsUI();
    })
    .catch(error => {
        console.error('Error setting default model:', error);
        alert('Failed to set default model: ' + error.message);
    });
}

function addModel() {
    const modelId = document.getElementById('newModelInput').value.trim();
    if (!modelId) {
        alert('Please enter a model ID');
        return;
    }
    
    // Check if model already exists
    if (modelConfig.availableModels.includes(modelId)) {
        alert('This model is already in the list');
        return;
    }
    
    fetch('/api/models', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ modelId })
    })
    .then(response => {
        if (!response.ok) throw new Error('Failed to add model');
        return response.json();
    })
    .then(data => {
        // Update local state
        modelConfig.availableModels = data.models;
        document.getElementById('newModelInput').value = '';
        renderModelsUI();
    })
    .catch(error => {
        console.error('Error adding model:', error);
        alert('Failed to add model: ' + error.message);
    });
}

function removeModel(modelId) {
    if (modelId === modelConfig.defaultModel) {
        alert('Cannot remove the default model');
        return;
    }
    
    if (!confirm(`Are you sure you want to remove the model "${modelId}"?`)) {
        return;
    }
    
    fetch(`/api/models/${encodeURIComponent(modelId)}`, {
        method: 'DELETE'
    })
    .then(response => {
        if (!response.ok) throw new Error('Failed to remove model');
        return response.json();
    })
    .then(data => {
        // Update local state
        modelConfig.availableModels = data.models;
        renderModelsUI();
    })
    .catch(error => {
        console.error('Error removing model:', error);
        alert('Failed to remove model: ' + error.message);
    });
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
