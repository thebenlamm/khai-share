'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { ok, fail, errorHandler } = require('../src/utils/response');

describe('ok', () => {
  test('returns success true with data', () => {
    const result = ok({ id: 1, name: 'test' });
    assert.deepEqual(result, { success: true, data: { id: 1, name: 'test' } });
  });

  test('wraps string data', () => {
    const result = ok('hello');
    assert.deepEqual(result, { success: true, data: 'hello' });
  });

  test('wraps null data', () => {
    const result = ok(null);
    assert.deepEqual(result, { success: true, data: null });
  });

  test('wraps array data', () => {
    const result = ok([1, 2, 3]);
    assert.deepEqual(result, { success: true, data: [1, 2, 3] });
  });
});

describe('fail', () => {
  test('returns success false with error message', () => {
    const result = fail('Something went wrong');
    assert.deepEqual(result, { success: false, error: 'Something went wrong' });
  });

  test('does not include statusCode in response body', () => {
    const result = fail('Not found', 404);
    assert.equal(result.success, false);
    assert.equal(result.error, 'Not found');
    assert.equal(result.statusCode, undefined);
  });
});

describe('errorHandler', () => {
  test('sends 500 JSON response with generic message', () => {
    let sentStatus = null;
    let sentBody = null;

    const mockRes = {
      status(code) {
        sentStatus = code;
        return this;
      },
      json(body) {
        sentBody = body;
        return this;
      },
    };

    errorHandler(mockRes, new Error('db connection failed'), 'test-context');

    assert.equal(sentStatus, 500);
    assert.deepEqual(sentBody, { success: false, error: 'Internal server error' });
  });

  test('works without context string', () => {
    let sentStatus = null;
    let sentBody = null;

    const mockRes = {
      status(code) {
        sentStatus = code;
        return this;
      },
      json(body) {
        sentBody = body;
        return this;
      },
    };

    errorHandler(mockRes, new Error('something broke'));

    assert.equal(sentStatus, 500);
    assert.deepEqual(sentBody, { success: false, error: 'Internal server error' });
  });

  test('does not leak original error message to client', () => {
    let sentBody = null;

    const mockRes = {
      status() { return this; },
      json(body) { sentBody = body; return this; },
    };

    errorHandler(mockRes, new Error('SECRET_DB_PASSWORD leaked'));

    assert.equal(sentBody.error, 'Internal server error');
    assert.ok(!JSON.stringify(sentBody).includes('SECRET_DB_PASSWORD'));
  });
});
