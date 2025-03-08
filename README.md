# Maistro

A web-based automation tool for orchestrating and scheduling sequences of LLM interactions through the Goose CLI tool, with support for MCP server extensions.

## Overview

Maistro allows you to:
- Define multiple prompts (saved as individual .md files)
- Execute them in order, waiting for each response
- Schedule these "runs" ahead of time (via crontab)
- Configure and use MCP servers for extended functionality

Each configuration allows you to define:
- A name for the configuration
- Any number of prompts in sequence
- MCP server extensions for each prompt
- A schedule (daily, weekly, or monthly)

## Prerequisites

- Node.js and npm
- [Goose CLI tool](https://github.com/xyzabc/goose) (confirmed to work with v1.0.7+)
- Access to system crontab (for scheduling)

## Installation

1. Clone this repository:
```bash
git clone https://github.com/yourusername/maistro.git
cd maistro
```

2. Install dependencies:
```bash
npm install
```

3. Start the application:
```bash
npm start
```

4. Open your browser to http://localhost:3000

## Usage

### Creating a Configuration

1. Click "+ New Configuration"
2. Enter a name
3. Add prompts using the "Add Prompt" button
4. Optionally configure a schedule
5. Click "Save"

### Running a Configuration

1. Select a configuration from the list
2. Click "Run Now" in the execution panel
3. View real-time output in the terminal window

### Scheduling a Configuration

1. Select a configuration
2. Enable scheduling
3. Choose frequency (daily, weekly, monthly)
4. Set the time and day(s) as needed
5. Save the configuration

### Using MCP Server Extensions

[Model Context Protocol (MCP)](https://github.com/anthropics/anthropic-tools/tree/main/model-context-protocol) servers enable LLMs to interact with external systems and APIs. Maistro allows you to:

1. **Configure MCP Servers**:
   - Navigate to the "MCP Servers" tab
   - Click "+ New MCP Server"
   - Enter the server details:
     - Name: A descriptive name for the server
     - Command: The executable (e.g., `node`)
     - Arguments: The script path (e.g., `/path/to/server.js`)
     - Environment Variables: Any required API keys or configuration
   - Optionally set "Enable by default for new prompts"
   - Save the MCP server configuration

2. **Assign MCP Servers to Prompts**:
   - In the configuration editor, each prompt has an "MCP Servers" button
   - Click this button to open the server selection dialog
   - Check the servers you want to enable for this prompt
   - Click "Apply" to save your selection

When the prompt runs, Maistro will automatically include the selected MCP servers as `--with-extension` parameters to the Goose CLI, giving your prompts access to the tools and resources provided by those servers.

## Technical Details

Maistro uses:
- Node.js with Express for the backend
- WebSockets for real-time execution feedback
- File-based storage for configurations, prompts, and MCP server definitions
- Integration with Goose CLI's extension system for MCP servers
- System crontab for scheduling

## License

MIT
