#!/bin/bash
set -e

# Force immediate output
exec 1>&1

# This script runs the Maistro Docker container using docker-compose
# with support for custom volume configuration.

# Setup colored output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Navigate to the project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Configuration file path
CONFIG_FILE=".maistro-docker-config"

# Parse command line arguments
DETACHED=false
ENV_FILE=""
COMPOSE_FILE="docker-compose.yml"
SKIP_CONFIG=false
RESET_CONFIG=false

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --detached|-d) DETACHED=true ;;
        --env-file=*) ENV_FILE="--env-file=${1#*=}" ;;
        --compose-file=*) COMPOSE_FILE="${1#*=}" ;;
        --skip-config) SKIP_CONFIG=true ;;
        --reset-config) RESET_CONFIG=true ;;
        --help|-h)
            echo -e "${BOLD}Maistro Docker Runner${NC}"
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --detached, -d           Run container in detached mode"
            echo "  --env-file=FILE          Specify an environment file"
            echo "  --compose-file=FILE      Specify a custom docker-compose file"
            echo "  --skip-config            Skip configuration prompts"
            echo "  --reset-config           Reset configuration and prompt again"
            echo "  --help, -h               Show this help message"
            echo ""
            echo "Volume Configuration:"
            echo "  This script allows you to choose between Docker-managed volumes"
            echo "  or a custom host directory for persistent configuration."
            exit 0
            ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

# Function to prompt user for input with a default value
prompt_with_default() {
    local prompt=$1
    local default=$2
    local response

    echo -en "${prompt} [${default}]: "
    read response
    echo "${response:-$default}"
}

# Function to create a temporary docker-compose override file
create_compose_override() {
    local volume_type=$1
    local host_path=$2
    local override_file="docker-compose.override.yml"

    if [ "$volume_type" = "host" ]; then
        # Create host directory if it doesn't exist
        mkdir -p "$host_path"
        
        # Create override file for host volume
        cat > "$override_file" <<EOL
version: '3.8'

services:
  maistro:
    volumes:
      - ${host_path}:/app/data
EOL
    else
        # Create override file for named volume (or remove if exists)
        if [ -f "$override_file" ]; then
            rm "$override_file"
        fi
    fi
}

# Function to configure volume settings
configure_volumes() {
    echo -e "\n${BOLD}Maistro Docker Configuration${NC}"
    echo -e "This will configure how Maistro stores its data.\n"
    
    echo -e "${BOLD}Volume Configuration Options:${NC}"
    echo "1) Docker-managed volume (recommended, easier to manage)"
    echo "2) Custom host directory (advanced, direct access to files)"
    echo ""
    
    local choice
    while true; do
        echo -n "Select option [1]: "
        read choice
        choice=${choice:-1}
        
        if [ "$choice" = "1" ]; then
            echo -e "\n${GREEN}Using Docker-managed volume${NC}"
            echo "VOLUME_TYPE=docker" > "$CONFIG_FILE"
            break
        elif [ "$choice" = "2" ]; then
            echo -e "\n${YELLOW}Using custom host directory${NC}"
            
            # Get host directory path
            local default_path="$HOME/.maistro-data"
            echo -n "Enter host directory path [$default_path]: "
            read host_path
            host_path=${host_path:-$default_path}
            
            # Save configuration
            echo "VOLUME_TYPE=host" > "$CONFIG_FILE"
            echo "HOST_PATH=\"$host_path\"" >> "$CONFIG_FILE"
            
            echo -e "\n${GREEN}Configuration saved.${NC}"
            echo "Data will be stored in: $host_path"
            break
        else
            echo -e "${YELLOW}Invalid option. Please select 1 or 2.${NC}"
        fi
    done
}

# Check if we should reset configuration
if [ "$RESET_CONFIG" = true ]; then
    if [ -f "$CONFIG_FILE" ]; then
        rm "$CONFIG_FILE"
        echo -e "${YELLOW}Configuration reset.${NC}"
    fi
fi

# Check if configuration exists or if we should skip configuration
if [ ! -f "$CONFIG_FILE" ] && [ "$SKIP_CONFIG" = false ]; then
    configure_volumes
fi

# Load configuration
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
else
    # Default to docker volume if no config
    VOLUME_TYPE="docker"
fi

# Create docker-compose override based on configuration
if [ "$VOLUME_TYPE" = "host" ]; then
    # Remove any quotes from the path
    HOST_PATH=$(echo $HOST_PATH | sed 's/^"//;s/"$//')
    echo -e "${BLUE}Using host directory for data: ${HOST_PATH}${NC}"
    create_compose_override "host" "$HOST_PATH"
else
    echo -e "${BLUE}Using Docker-managed volume for data${NC}"
    create_compose_override "docker"
fi

# Determine if we should run in detached mode
DETACH_FLAG=""
if [ "$DETACHED" = true ]; then
    DETACH_FLAG="-d"
    echo "Running in detached mode"
fi

# Run the container using docker-compose
echo -e "\n${BOLD}Starting Maistro container...${NC}"

docker-compose $ENV_FILE up $DETACH_FLAG --build

if [ "$DETACHED" = true ]; then
    echo -e "\n${GREEN}Container started in background.${NC}"
    echo "To view logs: docker-compose logs -f"
    echo "To stop: docker-compose down"
else
    echo -e "\n${GREEN}Container stopped.${NC}"
fi
