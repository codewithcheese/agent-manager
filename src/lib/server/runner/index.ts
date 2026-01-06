/**
 * Runner Module
 *
 * Central module for managing agent sessions:
 * - Git mirrors and worktrees
 * - Docker containers
 * - GitHub integration
 * - Session lifecycle
 */

export { createGitModule, getGitModule, type GitModule, type GitMirrorInfo, type WorktreeInfo } from './git';
export { createGitHubModule, getGitHubModule, GitHubError, type GitHubModule, type GitHubRepo, type GitHubPR, type GitHubUser, type GitHubUrls } from './github';
export { createDockerModule, getDockerModule, DockerError, type DockerModule, type ContainerConfig, type ContainerInfo } from './docker';
