#!/bin/bash
set -e

echo "[Agent] Starting agent session..."
echo "[Agent] Session ID: $SESSION_ID"
echo "[Agent] Role: ${AGENT_ROLE:-implementer}"
echo "[Agent] Manager URL: $AGENT_MANAGER_URL"

# Configure git credentials for GitHub operations
if [ -n "$GH_TOKEN" ]; then
    echo "[Agent] Configuring git credentials..."

    # Set up credential helper to use the token
    git config --global credential.helper "!f() { echo \"username=x-access-token\"; echo \"password=$GH_TOKEN\"; }; f"

    # Configure gh CLI
    echo "$GH_TOKEN" | gh auth login --with-token 2>/dev/null || true
fi

# Check if CLAUDE.md exists in workspace and set system prompt
if [ -f "/workspace/CLAUDE.md" ]; then
    echo "[Agent] Found CLAUDE.md, including in system context"

    # Read CLAUDE.md and append to system prompt if not already set
    if [ -z "$SYSTEM_PROMPT" ]; then
        CLAUDE_MD=$(cat /workspace/CLAUDE.md)
        export SYSTEM_PROMPT="You are an AI coding assistant working in a sandboxed environment.

Your workspace is at /workspace, which is a git worktree for a specific branch.

Guidelines:
- You have full access to the filesystem within /workspace
- You can run any CLI commands needed for your task
- Make commits and push when you complete meaningful units of work
- The session ID is: ${SESSION_ID}

=== Repository Guidelines (CLAUDE.md) ===
$CLAUDE_MD"
    fi
fi

# Verify Claude Code is available
if ! command -v claude &> /dev/null; then
    echo "[Agent] ERROR: Claude Code CLI not found"
    exit 1
fi

echo "[Agent] Claude Code CLI version: $(claude --version 2>/dev/null || echo 'unknown')"

# Run the TypeScript agent runner
echo "[Agent] Starting agent runner..."
cd /home/agent
exec npx tsx agent-runner.ts
