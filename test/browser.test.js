'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { createBrowser, closeAllBrowsers, DEFAULT_ARGS, DEFAULT_VIEWPORT } = require('../src/utils/browser');

describe('DEFAULT_ARGS', () => {
  test('is an array', () => {
    assert.ok(Array.isArray(DEFAULT_ARGS));
  });

  test('includes --disable-dev-shm-usage', () => {
    assert.ok(DEFAULT_ARGS.includes('--disable-dev-shm-usage'));
  });

  test('includes --disable-gpu', () => {
    assert.ok(DEFAULT_ARGS.includes('--disable-gpu'));
  });
});

describe('DEFAULT_VIEWPORT', () => {
  test('has width property', () => {
    assert.equal(typeof DEFAULT_VIEWPORT.width, 'number');
    assert.equal(DEFAULT_VIEWPORT.width, 1920);
  });

  test('has height property', () => {
    assert.equal(typeof DEFAULT_VIEWPORT.height, 'number');
    assert.equal(DEFAULT_VIEWPORT.height, 1080);
  });
});

describe('closeAllBrowsers', () => {
  test('is a function', () => {
    assert.equal(typeof closeAllBrowsers, 'function');
  });

  test('returns a promise when called with no active browsers', async () => {
    const result = closeAllBrowsers();
    assert.ok(result instanceof Promise);
    await result; // should resolve without error
  });
});

describe('createBrowser', () => {
  test('is a function', () => {
    assert.equal(typeof createBrowser, 'function');
  });
});
