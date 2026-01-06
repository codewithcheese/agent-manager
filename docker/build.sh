#!/bin/bash
# Build the Agent Manager sandbox container

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

IMAGE_NAME="${IMAGE_NAME:-agent-manager-sandbox}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

echo "Building $IMAGE_NAME:$IMAGE_TAG..."

docker build -t "$IMAGE_NAME:$IMAGE_TAG" .

echo "Build complete!"
echo "Run with: docker run -it --rm $IMAGE_NAME:$IMAGE_TAG"
