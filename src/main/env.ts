export function clearInheritedSessionMarker(env: NodeJS.ProcessEnv): void {
  delete env.CLAUDE_CODE_CHILD_SESSION
}
