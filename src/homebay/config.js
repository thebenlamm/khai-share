'use strict';

const { loadCredentials } = require('../utils/config');

const SITE_KEY = 'homebay-staging';
const REQUIRED_ROLES = ['admin', 'agent', 'seller', 'buyer'];

/**
 * Load the homebay-staging site config from credentials.json.
 *
 * @returns {{ baseUrl: string, loginUrl: string, accounts: Object }}
 * @throws {Error} If homebay-staging is not in credentials.json
 */
function getHomeBayConfig() {
  const credentials = loadCredentials();
  const site = credentials.sites && credentials.sites[SITE_KEY];

  if (!site) {
    throw new Error(
      `${SITE_KEY} not found in credentials.json — see credentials.example.json`
    );
  }

  return site;
}

/**
 * Validate that all 4 HomeBay role credentials are present and non-empty.
 *
 * @returns {{ baseUrl: string, loginUrl: string, accounts: Object }}
 * @throws {Error} If any role is missing or has empty username/password
 */
function validateHomeBayCredentials() {
  const config = getHomeBayConfig();

  for (const role of REQUIRED_ROLES) {
    const account = config.accounts && config.accounts[role];

    if (!account) {
      throw new Error(
        `Missing HomeBay credentials for role: ${role} — need username and password`
      );
    }

    if (!account.username || typeof account.username !== 'string' || account.username.trim() === '') {
      throw new Error(
        `Missing HomeBay credentials for role: ${role} — need username and password`
      );
    }

    if (!account.password || typeof account.password !== 'string' || account.password.trim() === '') {
      throw new Error(
        `Missing HomeBay credentials for role: ${role} — need username and password`
      );
    }
  }

  console.log('[Khai] HomeBay credentials validated: all 4 roles configured');
  return config;
}

/**
 * Check whether the HomeBay staging URL is reachable.
 * Run once at the start of a test run, not per-navigation.
 *
 * @param {string} baseUrl - The base URL to check (e.g. https://staging.homebay.com)
 * @returns {Promise<{ reachable: boolean, status?: number, latencyMs: number, error?: string }>}
 */
async function checkHomeBayHealth(baseUrl) {
  const startMs = Date.now();

  let fetch;
  try {
    const nodeFetch = await import('node-fetch');
    fetch = nodeFetch.default;
  } catch (err) {
    return {
      reachable: false,
      latencyMs: Date.now() - startMs,
      error: `node-fetch not available: ${err.message}`,
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(baseUrl, {
      method: 'HEAD',
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const latencyMs = Date.now() - startMs;

    return {
      reachable: true,
      status: response.status,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Date.now() - startMs;
    return {
      reachable: false,
      latencyMs,
      error: err.message,
    };
  }
}

module.exports = { getHomeBayConfig, validateHomeBayCredentials, checkHomeBayHealth };
