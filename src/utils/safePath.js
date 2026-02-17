const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

/**
 * Resolve a path and validate it stays within the given base directory.
 * Throws if the resolved path escapes the base.
 */
function safePath(base, ...segments) {
  const resolvedBase = path.resolve(base);
  const resolved = path.resolve(resolvedBase, ...segments);
  if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
    throw new Error('Invalid path');
  }
  return resolved;
}

/**
 * Validate that a user-provided ID contains only safe characters.
 * Allows alphanumeric, hyphens, underscores, and dots.
 */
function safeId(id) {
  if (!id || typeof id !== 'string') {
    throw new Error('Invalid ID');
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
    throw new Error('Invalid ID');
  }
  return id;
}

module.exports = { safePath, safeId, PROJECT_ROOT };
