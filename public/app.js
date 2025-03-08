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

function connectSocket(configId) {
    // Close existing socket if any
    if (socket) {
        socket.close();
    }
    
    // Create new socket
    socket = new WebSocket(`ws://${window.location.host}/ws/execution/${configId}`);
    
    socket.onopen = () => {
        console.log('WebSocket connected');
        appendOutput('Connected, waiting for execution to start...\n', 'info');
    };
    
    socket.onmessage = (event) => {
        try {
            console.log('Received WebSocket message:', event.data);
            const data = JSON.parse(event.data);
            
            if (data.type === 'output') {
                appendOutput(data.content);
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
            console.error('Error parsing WebSocket message:', error);
            appendOutput('Error: ' + error.message, 'error');
        }
    };
    
    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        appendOutput('WebSocket error', 'error');
    };
    
    socket.onclose = () => {
        console.log('WebSocket closed');
    };
}

function appendOutput(text, className = '') {
    const outputDisplay = document.getElementById('outputDisplay');
    const span = document.createElement('span');
    
    if (className) {
        span.className = className;
    }
    
    // Handle ANSI color codes and other formatting in output
    // Replace newlines with <br> for HTML display
    span.textContent = text;
    
    // Append the output and scroll to the bottom
    outputDisplay.appendChild(span);
    outputDisplay.scrollTop = outputDisplay.scrollHeight;
    
    // Debug output
    console.log('Appended output:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));
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
