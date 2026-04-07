'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JobStore, runAsyncJob } = require('../src/utils/jobStore');

// Helper: wait for the fire-and-forget IIFE to settle
async function tick(n = 3) {
  for (let i = 0; i < n; i++) {
    await new Promise(resolve => setImmediate(resolve));
  }
}

describe('JobStore', () => {
  test('create and get a job', () => {
    const store = new JobStore();
    store.create('j1', { status: 'running', type: 'test' });
    const job = store.get('j1');
    assert.equal(job.status, 'running');
    assert.equal(job.type, 'test');
  });

  test('get returns null for missing job', () => {
    const store = new JobStore();
    assert.equal(store.get('nope'), null);
  });

  test('has returns true for existing job', () => {
    const store = new JobStore();
    store.create('j2', {});
    assert.ok(store.has('j2'));
  });

  test('delete removes a job', () => {
    const store = new JobStore();
    store.create('j3', {});
    store.delete('j3');
    assert.equal(store.get('j3'), null);
  });

  test('list returns all jobs', () => {
    const store = new JobStore();
    store.create('a', { type: 'one' });
    store.create('b', { type: 'two' });
    const list = store.list();
    assert.equal(list.length, 2);
  });
});

describe('runAsyncJob', () => {
  test('is exported as a function', () => {
    assert.equal(typeof runAsyncJob, 'function');
  });

  test('SUCCESS: sets status=completed, stores results, sets endTime', async () => {
    const store = new JobStore();
    runAsyncJob(store, 'job1', { type: 'test', site: 'example.com' }, async () => ({ pages: 5 }), {});
    await tick();

    const job = store.get('job1');
    assert.ok(job, 'job should exist');
    assert.equal(job.status, 'completed');
    assert.deepEqual(job.results, { pages: 5 });
    assert.ok(typeof job.endTime === 'string', 'endTime should be a string');
    assert.ok(!isNaN(Date.parse(job.endTime)), 'endTime should be a valid ISO date');
  });

  test('SUCCESS: initialData fields present on job after create', async () => {
    const store = new JobStore();
    runAsyncJob(store, 'job2', { type: 'test', site: 'example.com', startTime: '2026-01-01' }, async () => ({}), {});
    await tick();

    const job = store.get('job2');
    assert.ok(job, 'job should exist');
    assert.equal(job.type, 'test');
    assert.equal(job.site, 'example.com');
    assert.equal(job.startTime, '2026-01-01');
  });

  test('ERROR: sets status=error, error=err.message, sets endTime', async () => {
    const store = new JobStore();
    runAsyncJob(store, 'job3', { type: 'test' }, async () => { throw new Error('boom'); }, {});
    await tick();

    const job = store.get('job3');
    assert.ok(job, 'job should exist');
    assert.equal(job.status, 'error');
    assert.equal(job.error, 'boom');
    assert.ok(typeof job.endTime === 'string', 'endTime should be a string');
    assert.ok(!isNaN(Date.parse(job.endTime)), 'endTime should be a valid ISO date');
  });

  test('NO WEBHOOK: deliverWebhook not called when no webhookUrl', async () => {
    const store = new JobStore();
    let webhookCallCount = 0;
    const fakeDeliver = async () => { webhookCallCount++; return { status: 'delivered' }; };

    runAsyncJob(store, 'job4', { type: 'test' }, async () => ({ ok: true }), {
      _deliverWebhook: fakeDeliver,
    });
    await tick();

    assert.equal(webhookCallCount, 0);
  });

  test('WEBHOOK SUCCESS: deliverWebhook called with results when webhookUrl provided and workFn succeeds', async () => {
    const store = new JobStore();
    const calls = [];
    const fakeDeliver = async (url, payload, opts) => {
      calls.push({ url, payload, opts });
      return { status: 'delivered', attempts: 1 };
    };

    runAsyncJob(
      store, 'job5', { type: 'test' },
      async () => ({ pages: 3 }),
      { webhookUrl: 'https://example.com/hook', operationType: 'test', operationId: 'job5', _deliverWebhook: fakeDeliver }
    );
    await tick();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://example.com/hook');
    assert.deepEqual(calls[0].payload, { pages: 3 });
    assert.equal(calls[0].opts.operationType, 'test');
    assert.equal(calls[0].opts.operationId, 'job5');
  });

  test('WEBHOOK ERROR: deliverWebhook called with error payload when workFn throws', async () => {
    const store = new JobStore();
    const calls = [];
    const fakeDeliver = async (url, payload, opts) => {
      calls.push({ url, payload, opts });
      return { status: 'delivered', attempts: 1 };
    };

    runAsyncJob(
      store, 'job6', { type: 'test' },
      async () => { throw new Error('boom'); },
      { webhookUrl: 'https://example.com/hook', operationType: 'test', operationId: 'job6', _deliverWebhook: fakeDeliver }
    );
    await tick();

    assert.equal(calls.length, 1);
    const { payload } = calls[0];
    assert.equal(payload.status, 'error');
    assert.equal(payload.error, 'boom');
  });

  test('WEBHOOK RESULT: webhook delivery result stored in job.webhook field', async () => {
    const store = new JobStore();
    const fakeDeliver = async () => ({ status: 'delivered', attempts: 1 });

    runAsyncJob(
      store, 'job7', { type: 'test' },
      async () => ({ ok: true }),
      { webhookUrl: 'https://example.com/hook', _deliverWebhook: fakeDeliver }
    );
    await tick();

    const job = store.get('job7');
    assert.ok(job.webhook, 'job.webhook should be set');
    assert.equal(job.webhook.status, 'delivered');
  });

  test('EVICTION GUARD: no crash and no mutation if job evicted during work', async () => {
    const store = new JobStore();
    let resolveBlocker;
    const blocker = new Promise(r => { resolveBlocker = r; });

    runAsyncJob(store, 'job8', { type: 'test' }, async () => {
      store.delete('job8');
      await blocker;
      return { pages: 1 };
    }, {});

    // Let IIFE start, then unblock workFn
    await tick(1);
    resolveBlocker();
    await tick();

    // No crash; job is gone
    assert.equal(store.get('job8'), null);
  });
});
