#!/bin/sh
set -e

# Create data directory if it doesn't exist
mkdir -p /app/data/prompts

# Start the application
exec node src/server.js
