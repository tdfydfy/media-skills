import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cleanupRun } from './cleanup.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

test('direct video frames match the legacy sequence with parallel capture and blank reuse', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivh-direct-test-'));
  const legacy = path.join(root, 'legacy');
  const direct = path.join(root, 'direct');
  const fixture = path.join(here, 'fixtures', 'direct-frames.html');
  const run = (script, args) => execFileSync(process.execPath, [path.join(here, script), fixture, ...args], {
    encoding: 'utf8', timeout: 90000, windowsHide: true,
  });
  const common = ['--step', '0.1', '--scale', '0.2', '--workers', '2'];
  try {
    run('shoot.mjs', [...common, '--frames', '--out', legacy]);
    const log = run('render.mjs', [...common, '--keep-frames', '--out', direct]);
    assert.match(log, /并行抽帧 2 路/);
    assert.match(log, /空档复用/);
    const work = path.join(direct, '.work');
    const scratch = path.join(work, fs.readdirSync(work)[0]);
    assert.equal(fs.existsSync(path.join(scratch, 'seq')), false);
    const names = fs.readdirSync(path.join(legacy, 'seq')).filter(n => n.endsWith('.png')).sort();
    assert.ok(names.length > 30);
    const distinct = new Set();
    for (const name of names) {
      const expected = fs.readFileSync(path.join(legacy, 'seq', name));
      assert.deepEqual(fs.readFileSync(path.join(scratch, name)), expected, name);
      distinct.add(expected.toString('base64'));
    }
    assert.ok(distinct.size > 5, 'fixture must contain moving content as well as blank frames');
    assert.equal(await cleanupRun(scratch), true);
    assert.ok(fs.statSync(path.join(direct, 'direct-frames-alpha.mov')).size > 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
