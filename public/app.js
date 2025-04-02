// Global state
let configs = [];
let activeConfigId = null;
let editingConfig = null;
let socket = null;
let hasUnsavedChanges = false;
let currentFolderPath = ''; // Current folder being viewed
let folders = {}; // Folder structure
let contextMenu = null; // Current open context menu
let draggedItem = null; // Item being dragged
let triggerDialogCurrentPath = ''; // Current path in trigger selection dialog

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
    document.getElementById('configureTriggerBtn').addEventListener('click', showTriggerConfigDialog);
    document.getElementById('triggerEnabled').addEventListener('change', toggleTriggerOptions);
    document.getElementById('scheduleEnabled').addEventListener('change', toggleScheduleOptions);
    document.getElementById('scheduleFrequency').addEventListener('change', updateScheduleFields);
    document.getElementById('runConfigBtn').addEventListener('click', runConfig);
    document.getElementById('clearOutputBtn').addEventListener('click', clearOutput);
    
    // Add click handler to handle closing context menus
    document.addEventListener('click', (e) => {
        if (contextMenu && !e.target.closest('.context-menu')) {
            contextMenu.remove();
            contextMenu = null;
        }
    });
    
    // Add global drag and drop event handlers
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);
    document.addEventListener('dragend', () => {
        // Remove all drag-over states
        document.querySelectorAll('.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
        draggedItem = null;
    });
    
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
    
    // Update page title
    const pageTitle = document.getElementById('pageTitle');
    
    // Show the requested section
    if (section === 'configs') {
        document.getElementById('configsSection').classList.remove('hidden');
        document.getElementById('navConfigsBtn').classList.add('active');
        pageTitle.textContent = 'Configurations';
    } else if (section === 'mcpServers') {
        document.getElementById('mcpServersSection').classList.remove('hidden');
        document.getElementById('navMCPServersBtn').classList.add('active');
        pageTitle.textContent = 'MCP Servers';
    } else if (section === 'models') {
        document.getElementById('modelsSection').classList.remove('hidden');
        document.getElementById('navModelsBtn').classList.add('active');
        pageTitle.textContent = 'Model Configuration';
        loadModels();
    }
}

// Configuration management
function loadConfigs() {
    // Load folders first to build the folder structure
    fetch('/api/folders')
        .then(response => response.json())
        .then(data => {
            folders = {};
            // Add the data to the folders object
            data.forEach(folder => {
                folders[folder.path] = folder;
            });
            
            // Then load configs
            return fetch('/api/configs');
        })
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
    
    // Add a button for creating a new folder at the current level
    const folderActionsDiv = document.createElement('div');
    folderActionsDiv.className = 'folder-actions';
    folderActionsDiv.innerHTML = `
        <button id="createFolderBtn" class="btn secondary">+ New Folder</button>
    `;
    container.appendChild(folderActionsDiv);
    
    // Add click event for new folder button
    document.getElementById('createFolderBtn').addEventListener('click', () => {
        showCreateFolderDialog(currentFolderPath);
    });
    
    // Create breadcrumb navigation
    const breadcrumbDiv = document.createElement('div');
    breadcrumbDiv.className = 'folder-breadcrumb';
    
    // Add root link
    const rootLink = document.createElement('span');
    rootLink.className = 'breadcrumb-item';
    rootLink.textContent = 'Home';
    rootLink.addEventListener('click', () => navigateToFolder(''));
    breadcrumbDiv.appendChild(rootLink);
    
    // Add path segments if not at root
    if (currentFolderPath) {
        const pathParts = currentFolderPath.split('/');
        let currentPath = '';
        
        pathParts.forEach((part, index) => {
            // Add separator
            const separator = document.createElement('span');
            separator.className = 'breadcrumb-separator';
            separator.textContent = '/';
            breadcrumbDiv.appendChild(separator);
            
            // Update current path
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            
            // Add folder link
            const folderLink = document.createElement('span');
            folderLink.className = 'breadcrumb-item';
            folderLink.textContent = part;
            
            // Last item is current folder, not clickable
            if (index === pathParts.length - 1) {
                folderLink.style.fontWeight = 'bold';
                folderLink.style.color = 'var(--text-color)';
            } else {
                const path = currentPath; // Capture current path for click handler
                folderLink.addEventListener('click', () => navigateToFolder(path));
            }
            
            breadcrumbDiv.appendChild(folderLink);
        });
    }
    
    container.appendChild(breadcrumbDiv);
    
    // Filter subfolders and configs for current folder
    const subfolders = Object.values(folders).filter(folder => 
        folder.parentPath === currentFolderPath);
    
    const folderConfigs = configs.filter(config => 
        (config.path || '') === currentFolderPath);
    
    // Show empty state if no folders or configs
    if (subfolders.length === 0 && folderConfigs.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-state';
        emptyDiv.innerHTML = 'This folder is empty';
        container.appendChild(emptyDiv);
        
        // Add a button for creating a new configuration here
        const newConfigBtn = document.createElement('button');
        newConfigBtn.className = 'btn primary';
        newConfigBtn.textContent = '+ New Configuration';
        newConfigBtn.addEventListener('click', () => createNewConfig());
        
        // Add spacing between empty message and button
        const spacer = document.createElement('div');
        spacer.style.height = '10px';
        
        container.appendChild(spacer);
        container.appendChild(newConfigBtn);
        
        // Don't return here, we want to continue rendering the folder structure
    }
    
    // Render subfolders
    subfolders.forEach(folder => {
        const folderElement = document.createElement('div');
        folderElement.className = 'folder-item';
        folderElement.dataset.path = folder.path;
        folderElement.draggable = true;
        
        folderElement.innerHTML = `
            <span class="material-icons-outlined folder-icon">folder</span>
            <div class="folder-name">${folder.name}</div>
            <div class="folder-actions">
                <button class="icon-btn rename-folder" title="Rename">
                    <span class="material-icons-outlined">edit</span>
                </button>
                <button class="icon-btn danger delete-folder" title="Delete">
                    <span class="material-icons-outlined">delete</span>
                </button>
            </div>
        `;
        
        // Add drag handlers
        folderElement.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', folder.path);
            e.dataTransfer.effectAllowed = 'move';
            folderElement.classList.add('dragging');
            draggedItem = { type: 'folder', path: folder.path };
        });
        
        // Click to navigate into folder
        folderElement.addEventListener('click', (e) => {
            if (!e.target.closest('.folder-actions')) {
                navigateToFolder(folder.path);
            }
        });
        
        // Context menu for folder
        folderElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showFolderContextMenu(e, folder);
        });
        
        container.appendChild(folderElement);
    });
    
    // Render configs
    folderConfigs.forEach(config => {
        const configElement = document.createElement('div');
        configElement.className = `config-item ${config.id === activeConfigId ? 'active' : ''}`;
        configElement.dataset.id = config.id;
        configElement.draggable = true;
        
        let scheduleInfo = 'Not scheduled';
        if (config.schedule && config.schedule.enabled) {
            scheduleInfo = getScheduleDisplayText(config.schedule);
        }
        
        configElement.innerHTML = `
            <span class="material-icons-outlined config-icon">description</span>
            <div class="config-item-header">
                <strong>${config.name}</strong>
                <div class="config-actions">
                    <button class="icon-btn edit-config" title="Edit">
                        <span class="material-icons-outlined">edit</span>
                    </button>
                    <button class="icon-btn danger delete-config" title="Delete">
                        <span class="material-icons-outlined">delete</span>
                    </button>
                </div>
            </div>
            <div class="config-scheduled">${scheduleInfo}</div>
        `;
        
        // Add drag handlers
        configElement.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', config.id);
            e.dataTransfer.effectAllowed = 'move';
            configElement.classList.add('dragging');
            draggedItem = { type: 'config', id: config.id };
        });
        
        configElement.addEventListener('click', (e) => {
            if (!e.target.closest('.config-actions')) {
                selectConfig(config.id);
            }
        });
        
        // Context menu for config
        configElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showConfigContextMenu(e, config);
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
    
    document.querySelectorAll('.rename-folder').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const folderPath = e.target.closest('.folder-item').dataset.path;
            showRenameFolderDialog(folderPath);
            e.stopPropagation();
        });
    });
    
    document.querySelectorAll('.delete-folder').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const folderPath = e.target.closest('.folder-item').dataset.path;
            deleteFolder(folderPath);
            e.stopPropagation();
        });
    });
}

// Folder Navigation
function navigateToFolder(path) {
    currentFolderPath = path;
    renderConfigsList();
}

// Context Menus
function showFolderContextMenu(e, folder) {
    if (contextMenu) {
        contextMenu.remove();
    }
    
    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.left = `${e.pageX}px`;
    contextMenu.style.top = `${e.pageY}px`;
    
    contextMenu.innerHTML = `
        <div class="context-menu-item" data-action="open">
            <span>📂</span> Open Folder
        </div>
        <div class="context-menu-item" data-action="rename">
            <span>✏️</span> Rename
        </div>
        <div class="context-menu-item" data-action="create-subfolder">
            <span>➕</span> Create Subfolder
        </div>
        <div class="context-menu-item danger" data-action="delete">
            <span>🗑️</span> Delete
        </div>
    `;
    
    document.body.appendChild(contextMenu);
    
    // Prevent menu from going off screen
    const rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        contextMenu.style.left = `${e.pageX - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
        contextMenu.style.top = `${e.pageY - rect.height}px`;
    }
    
    // Add event listeners
    contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
        item.addEventListener('click', () => {
            const action = item.dataset.action;
            
            switch (action) {
                case 'open':
                    navigateToFolder(folder.path);
                    break;
                case 'rename':
                    showRenameFolderDialog(folder.path);
                    break;
                case 'create-subfolder':
                    showCreateFolderDialog(folder.path);
                    break;
                case 'delete':
                    deleteFolder(folder.path);
                    break;
            }
            
            contextMenu.remove();
            contextMenu = null;
        });
    });
}

function showConfigContextMenu(e, config) {
    if (contextMenu) {
        contextMenu.remove();
    }
    
    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.left = `${e.pageX}px`;
    contextMenu.style.top = `${e.pageY}px`;
    
    // Get all folder paths for the move submenu
    const folderPaths = Object.keys(folders);
    
    // Start with basic options
    let menuHtml = `
        <div class="context-menu-item" data-action="edit">
            <span>✏️</span> Edit
        </div>
        <div class="context-menu-item" data-action="run">
            <span>▶️</span> Run
        </div>
        <div class="context-menu-item" data-action="move-root">
            <span>📁</span> Move to Root
        </div>
    `;
    
    // Add move options for each folder (excluding current folder)
    folderPaths.forEach(folderPath => {
        if (folderPath !== config.path) {
            menuHtml += `
                <div class="context-menu-item" data-action="move" data-path="${folderPath}">
                    <span>📁</span> Move to ${folderPath}
                </div>
            `;
        }
    });
    
    // Add delete option
    menuHtml += `
        <div class="context-menu-item danger" data-action="delete">
            <span>🗑️</span> Delete
        </div>
    `;
    
    contextMenu.innerHTML = menuHtml;
    document.body.appendChild(contextMenu);
    
    // Prevent menu from going off screen
    const rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        contextMenu.style.left = `${e.pageX - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
        contextMenu.style.top = `${e.pageY - rect.height}px`;
    }
    
    // Add event listeners
    contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
        item.addEventListener('click', () => {
            const action = item.dataset.action;
            
            switch (action) {
                case 'edit':
                    editConfig(config.id);
                    break;
                case 'run':
                    selectConfig(config.id);
                    runConfig();
                    break;
                case 'move-root':
                    moveConfigToFolder(config.id, '');
                    break;
                case 'move':
                    moveConfigToFolder(config.id, item.dataset.path);
                    break;
                case 'delete':
                    deleteConfig(config.id);
                    break;
            }
            
            contextMenu.remove();
            contextMenu = null;
        });
    });
}

// Dialog functions
function showCreateFolderDialog(parentPath) {
    // First, create overlay as a separate element
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    overlay.style.zIndex = '999';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    
    // Then create the dialog
    const dialog = document.createElement('div');
    dialog.className = 'folder-dialog';
    dialog.style.backgroundColor = 'white';
    dialog.style.borderRadius = '5px';
    dialog.style.padding = '20px';
    dialog.style.boxShadow = '0 0 10px rgba(0,0,0,0.2)';
    dialog.style.zIndex = '1000';
    dialog.style.minWidth = '300px';
    
    dialog.innerHTML = `
        <div class="folder-dialog-header">
            <h3>Create New Folder</h3>
        </div>
        <div class="form-group">
            <label for="newFolderName">Folder Name</label>
            <input type="text" id="newFolderName" placeholder="Enter folder name">
        </div>
        <div class="folder-dialog-actions">
            <button class="cancel-folder-btn btn">Cancel</button>
            <button class="create-folder-btn btn primary">Create</button>
        </div>
    `;
    
    // Append dialog to overlay, then overlay to body
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    // Focus the input
    setTimeout(() => {
        document.getElementById('newFolderName').focus();
    }, 0);
    
    // Add event listeners - directly to the buttons instead of by ID
    const cancelBtn = dialog.querySelector('.cancel-folder-btn');
    const createBtn = dialog.querySelector('.create-folder-btn');
    const input = document.getElementById('newFolderName');
    
    cancelBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
    });
    
    createBtn.addEventListener('click', () => {
        const folderName = input.value.trim();
        
        if (!folderName) {
            alert('Please enter a folder name');
            return;
        }
        
        // Construct the full path
        const fullPath = parentPath ? `${parentPath}/${folderName}` : folderName;
        
        // Create the folder
        createFolder(fullPath);
        
        document.body.removeChild(overlay);
    });
    
    // Handle Enter key
    input.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            createBtn.click();
        }
    });
}

function showRenameFolderDialog(folderPath) {
    const folder = folders[folderPath];
    if (!folder) return;
    
    // First, create overlay as a separate element
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    overlay.style.zIndex = '999';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    
    // Then create the dialog
    const dialog = document.createElement('div');
    dialog.className = 'folder-dialog';
    dialog.style.backgroundColor = 'white';
    dialog.style.borderRadius = '5px';
    dialog.style.padding = '20px';
    dialog.style.boxShadow = '0 0 10px rgba(0,0,0,0.2)';
    dialog.style.zIndex = '1000';
    dialog.style.minWidth = '300px';
    
    dialog.innerHTML = `
        <div class="folder-dialog-header">
            <h3>Rename Folder</h3>
        </div>
        <div class="form-group">
            <label for="renameFolderName">Folder Name</label>
            <input type="text" id="renameFolderName" value="${escapeHtml(folder.name)}">
        </div>
        <div class="folder-dialog-actions">
            <button class="cancel-rename-btn btn">Cancel</button>
            <button class="rename-folder-btn btn primary">Rename</button>
        </div>
    `;
    
    // Append dialog to overlay, then overlay to body
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    // Focus the input and select all text
    setTimeout(() => {
        const input = document.getElementById('renameFolderName');
        input.focus();
        input.select();
    }, 0);
    
    // Add event listeners - directly to the buttons instead of by ID
    const cancelBtn = dialog.querySelector('.cancel-rename-btn');
    const renameBtn = dialog.querySelector('.rename-folder-btn');
    const input = document.getElementById('renameFolderName');
    
    cancelBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
    });
    
    renameBtn.addEventListener('click', () => {
        const newName = input.value.trim();
        
        if (!newName) {
            alert('Please enter a folder name');
            return;
        }
        
        // Construct the new path
        const parentPath = folder.parentPath;
        const newPath = parentPath ? `${parentPath}/${newName}` : newName;
        
        // Rename the folder
        renameFolder(folderPath, newPath);
        
        document.body.removeChild(overlay);
    });
    
    // Handle Enter key
    input.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            renameBtn.click();
        }
    });
}

// API calls for folder operations
function createFolder(path) {
    fetch('/api/folders', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to create folder');
        }
        return response.json();
    })
    .then(data => {
        // Update local folders state
        folders[path] = data.folder;
        
        // Navigate to the new folder
        navigateToFolder(path);
    })
    .catch(error => {
        console.error('Error creating folder:', error);
        alert('Failed to create folder');
    });
}

function renameFolder(oldPath, newPath) {
    fetch(`/api/folders/${encodeURIComponent(oldPath)}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newPath })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to rename folder');
        }
        return response.json();
    })
    .then(data => {
        // Reload folders and configs
        loadConfigs();
        
        // Navigate to the new folder path if we were in the old one
        if (currentFolderPath === oldPath) {
            currentFolderPath = newPath;
        }
    })
    .catch(error => {
        console.error('Error renaming folder:', error);
        alert('Failed to rename folder');
    });
}

function deleteFolder(path) {
    if (!confirm(`Are you sure you want to delete the folder "${path}"?\nConfigurations inside will be moved to the parent folder.`)) {
        return;
    }
    
    fetch(`/api/folders/${encodeURIComponent(path)}`, {
        method: 'DELETE'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to delete folder');
        }
        return response.json();
    })
    .then(data => {
        // Remove from local state
        delete folders[path];
        
        // Go to parent folder if we're in the deleted one
        if (currentFolderPath === path) {
            const parentPath = path.includes('/') 
                ? path.substring(0, path.lastIndexOf('/')) 
                : '';
            currentFolderPath = parentPath;
        }
        
        // Reload configs
        loadConfigs();
    })
    .catch(error => {
        console.error('Error deleting folder:', error);
        alert('Failed to delete folder');
    });
}

function moveConfigToFolder(configId, folderPath) {
    fetch(`/api/configs/${configId}/move`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ folderPath })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to move configuration');
        }
        return response.json();
    })
    .then(data => {
        // Update local state
        const config = configs.find(c => c.id === configId);
        if (config) {
            config.path = folderPath;
        }
        
        // Rerender the configs list
        renderConfigsList();
    })
    .catch(error => {
        console.error('Error moving configuration:', error);
        alert('Failed to move configuration');
    });
}

// Drag and Drop handlers
function handleDragOver(e) {
    if (!draggedItem) return;
    
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    // Remove drag-over class from all elements
    document.querySelectorAll('.drag-over').forEach(el => {
        el.classList.remove('drag-over');
    });
    
    // Add drag-over class to valid drop targets
    const target = getDragTarget(e);
    if (target) {
        target.classList.add('drag-over');
    }
}

function handleDrop(e) {
    if (!draggedItem) return;
    
    e.preventDefault();
    
    // Remove drag-over class from all elements
    document.querySelectorAll('.drag-over').forEach(el => {
        el.classList.remove('drag-over');
    });
    
    const target = getDragTarget(e);
    if (!target) return;
    
    // Get the destination folder path
    let destPath = '';
    if (target.classList.contains('folder-item')) {
        destPath = target.dataset.path;
    } else if (target.id === 'configsList' || target.closest('.folder-breadcrumb')) {
        destPath = currentFolderPath;
    } else {
        return;
    }
    
    // Handle drop based on dragged item type
    if (draggedItem.type === 'config') {
        moveConfigToFolder(draggedItem.id, destPath);
    } else if (draggedItem.type === 'folder') {
        // Can't drop a folder into itself or its subfolder
        if (destPath === draggedItem.path || destPath.startsWith(`${draggedItem.path}/`)) {
            return;
        }
        
        // Rename the folder to move it
        const folderName = draggedItem.path.includes('/') 
            ? draggedItem.path.split('/').pop() 
            : draggedItem.path;
            
        const newPath = destPath 
            ? `${destPath}/${folderName}` 
            : folderName;
            
        renameFolder(draggedItem.path, newPath);
    }
}

function getDragTarget(e) {
    // Check if we're hovering over a folder
    const folderEl = e.target.closest('.folder-item');
    if (folderEl) return folderEl;
    
    // Check if we're hovering over the main configs container 
    // (to drop at current folder level)
    const configsList = document.getElementById('configsList');
    if (configsList.contains(e.target)) return configsList;
    
    // Check if we're hovering over breadcrumb (to drop at that level)
    const breadcrumb = e.target.closest('.folder-breadcrumb');
    if (breadcrumb) return breadcrumb;
    
    return null;
}

function selectConfig(configId) {
    console.log("selectConfig called with configId:", configId);
    
    activeConfigId = configId;
    
    // Update UI
    document.querySelectorAll('.config-item').forEach(item => {
        item.classList.toggle('active', item.dataset.id === configId);
    });
    
    const config = configs.find(c => c.id === configId);
    console.log("Found config:", config);
    
    if (!config) {
        console.error("Configuration not found for id:", configId);
        console.log("Available configs:", configs);
        return;
    }
    
    try {
        // Show the active config section and both panels
        console.log("Showing config form and execution panel");
        const activeConfigSection = document.getElementById('activeConfigSection');
        const configForm = document.getElementById('configForm');
        const executionPanel = document.getElementById('executionPanel');
        
        console.log("activeConfigSection element:", activeConfigSection);
        console.log("configForm element:", configForm);
        console.log("executionPanel element:", executionPanel);
        
        // Make sure all panels are fully visible
        if (activeConfigSection) {
            activeConfigSection.style.display = 'block';
            activeConfigSection.style.visibility = 'visible';
            activeConfigSection.style.opacity = '1';
        }
        
        // Ensure the config form is visible
        configForm.classList.remove('hidden');
        configForm.style.display = 'block';
        configForm.style.visibility = 'visible';
        configForm.style.opacity = '1';
        
        // Ensure the execution panel is visible
        executionPanel.classList.remove('hidden');
        executionPanel.style.display = 'block';
        executionPanel.style.visibility = 'visible';
        executionPanel.style.opacity = '1';
        
        // Force a layout recalculation
        setTimeout(() => {
            if (activeConfigSection) activeConfigSection.style.display = 'block';
            configForm.style.display = 'block';
            executionPanel.style.display = 'block';
            
            // Scroll to make the config form visible if needed
            configForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
        
        // Update config form with backward compatibility for prompts
        console.log("Creating editing config with prompt objects");
        editingConfig = ensurePromptObjects({ ...config });
        
        console.log("Setting form title and status");
        document.getElementById('configFormTitle').textContent = config.name;
        document.getElementById('configStatus').textContent = 'Saved';
        document.getElementById('configStatus').className = 'status-indicator saved';
        
        console.log("Setting form fields");
        document.getElementById('configName').value = config.name;
        
        console.log("Rendering prompts list");
        renderPromptsList(editingConfig.prompts);
        
        // Always ensure both optional sections start closed with proper state
        console.log("Setting optional sections to start closed by default");
        
        // Set trigger state
        document.getElementById('triggerEnabled').checked = config.trigger?.enabled || false;
        document.getElementById('triggerConfig').classList.add('hidden');
        
        // Set schedule state
        document.getElementById('scheduleEnabled').checked = config.schedule?.enabled || false;
        document.getElementById('scheduleConfig').classList.add('hidden');
        
        // Update the UI based on the saved state if enabled
        if (config.trigger?.enabled) {
            document.getElementById('triggerConfig').classList.remove('hidden');
        }
        
        if (config.schedule?.enabled) {
            document.getElementById('scheduleConfig').classList.remove('hidden');
        }
        
        console.log("Rendering trigger info");
        renderTriggerInfo(); // Display trigger information if it exists
    } catch (error) {
        console.error("Error in selectConfig:", error);
    }
    
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

// Trigger functionality
function toggleTriggerOptions() {
    const enabled = document.getElementById('triggerEnabled').checked;
    document.getElementById('triggerConfig').classList.toggle('hidden', !enabled);
    
    if (editingConfig) {
        if (!editingConfig.trigger) {
            editingConfig.trigger = {};
        }
        editingConfig.trigger.enabled = enabled;
        markAsUnsaved();
    }
}

function renderTriggerInfo() {
    const container = document.getElementById('triggerSelector');
    container.innerHTML = '';
    
    // Set the trigger toggle state based on configuration
    const triggerEnabled = editingConfig?.trigger?.enabled || false;
    document.getElementById('triggerEnabled').checked = triggerEnabled;
    document.getElementById('triggerConfig').classList.toggle('hidden', !triggerEnabled);
    
    if (!editingConfig || !editingConfig.trigger || !editingConfig.trigger.configId) {
        container.innerHTML = '<p>No trigger configured</p>';
        return;
    }
    
    const triggerId = editingConfig.trigger.configId;
    const triggerConfig = configs.find(c => c.id === triggerId);
    const preserveSession = editingConfig.trigger.preserveSession || false;
    
    if (!triggerConfig) {
        container.innerHTML = `<p>Error: Trigger configuration not found (ID: ${triggerId})</p>`;
        return;
    }
    
    const triggerInfo = document.createElement('div');
    triggerInfo.className = 'trigger-info';
    
    let path = '';
    if (triggerConfig.path) {
        path = ` (${triggerConfig.path})`;
    }
    
    triggerInfo.innerHTML = `
        <div class="trigger-config-name">${escapeHtml(triggerConfig.name)}${path}</div>
        <div>Preserve session: ${preserveSession ? 'Yes' : 'No'}</div>
        <button id="removeTriggerBtn" class="btn small">Remove Trigger</button>
    `;
    
    container.appendChild(triggerInfo);
    
    // Add event listener for removal
    document.getElementById('removeTriggerBtn').addEventListener('click', removeTrigger);
}

function removeTrigger() {
    if (!editingConfig) return;
    
    delete editingConfig.trigger;
    renderTriggerInfo();
    markAsUnsaved();
}

function showTriggerConfigDialog() {
    if (!editingConfig) return;
    
    // Set initial path for browser
    triggerDialogCurrentPath = '';
    
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    overlay.style.zIndex = '999';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    
    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'trigger-dialog';
    dialog.style.backgroundColor = 'white';
    dialog.style.borderRadius = '5px';
    dialog.style.padding = '20px';
    dialog.style.boxShadow = '0 0 10px rgba(0,0,0,0.2)';
    dialog.style.zIndex = '1000';
    dialog.style.minWidth = '500px';
    dialog.style.maxWidth = '80%';
    
    dialog.innerHTML = `
        <div class="folder-dialog-header">
            <h3>Select Configuration to Trigger</h3>
        </div>
        <div class="form-group">
            <p>Browse and select a configuration to run after this one completes:</p>
            <div class="folder-browser" id="triggerFolderBrowser"></div>
            
            <div class="form-check">
                <input type="checkbox" id="preserveSession">
                <label for="preserveSession">Preserve session (use same context)</label>
            </div>
            <p class="help-text">When enabled, the triggered configuration will continue with the same session ID, preserving the context from this configuration.</p>
        </div>
        <div class="folder-dialog-actions">
            <button id="cancelTriggerBtn" class="btn">Cancel</button>
            <button id="saveTriggerBtn" class="btn primary" disabled>Save Trigger</button>
        </div>
    `;
    
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    // Track selected config
    let selectedConfigId = editingConfig.trigger ? editingConfig.trigger.configId : null;
    
    // If we already have a trigger, enable the save button
    if (selectedConfigId) {
        document.getElementById('saveTriggerBtn').disabled = false;
    }
    
    // Populate folder browser
    const folderBrowser = document.getElementById('triggerFolderBrowser');
    renderTriggerFolderBrowser(folderBrowser, selectedConfigId);
    
    // Set preserve session state if existing trigger
    if (editingConfig.trigger && editingConfig.trigger.preserveSession) {
        document.getElementById('preserveSession').checked = true;
    }
    
    // Add event listeners for the cancel button
    document.getElementById('cancelTriggerBtn').addEventListener('click', () => {
        document.body.removeChild(overlay);
    });
    
    // Add event listener for the save button - will work regardless of when a config is selected
    document.getElementById('saveTriggerBtn').addEventListener('click', () => {
        // Get the currently selected config
        const selectedItem = document.querySelector('.config-item-trigger.selected-trigger');
        if (!selectedItem) {
            alert('Please select a configuration to trigger');
            return;
        }
        
        const configId = selectedItem.dataset.id;
        const preserveSession = document.getElementById('preserveSession').checked;
        
        // Update trigger in editing config
        editingConfig.trigger = {
            configId: configId,
            preserveSession
        };
        
        // Close dialog
        document.body.removeChild(overlay);
        
        // Update trigger display
        renderTriggerInfo();
        
        // Mark as unsaved
        markAsUnsaved();
    });
}

function renderTriggerFolderBrowser(container, selectedConfigId) {
    container.innerHTML = '';
    
    // Create breadcrumb navigation
    const breadcrumbDiv = document.createElement('div');
    breadcrumbDiv.className = 'folder-breadcrumb';
    
    // Add root link
    const rootLink = document.createElement('span');
    rootLink.className = 'breadcrumb-item';
    rootLink.textContent = 'Home';
    rootLink.addEventListener('click', () => {
        triggerDialogCurrentPath = '';
        renderTriggerFolderBrowser(container, selectedConfigId);
    });
    breadcrumbDiv.appendChild(rootLink);
    
    // Add path segments if not at root
    if (triggerDialogCurrentPath) {
        const pathParts = triggerDialogCurrentPath.split('/');
        let currentPath = '';
        
        pathParts.forEach((part, index) => {
            // Add separator
            const separator = document.createElement('span');
            separator.className = 'breadcrumb-separator';
            separator.textContent = '/';
            breadcrumbDiv.appendChild(separator);
            
            // Update current path
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            
            // Add folder link
            const folderLink = document.createElement('span');
            folderLink.className = 'breadcrumb-item';
            folderLink.textContent = part;
            
            // Last item is current folder, not clickable
            if (index === pathParts.length - 1) {
                folderLink.style.fontWeight = 'bold';
                folderLink.style.color = 'var(--text-color)';
            } else {
                const path = currentPath; // Capture current path for click handler
                folderLink.addEventListener('click', () => {
                    triggerDialogCurrentPath = path;
                    renderTriggerFolderBrowser(container, selectedConfigId);
                });
            }
            
            breadcrumbDiv.appendChild(folderLink);
        });
    }
    
    container.appendChild(breadcrumbDiv);
    
    // Filter subfolders and configs for current path
    const subfolders = Object.values(folders).filter(folder => 
        folder.parentPath === triggerDialogCurrentPath);
    
    const folderConfigs = configs.filter(config => 
        (config.path || '') === triggerDialogCurrentPath && config.id !== editingConfig.id); // Exclude current config
    
    // Render subfolders
    subfolders.forEach(folder => {
        const folderElement = document.createElement('div');
        folderElement.className = 'folder-item-trigger';
        folderElement.innerHTML = `
            <span class="folder-icon">📁</span>
            <span>${escapeHtml(folder.name)}</span>
        `;
        
        folderElement.addEventListener('click', () => {
            triggerDialogCurrentPath = folder.path;
            renderTriggerFolderBrowser(container, selectedConfigId);
        });
        
        container.appendChild(folderElement);
    });
    
    // Render configs
    folderConfigs.forEach(config => {
        const configElement = document.createElement('div');
        configElement.className = 'config-item-trigger';
        configElement.dataset.id = config.id;
        
        // Check if this config is already selected as the trigger
        if (selectedConfigId === config.id) {
            configElement.classList.add('selected-trigger');
        }
        
        configElement.innerHTML = `
            <span class="config-icon">📄</span>
            <span>${escapeHtml(config.name)}</span>
        `;
        
        configElement.addEventListener('click', () => {
            // Remove selected class from all configs
            document.querySelectorAll('.config-item-trigger').forEach(item => {
                item.classList.remove('selected-trigger');
            });
            
            // Add selected class to this config
            configElement.classList.add('selected-trigger');
            
            // Enable save button
            const saveBtn = document.getElementById('saveTriggerBtn');
            saveBtn.disabled = false;
            
            // Update the selected config ID
            selectedConfigId = config.id;
        });
        
        container.appendChild(configElement);
    });
    
    // Show empty state if no folders or configs
    if (subfolders.length === 0 && folderConfigs.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-state';
        emptyDiv.innerHTML = 'This folder is empty';
        container.appendChild(emptyDiv);
    }
}

function createNewConfig() {
    activeConfigId = null;
    editingConfig = {
        id: generateId(),
        name: '',
        path: currentFolderPath, // Set current folder path
        prompts: [],
        trigger: {
            enabled: false
        },
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
    
    // Show saving indicator
    const saveBtn = document.getElementById('saveConfigBtn');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;
    
    // Save to server
    fetch('/api/configs', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(editingConfig)
    })
    .then(response => {
        // Check if the response is OK before parsing JSON
        if (!response.ok) {
            return response.json().then(errorData => {
                throw new Error(errorData.error || 'Failed to save configuration');
            });
        }
        return response.json();
    })
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
        
        // Show success message with auto-hide
        showNotification('Configuration saved successfully', 'success');
    })
    .catch(error => {
        console.error('Error saving configuration:', error);
        showNotification(error.message || 'Failed to save configuration', 'error');
        
        // Update status to show error
        document.getElementById('configStatus').textContent = 'Error';
        document.getElementById('configStatus').className = 'status-indicator error';
    })
    .finally(() => {
        // Reset save button
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
    });
}

/**
 * Show a notification message to the user
 * @param {string} message - The message to display
 * @param {string} type - The type of notification (success, error, warning, info)
 */
function showNotification(message, type = 'info') {
    // First check if notification container exists, create if not
    let container = document.getElementById('notificationContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notificationContainer';
        container.style.position = 'fixed';
        container.style.top = '20px';
        container.style.right = '20px';
        container.style.maxWidth = '400px';
        container.style.zIndex = '9999';
        document.body.appendChild(container);
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.padding = '15px 20px';
    notification.style.marginBottom = '10px';
    notification.style.borderRadius = '5px';
    notification.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
    notification.style.backgroundColor = type === 'error' ? '#f44336' : 
                                         type === 'success' ? '#4CAF50' :
                                         type === 'warning' ? '#ff9800' : '#2196F3';
    notification.style.color = 'white';
    notification.style.fontSize = '14px';
    notification.style.display = 'flex';
    notification.style.justifyContent = 'space-between';
    notification.style.alignItems = 'center';
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.3s ease-in-out';
    
    // Add message
    const messageDiv = document.createElement('div');
    messageDiv.textContent = message;
    notification.appendChild(messageDiv);
    
    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.style.marginLeft = '10px';
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.color = 'white';
    closeBtn.style.fontSize = '16px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.padding = '0 5px';
    closeBtn.onclick = () => {
        removeNotification(notification);
    };
    notification.appendChild(closeBtn);
    
    // Add to container
    container.appendChild(notification);
    
    // Fade in
    setTimeout(() => {
        notification.style.opacity = '1';
    }, 10);
    
    // Auto-remove after delay
    setTimeout(() => {
        removeNotification(notification);
    }, 5000);
    
    function removeNotification(element) {
        element.style.opacity = '0';
        setTimeout(() => {
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }
        }, 300);
    }
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

// Add document-wide event listeners for expand/collapse functionality
document.addEventListener('DOMContentLoaded', () => {
    // ... existing DOMContentLoaded code here ...
    
    // Add event listeners for expand/collapse all prompts
    document.getElementById('expandAllPromptsBtn').addEventListener('click', expandAllPrompts);
    document.getElementById('collapseAllPromptsBtn').addEventListener('click', collapseAllPrompts);
});

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
        
        // Always start with prompts collapsed
        const isExpanded = false;
        
        // Get preview text - first line or truncated content
        let previewText = promptObj.text.split('\n')[0] || '';
        if (previewText.length > 40) {
            previewText = previewText.substring(0, 40) + '...';
        }
        
        // Create a dropdown of available models
        let modelDropdown = '<select class="prompt-model">';
        modelDropdown += '<option value="">Use Default Model</option>';
        
        modelConfig.availableModels.forEach(model => {
            const selected = promptObj.model === model ? 'selected' : '';
            modelDropdown += `<option value="${escapeHtml(model)}" ${selected}>${escapeHtml(model)}</option>`;
        });
        
        modelDropdown += '</select>';
        
        // Create the prompt card
        const promptCard = document.createElement('div');
        promptCard.className = 'prompt-card';
        promptCard.dataset.index = index;
        
        // Card header with collapse/expand functionality
        const cardHeader = document.createElement('div');
        cardHeader.className = 'prompt-card-header';
        cardHeader.innerHTML = `
            <div class="prompt-title">
                <div class="prompt-number">${index + 1}</div>
                <div class="prompt-preview">${escapeHtml(previewText)}</div>
            </div>
            <div class="prompt-actions">
                ${index > 0 ? '<button class="icon-btn move-up-prompt" title="Move Up"><span class="material-icons-outlined">arrow_upward</span></button>' : ''}
                ${index < prompts.length - 1 ? '<button class="icon-btn move-down-prompt" title="Move Down"><span class="material-icons-outlined">arrow_downward</span></button>' : ''}
                <button class="icon-btn danger remove-prompt" title="Remove"><span class="material-icons-outlined">delete</span></button>
                <button class="prompt-collapse-btn ${isExpanded ? 'expanded' : ''}">
                    <span class="material-icons-outlined">${isExpanded ? 'expand_less' : 'expand_more'}</span>
                </button>
            </div>
        `;
        
        // Card content - initially hidden or shown based on isExpanded
        const cardContent = document.createElement('div');
        cardContent.className = 'prompt-content';
        cardContent.style.display = isExpanded ? 'block' : 'none';
        cardContent.innerHTML = `
            <div class="prompt-editor">
                <textarea class="prompt-text" placeholder="Enter prompt text">${escapeHtml(promptObj.text)}</textarea>
                <div class="prompt-options">
                    <button class="btn small select-mcp-servers">
                        <span class="material-icons-outlined">dns</span>
                        MCP Servers: ${promptObj.mcpServerIds?.length || 0} enabled
                    </button>
                    <div class="model-selector">
                        <label>Model:</label>
                        ${modelDropdown}
                    </div>
                </div>
            </div>
        `;
        
        // Append parts to create the full card
        promptCard.appendChild(cardHeader);
        promptCard.appendChild(cardContent);
        container.appendChild(promptCard);
        
        // Add collapse/expand functionality
        cardHeader.querySelector('.prompt-collapse-btn').addEventListener('click', function(e) {
            e.stopPropagation();
            togglePromptCollapse(promptCard);
        });
        
        // Make the entire header clickable to toggle collapse
        cardHeader.addEventListener('click', function(e) {
            // Don't toggle if clicking on action buttons
            if (!e.target.closest('.prompt-actions button:not(.prompt-collapse-btn)')) {
                togglePromptCollapse(promptCard);
            }
        });
    });
    
    // Add event listeners for content
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
            
            // Update the preview text when content changes
            const card = input.closest('.prompt-card');
            const previewElement = card.querySelector('.prompt-preview');
            let previewText = input.value.split('\n')[0] || '';
            if (previewText.length > 40) {
                previewText = previewText.substring(0, 40) + '...';
            }
            previewElement.textContent = previewText;
            
            markAsUnsaved();
        });
    });
    
    // Add event listeners for action buttons
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
    
    document.querySelectorAll('.move-up-prompt').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const card = btn.closest('.prompt-card');
            const index = parseInt(card.dataset.index);
            movePrompt(index, 'up');
        });
    });
    
    document.querySelectorAll('.move-down-prompt').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const card = btn.closest('.prompt-card');
            const index = parseInt(card.dataset.index);
            movePrompt(index, 'down');
        });
    });
    
    document.querySelectorAll('.remove-prompt').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const card = btn.closest('.prompt-card');
            const index = parseInt(card.dataset.index);
            removePrompt(index);
        });
    });
}

// Toggle individual prompt collapse/expand
function togglePromptCollapse(promptCard) {
    const content = promptCard.querySelector('.prompt-content');
    const btn = promptCard.querySelector('.prompt-collapse-btn');
    const icon = btn.querySelector('.material-icons-outlined');
    
    if (content.style.display === 'none') {
        // Expand
        content.style.display = 'block';
        btn.classList.add('expanded');
        icon.textContent = 'expand_less';
    } else {
        // Collapse
        content.style.display = 'none';
        btn.classList.remove('expanded');
        icon.textContent = 'expand_more';
    }
}

// Expand all prompts function
function expandAllPrompts() {
    document.querySelectorAll('.prompt-card').forEach(card => {
        const content = card.querySelector('.prompt-content');
        const btn = card.querySelector('.prompt-collapse-btn');
        const icon = btn.querySelector('.material-icons-outlined');
        
        content.style.display = 'block';
        btn.classList.add('expanded');
        icon.textContent = 'expand_less';
    });
}

// Collapse all prompts function
function collapseAllPrompts() {
    document.querySelectorAll('.prompt-card').forEach(card => {
        const content = card.querySelector('.prompt-content');
        const btn = card.querySelector('.prompt-collapse-btn');
        const icon = btn.querySelector('.material-icons-outlined');
        
        content.style.display = 'none';
        btn.classList.remove('expanded');
        icon.textContent = 'expand_more';
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
    
    // Add a small delay to ensure WebSocket connection is established
    setTimeout(() => {
        // Trigger execution
        fetch(`/api/run/${activeConfigId}`, {
            method: 'POST'
        })
        .then(response => response.json())
        .then(data => {
            if (data.needsReconnect) {
                console.log('Server indicates WebSocket connection needs to be reestablished');
                // Wait a bit then retry connection and execution
                appendOutput('Reconnecting to server...', 'info');
                
                // Try to reconnect the socket
                if (socket) {
                    socket.close();
                }
                
                // Wait a moment and try again
                setTimeout(() => {
                    console.log('Attempting reconnection...');
                    connectSocket(activeConfigId);
                    
                    // After reconnection, try execution again
                    setTimeout(() => {
                        fetch(`/api/run/${activeConfigId}`, { method: 'POST' })
                        .catch(error => handleExecutionError(error));
                    }, 1000);
                }, 1000);
            }
        })
        .catch(error => handleExecutionError(error));
    }, 500);
    
    function handleExecutionError(error) {
        console.error('Error starting execution:', error);
        appendOutput('Error starting execution: ' + error.message, 'error');
        runBtn.disabled = false;
        runBtn.textContent = 'Run Now';
    }
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
    
    // Connection timeout and retry mechanism
    let retryCount = 0;
    const maxRetries = 3;
    
    const connectionTimeout = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
            console.error('WebSocket connection timeout');
            
            if (retryCount < maxRetries) {
                retryCount++;
                clearTimeout(connectionTimeout);
                
                // Update UI to show retry attempt
                updateConnectionStatus('connecting', `Connection timed out. Retry attempt ${retryCount}/${maxRetries}...`);
                appendOutput(`Connection attempt failed. Retrying (${retryCount}/${maxRetries})...\n`, 'warning');
                
                // Close the current socket if it exists
                if (socket) {
                    socket.close();
                }
                
                // Wait a moment before retrying
                setTimeout(() => {
                    // Create a new socket connection
                    socket = new WebSocket(`ws://${window.location.host}/ws/execution/${configId}`);
                    
                    // Reset event handlers for the new socket
                    setupSocketEventHandlers();
                }, 1000);
            } else {
                updateConnectionStatus('offline', 'Connection failed after retries');
                appendOutput('WebSocket connection failed after multiple attempts. Please check your network connection and server status.\n', 'error');
            }
        }
    }, 5000);
    
    // Setup event handlers in a separate function to avoid code duplication during retries
    function setupSocketEventHandlers() {
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
            
            // Send a heartbeat message to confirm connection is working
            try {
                socket.send(JSON.stringify({ type: 'heartbeat', configId }));
                console.log('Sent initial heartbeat to confirm connection');
            } catch (error) {
                console.error('Error sending heartbeat:', error);
            }
        };
    }
    
    // Initial setup of event handlers
    setupSocketEventHandlers();
    
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
                    // Use the messageType for styling if available
                    if (data.messageType) {
                        console.log('Message type for styling:', data.messageType);
                        appendOutput(data.content, data.messageType);
                    } else {
                        appendOutput(data.content);
                    }
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
        
        // Extract more detailed error information if possible
        let errorMessage = 'WebSocket error: Connection failed';
        if (error && error.message) {
            errorMessage = `WebSocket error: ${error.message}`;
        }
        
        appendOutput(errorMessage, 'error');
        appendOutput('Try refreshing the page or check if the server is running.', 'info');
        
        // Enable the run button again if it was disabled
        const runBtn = document.getElementById('runConfigBtn');
        if (runBtn && runBtn.disabled) {
            runBtn.disabled = false;
            runBtn.textContent = 'Run Now';
        }
    };
    
    socket.onclose = (event) => {
        clearTimeout(connectionTimeout);
        console.log('WebSocket closed with code:', event.code);
        updateConnectionStatus('offline', 'Disconnected');
        
        // Log close reason
        if (event.reason) {
            console.log('Close reason:', event.reason);
        }
        
        // Clear the status check interval
        if (statusCheckInterval) {
            clearInterval(statusCheckInterval);
            statusCheckInterval = null;
        }
        
        // If we had an abnormal closure, give the user instructions
        if (event.code !== 1000 && event.code !== 1001) {
            appendOutput('WebSocket connection closed unexpectedly. You may need to refresh the page.', 'warning');
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
    
    // Apply the appropriate class based on message type
    if (className) {
        // Apply the class - supports both our new message types and legacy classes
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
            <div class="mcp-server-description">${server.description || 'No description provided'}</div>
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
