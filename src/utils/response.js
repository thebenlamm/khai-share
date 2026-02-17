/**
 * Consistent API response envelope.
 */

function ok(data) {
  return { success: true, data };
}

function fail(message, statusCode = 500) {
  return { success: false, error: message };
}

/**
 * Express error handler that sanitizes error messages.
 * Logs the real error server-side, returns generic message to client.
 */
function errorHandler(res, error, context = '') {
  const prefix = context ? `[${context}] ` : '';
  console.error(`${prefix}Error:`, error);
  res.status(500).json(fail('Internal server error'));
}

module.exports = { ok, fail, errorHandler };
