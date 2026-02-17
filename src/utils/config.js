const fs = require('fs');
const path = require('path');

const CRED_PATH = path.join(__dirname, '../../config/credentials.json');

let _cachedCredentials = null;
let _cachedMtime = null;

/**
 * Load credentials from config/credentials.json.
 * Caches the result and invalidates when the file's mtime changes.
 */
function loadCredentials() {
  if (!fs.existsSync(CRED_PATH)) {
    throw new Error('credentials.json not found. Copy credentials.example.json and fill in your credentials.');
  }

  const stat = fs.statSync(CRED_PATH);
  const mtime = stat.mtimeMs;

  if (_cachedCredentials && _cachedMtime === mtime) {
    return _cachedCredentials;
  }

  _cachedCredentials = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
  _cachedMtime = mtime;
  return _cachedCredentials;
}

/**
 * Check if credentials file exists (without loading it).
 */
function credentialsExist() {
  return fs.existsSync(CRED_PATH);
}

module.exports = { loadCredentials, credentialsExist };
