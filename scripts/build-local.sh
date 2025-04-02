#!/bin/bash
set -e

# Force immediate output
exec 1>&1

# This script provides a lightweight local development build pipeline
# that builds Docker images for both ARM and AMD64 architectures.

# Parse command line arguments
VERBOSE=false
MULTI_ARCH=false
# Default to current platform if not multi-arch
PLATFORMS="linux/$(uname -m | sed 's/x86_64/amd64/' | sed 's/aarch64/arm64/')"
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --verbose) VERBOSE=true ;;
        --multi-arch) MULTI_ARCH=true; PLATFORMS="linux/amd64,linux/arm64" ;;
        --platform=*) PLATFORMS="${1#*=}"; MULTI_ARCH=false ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

# Create temp directory for logs if it doesn't exist
TEMP_DIR="/tmp/maistro-docker"
mkdir -p "$TEMP_DIR"

# Setup colored output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
CHECK_MARK="✓"
X_MARK="✗"
WARNING_MARK="⚠"

# Function to check log file size and show warning if needed
check_log_size() {
    local log_file=$1
    if [ -f "$log_file" ]; then
        local line_count=$(wc -l < "$log_file")
        if [ $line_count -gt 100 ]; then
            echo -e "${YELLOW}${WARNING_MARK} Large log file detected ($line_count lines)${NC}"
            echo "  Tips for viewing large logs:"
            echo "  • head -n 20 $log_file     (view first 20 lines)"
            echo "  • tail -n 20 $log_file     (view last 20 lines)"
            echo "  • less $log_file           (scroll through file)"
            echo "  • grep 'error' $log_file   (search for specific terms)"
        fi
    fi
}

# Function to run a step and show its status
run_step() {
    local step_name=$1
    local log_file="$TEMP_DIR/$2.log"
    local command=$3
    
    echo -n "→ $step_name... "
    
    if [ "$VERBOSE" = true ]; then
        if eval "$command"; then
            echo -e "${GREEN}${CHECK_MARK} Success${NC}"
            return 0
        else
            echo -e "${RED}${X_MARK} Failed${NC}"
            return 1
        fi
    else
        if eval "$command > '$log_file' 2>&1"; then
            echo -e "${GREEN}${CHECK_MARK} Success${NC} (log: $log_file)"
            check_log_size "$log_file"
            return 0
        else
            echo -e "${RED}${X_MARK} Failed${NC} (see details in $log_file)"
            check_log_size "$log_file"
            return 1
        fi
    fi
}

# Install dependencies
run_step "Installing dependencies" "npm-install" "npm install" || exit 1

# Build Docker image
echo "→ Building Docker images for platforms: $PLATFORMS"
DOCKER_LOG="$TEMP_DIR/docker-build.log"

# Determine build command based on multi-arch flag
if [ "$MULTI_ARCH" = true ]; then
    echo "Building multi-architecture images (requires Docker registry)"
    BUILD_CMD="docker buildx build --platform $PLATFORMS -t maistro:local --output type=image,push=false ."
else
    # For single platform, use standard docker build which is more reliable
    echo "Building for platform: $PLATFORMS"
    if [[ "$PLATFORMS" == *"arm64"* ]]; then
        BUILD_CMD="docker build --platform linux/arm64 -t maistro:local ."
    else
        BUILD_CMD="docker build --platform linux/amd64 -t maistro:local ."
    fi
fi

# Execute the build command
if [ "$VERBOSE" = true ]; then
    if eval "$BUILD_CMD"; then
        echo -e "${GREEN}${CHECK_MARK} Docker build successful${NC}"
    else
        echo -e "${RED}${X_MARK} Docker build failed${NC}"
        exit 1
    fi
else
    if eval "$BUILD_CMD > '$DOCKER_LOG' 2>&1"; then
        echo -e "${GREEN}${CHECK_MARK} Docker build successful${NC} (log: $DOCKER_LOG)"
        check_log_size "$DOCKER_LOG"
    else
        echo -e "${RED}${X_MARK} Docker build failed${NC} (see details in $DOCKER_LOG)"
        check_log_size "$DOCKER_LOG"
        exit 1
    fi
fi

echo -e "\n${GREEN}Build complete!${NC} Image tagged as maistro:local"
