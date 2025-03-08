# Maistro

A web-based automation tool for orchestrating and scheduling sequences of LLM interactions through the Goose CLI tool.

## Overview

Maistro allows you to:
- Define multiple prompts (saved as individual .md files)
- Execute them in order, waiting for each response
- Schedule these "runs" ahead of time (via crontab)

Each configuration allows you to define:
- A name for the configuration
- Any number of prompts in sequence
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

## Technical Details

Maistro uses:
- Node.js with Express for the backend
- WebSockets for real-time execution feedback
- File-based storage for configurations and prompts
- System crontab for scheduling

## License

MIT
