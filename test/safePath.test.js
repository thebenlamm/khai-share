'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { safePath, safeId } = require('../src/utils/safePath');

describe('safePath', () => {
  test('rejects ../ traversal', () => {
    assert.throws(() => safePath('/base/dir', '../etc/passwd'), /Invalid path/);
  });

  test('rejects nested ../ traversal', () => {
    assert.throws(() => safePath('/base/dir', 'sub/../../etc/passwd'), /Invalid path/);
  });

  test('rejects absolute path outside base', () => {
    assert.throws(() => safePath('/base/dir', '/etc/passwd'), /Invalid path/);
  });

  test('accepts valid relative path', () => {
    const result = safePath('/base/dir', 'sub', 'file.txt');
    assert.equal(result, path.resolve('/base/dir', 'sub', 'file.txt'));
  });

  test('accepts path that resolves to base itself', () => {
    const result = safePath('/base/dir');
    assert.equal(result, path.resolve('/base/dir'));
  });

  test('accepts nested valid path', () => {
    const result = safePath('/base/dir', 'a/b/c.json');
    assert.equal(result, path.resolve('/base/dir', 'a/b/c.json'));
  });
});

describe('safeId', () => {
  test('rejects string with /', () => {
    assert.throws(() => safeId('foo/bar'), /Invalid ID/);
  });

  test('rejects string with backslash', () => {
    assert.throws(() => safeId('foo\\bar'), /Invalid ID/);
  });

  test('accepts .. since dots are valid characters', () => {
    // safeId allows dots — path traversal prevention is safePath's job
    assert.equal(safeId('..'), '..');
  });

  test('rejects empty string', () => {
    assert.throws(() => safeId(''), /Invalid ID/);
  });

  test('rejects null', () => {
    assert.throws(() => safeId(null), /Invalid ID/);
  });

  test('rejects undefined', () => {
    assert.throws(() => safeId(undefined), /Invalid ID/);
  });

  test('accepts alphanumeric ID', () => {
    assert.equal(safeId('abc123'), 'abc123');
  });

  test('accepts ID with dashes', () => {
    assert.equal(safeId('my-test-id'), 'my-test-id');
  });

  test('accepts ID with underscores', () => {
    assert.equal(safeId('my_test_id'), 'my_test_id');
  });

  test('accepts ID with dots', () => {
    assert.equal(safeId('v1.2.3'), 'v1.2.3');
  });

  test('accepts mixed valid characters', () => {
    assert.equal(safeId('test-1_v2.0'), 'test-1_v2.0');
  });
});
