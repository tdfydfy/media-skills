import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanupRun } from './cleanup.mjs';

test('cleanup removes only this run, preserving the movie and other runs', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivh-cleanup-test-'));
  const work = path.join(root, '.work');
  const run = path.join(work, 'run-target');
  fs.mkdirSync(path.join(run, 'seq'), { recursive: true });
  fs.mkdirSync(path.join(work, 'run-other'));
  fs.writeFileSync(path.join(root, 'script-alpha.mov'), 'delivered');
  fs.writeFileSync(path.join(run, 'blank.png'), 'blank');
  fs.linkSync(path.join(run, 'blank.png'), path.join(run, 'seq', 'frame-00001.png'));
  try {
    assert.equal(await cleanupRun(run), true);
    assert.equal(fs.existsSync(run), false);
    assert.equal(fs.readFileSync(path.join(root, 'script-alpha.mov'), 'utf8'), 'delivered');
    assert.equal(fs.existsSync(path.join(work, 'run-other')), true);
    assert.throws(() => cleanupRun(root), /Refusing/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('cleanup deadline returns failure without holding the caller open', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivh-cleanup-test-'));
  const run = path.join(root, '.work', 'run-timeout');
  fs.mkdirSync(run, { recursive: true });
  try {
    const start = Date.now();
    assert.equal(await cleanupRun(run, 1), false);
    assert.ok(Date.now() - start < 3000);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('cleanup handles nested frame sets and does not traverse directory links', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivh-cleanup-test-'));
  const run = path.join(root, '.work', 'run-frames');
  const outside = path.join(root, 'preserved');
  fs.mkdirSync(path.join(run, 'seq', 'nested'), { recursive: true });
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'keep.txt'), 'keep');
  fs.symlinkSync(outside, path.join(run, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  for (let i = 0; i < 500; i++) fs.writeFileSync(path.join(run, 'seq', 'nested', `${i}.png`), 'frame');
  try {
    assert.equal(await cleanupRun(run), true);
    assert.equal(fs.existsSync(run), false);
    assert.equal(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8'), 'keep');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
