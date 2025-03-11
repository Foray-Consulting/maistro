// This is the beginning of the fixed file - just replacing the specific function
// Global state and other functions remain the same

function copyConfig(configId) {
    // Find the source configuration
    const configToCopy = configs.find(c => c.id === configId);
    if (!configToCopy) return;
    
    // Ask user for a name for the copy
    const defaultName = `Copy of ${configToCopy.name}`;
    const newName = prompt('Name for the copy:', defaultName);
    
    if (newName === null) return; // User canceled
    
    // Call API to copy the configuration
    fetch(`/api/configs/${configId}/copy`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newName })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to copy configuration');
        }
        return response.json();
    })
    .then(data => {
        // Add the new config to the local array
        configs.push(data.config);
        
        // Refresh the configs list
        renderConfigsList();
        
        // Optionally, select the new configuration for editing
        selectConfig(data.config.id);
    })
    .catch(error => {
        console.error('Error copying configuration:', error);
        alert('Failed to copy configuration: ' + error.message);
    });
}
