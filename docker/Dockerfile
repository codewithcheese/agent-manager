# Agent Manager Sandbox Container
# Runs Claude Code CLI with streaming JSON for Agent Manager integration

FROM node:22-slim

# Install essential tools
RUN apt-get update && apt-get install -y \
    git \
    curl \
    jq \
    python3 \
    python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Create agent user
RUN useradd -m -s /bin/bash agent

# Create necessary directories
RUN mkdir -p /workspace /home/agent/.claude
RUN chown -R agent:agent /workspace /home/agent

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Install tsx for running TypeScript and ws for WebSocket
RUN npm install -g tsx

# Copy agent runner
COPY agent-runner.ts /home/agent/agent-runner.ts
RUN chown agent:agent /home/agent/agent-runner.ts

# Copy entrypoint script
COPY agent-entrypoint.sh /usr/local/bin/agent-entrypoint.sh
RUN chmod +x /usr/local/bin/agent-entrypoint.sh

# Install ws package for the agent runner
WORKDIR /home/agent
RUN npm init -y && npm install ws
RUN chown -R agent:agent /home/agent

# Switch to agent user
USER agent
WORKDIR /workspace

# Set up git config
RUN git config --global init.defaultBranch main \
    && git config --global user.email "agent@agent-manager.local" \
    && git config --global user.name "Agent Manager"

# Environment variables (set at runtime)
# AGENT_MANAGER_URL - WebSocket URL for manager connection
# SESSION_ID - Session UUID
# GH_TOKEN - GitHub token for push/PR operations
# AGENT_ROLE - implementer or orchestrator
# GOAL_PROMPT - Initial goal for the session
# CLAUDE_MODEL - Model to use (default: sonnet)
# SYSTEM_PROMPT - Custom system prompt (optional)

ENTRYPOINT ["/usr/local/bin/agent-entrypoint.sh"]
