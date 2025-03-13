#!/bin/bash
set -e

# This script runs the Maistro Docker container using docker-compose
# for local development and testing.

# Parse command line arguments
DETACHED=false
ENV_FILE=""
COMPOSE_FILE="../docker-compose.yml"

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --detached|-d) DETACHED=true ;;
        --env-file=*) ENV_FILE="--env-file=${1#*=}" ;;
        --compose-file=*) COMPOSE_FILE="${1#*=}" ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

# Determine if we should run in detached mode
DETACH_FLAG=""
if [ "$DETACHED" = true ]; then
    DETACH_FLAG="-d"
    echo "Running in detached mode"
fi

# Navigate to the directory containing the docker-compose.yml file
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Run the container using docker-compose
echo "Starting Maistro container using docker-compose..."

docker-compose $ENV_FILE up $DETACH_FLAG --build

if [ "$DETACHED" = true ]; then
    echo "Container started in background. To view logs: docker-compose logs -f"
    echo "To stop: docker-compose down"
else
    echo "Container stopped."
fi
