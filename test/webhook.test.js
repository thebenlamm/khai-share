'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { deliverWebhook, validateWebhookUrl } = require('../src/utils/webhook');

describe('validateWebhookUrl', () => {
  test('rejects file:// protocol', async () => {
    await assert.rejects(
      () => validateWebhookUrl('file:///etc/passwd'),
      /must use http or https protocol/
    );
  });

  test('rejects ftp:// protocol', async () => {
    await assert.rejects(
      () => validateWebhookUrl('ftp://example.com/webhook'),
      /must use http or https protocol/
    );
  });

  test('rejects IPv6 loopback http://[::1]/', async () => {
    await assert.rejects(
      () => validateWebhookUrl('http://[::1]/webhook'),
      /private|reserved|resolve/
    );
  });

  test('is exported as a function', () => {
    assert.equal(typeof validateWebhookUrl, 'function');
  });
});

describe('deliverWebhook', () => {
  test('is exported as a function', () => {
    assert.equal(typeof deliverWebhook, 'function');
  });

  test('rejects invalid protocol before attempting delivery', async () => {
    await assert.rejects(
      () => deliverWebhook('ftp://example.com/hook', { data: 'test' }),
      /must use http or https protocol/
    );
  });
});
