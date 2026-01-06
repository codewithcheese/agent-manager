#!/bin/bash
set -e

echo "[Agent] Starting agent session..."
echo "[Agent] Session ID: $SESSION_ID"
echo "[Agent] Role: $AGENT_ROLE"
echo "[Agent] Manager URL: $AGENT_MANAGER_URL"

# Configure git credentials for GitHub operations
if [ -n "$GH_TOKEN" ]; then
    echo "[Agent] Configuring git credentials..."

    # Set up credential helper to use the token
    git config --global credential.helper "!f() { echo \"username=x-access-token\"; echo \"password=$GH_TOKEN\"; }; f"

    # Configure gh CLI
    echo "$GH_TOKEN" | gh auth login --with-token 2>/dev/null || true
fi

# Start the WebSocket client in the background
echo "[Agent] Starting WebSocket client..."
node /home/agent/agent-ws-client.js &
WS_PID=$!

# Wait a moment for WebSocket connection
sleep 2

# Check if WebSocket client is running
if ! kill -0 $WS_PID 2>/dev/null; then
    echo "[Agent] Failed to start WebSocket client"
    exit 1
fi

echo "[Agent] WebSocket client started (PID: $WS_PID)"

# Build system message
SYSTEM_MSG="You are an AI coding assistant working in a sandboxed environment.

Your workspace is at /workspace, which is a git worktree for a specific branch.

Guidelines:
- You have full access to the filesystem within /workspace
- You can run any CLI commands needed for your task
- Make commits and push when you complete meaningful units of work
- Stop and wait for user input after completing a task or when you need clarification

Git workflow:
- Your work is on a dedicated branch
- Commit often with clear messages
- Push when you're done with a task so the user can review"

if [ "$AGENT_ROLE" = "orchestrator" ]; then
    SYSTEM_MSG="$SYSTEM_MSG

As the Orchestrator:
- You coordinate work across multiple agent sessions
- You receive summaries of other sessions' activities
- Help plan and organize implementation efforts
- Suggest task breakdowns and session coordination strategies"
else
    SYSTEM_MSG="$SYSTEM_MSG

As an Implementer:
- Focus on writing code and making changes
- Follow the repository's conventions (check CLAUDE.md if available)
- Run tests and ensure your changes work
- Create clear, focused commits"
fi

# Check if CLAUDE.md exists and append to system message
if [ -f "/workspace/CLAUDE.md" ]; then
    echo "[Agent] Found CLAUDE.md, including in system context"
    CLAUDE_MD=$(cat /workspace/CLAUDE.md)
    SYSTEM_MSG="$SYSTEM_MSG

=== Repository Guidelines (CLAUDE.md) ===
$CLAUDE_MD"
fi

# Create a named pipe for communication
PIPE_DIR="/tmp/agent-$$"
mkdir -p "$PIPE_DIR"
INPUT_PIPE="$PIPE_DIR/input"
OUTPUT_PIPE="$PIPE_DIR/output"
mkfifo "$INPUT_PIPE"
mkfifo "$OUTPUT_PIPE"

export AGENT_INPUT_PIPE="$INPUT_PIPE"
export AGENT_OUTPUT_PIPE="$OUTPUT_PIPE"

echo "[Agent] Starting Claude Code..."

# Start Claude Code with the system message
# The --print flag outputs messages as JSON for processing
# Note: This command may vary based on the actual Claude Code CLI
if command -v claude &> /dev/null; then
    if [ -n "$GOAL_PROMPT" ]; then
        echo "$GOAL_PROMPT" | claude --system "$SYSTEM_MSG" --print 2>&1 | tee "$OUTPUT_PIPE" &
    else
        claude --system "$SYSTEM_MSG" --print 2>&1 | tee "$OUTPUT_PIPE" &
    fi
    CLAUDE_PID=$!
else
    echo "[Agent] Claude Code CLI not found, running in mock mode"
    # Mock mode for testing
    echo '{"type":"text","text":"Claude Code is not installed. This is a mock session."}'

    # Keep running to accept messages
    while true; do
        if [ -p "$INPUT_PIPE" ]; then
            read -t 1 line < "$INPUT_PIPE" 2>/dev/null || true
            if [ -n "$line" ]; then
                echo "[Agent] Received: $line"
                echo '{"type":"text","text":"Received your message: '"$line"'"}'
            fi
        fi
        sleep 1
    done &
    CLAUDE_PID=$!
fi

echo "[Agent] Claude Code started (PID: $CLAUDE_PID)"

# Wait for Claude Code to finish or be interrupted
wait $CLAUDE_PID
EXIT_CODE=$?

echo "[Agent] Claude Code exited with code: $EXIT_CODE"

# Cleanup
kill $WS_PID 2>/dev/null || true
rm -rf "$PIPE_DIR"

exit $EXIT_CODE
