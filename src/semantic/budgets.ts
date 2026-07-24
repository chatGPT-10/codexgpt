export const DEFAULT_SEMANTIC_BUDGETS = Object.freeze({
  maxFileBytes: 2 * 1024 * 1024,
  maxWorkspaceFiles: 5_000,
  maxWorkspaceBytes: 64 * 1024 * 1024,
  maxResults: 200,
  maxPreviewChars: 24_000,
  maxWorkerResponseBytes: 2 * 1024 * 1024,
  workerTimeoutMs: 5_000,
  maxQueue: 8
});
