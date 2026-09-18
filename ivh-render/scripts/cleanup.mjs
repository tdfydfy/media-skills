import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(import.meta.url);

// Only per-run scratch directories belong to this cleaner, never a delivery directory.
function validate(target) {
  const resolved = path.resolve(target);
  if (path.basename(path.dirname(resolved)) !== '.work' || !path.basename(resolved).startsWith('run-')) {
    throw new Error('Refusing to clean outside .work/run-*');
  }
  return resolved;
}

export function cleanupRun(target, timeoutMs = 15000, maxDurationMs = 120000) {
  const resolved = validate(target);
  const started = Date.now();
  console.log(`[cleanup] 开始清理临时文件（无进展 ${timeoutMs / 1000}s / 总上限 ${maxDurationMs / 1000}s）：${resolved}`);
  return new Promise(resolve => {
    const child = spawn(process.execPath, [HERE, '--remove', resolved], {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true,
    });
    let error = '', settled = false, removed = 0, current = '', timer;
    const finish = ok => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(deadline);
      clearInterval(progress);
      if (child.connected) child.disconnect();
      child.stderr.destroy();
      child.unref();
      console.log(ok ? '[cleanup] 临时文件已清理' : `[cleanup] 清理未完成，成片状态不受影响；残留：${resolved}${error ? '\n' + error : ''}`);
      console.log(`[cleanup] 耗时 ${((Date.now() - started) / 1000).toFixed(2)}s；已删除 ${removed} 项`);
      resolve(ok);
    };
    child.stderr.on('data', d => { error = (error + d).slice(-1000); });
    const stop = reason => {
      error = `${reason}；已请求终止清理进程${current ? `；最近处理：${current}` : ''}`;
      child.kill();
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => stop('清理无进展超时'), timeoutMs);
    };
    const progress = setInterval(() => console.log(`[cleanup] 已删除 ${removed} 项；最近处理：${current || resolved}`), 5000);
    const deadline = setTimeout(() => stop('清理达到总时限'), maxDurationMs);
    child.on('message', message => {
      if (message?.type !== 'progress') return;
      current = message.path;
      if (message.removed > removed) { removed = message.removed; arm(); }
    });
    arm();
    child.on('error', e => { error = e.message; finish(false); });
    child.on('exit', code => finish(code === 0 && !error));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === HERE && process.argv[2] === '--remove') {
  try {
    const target = validate(process.argv[3]);
    const root = await fs.promises.lstat(target).catch(e => {
      if (e.code !== 'ENOENT') throw e;
      return null;
    });
    if (root?.isSymbolicLink()) throw new Error('Refusing to clean a linked run directory');
    let removed = 0, lastReport = 0;
    const failures = [];
    const report = (file, force = false) => {
      if (force || Date.now() - lastReport >= 250) {
        lastReport = Date.now();
        process.send?.({ type: 'progress', removed, path: file });
      }
    };
    // Small concurrent batches avoid serial antivirus latency; links are unlinked, never traversed.
    const remove = async file => {
      try {
        const stat = await fs.promises.lstat(file);
        if (stat.isDirectory() && !stat.isSymbolicLink()) {
          for (const entry of await fs.promises.readdir(file)) await remove(path.join(file, entry));
        }
        report(file);
        if (stat.isDirectory() && !stat.isSymbolicLink()) await fs.promises.rmdir(file);
        else await fs.promises.rm(file, { recursive: true, force: true, maxRetries: 2, retryDelay: 150 });
        removed++;
        report(file);
      } catch (e) {
        if (e.code !== 'ENOENT' && failures.length < 10) failures.push(`${file}: ${e.code || e.message}`);
      }
    };
    if (root) {
      const entries = await fs.promises.readdir(target);
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(8, entries.length) }, async () => {
        while (next < entries.length) await remove(path.join(target, entries[next++]));
      }));
      await fs.promises.rmdir(target).catch(e => {
        if (e.code !== 'ENOENT') failures.push(`${target}: ${e.code || e.message}`);
      });
      report(target, true);
      if (failures.length) throw new Error(failures.join('\n'));
    }
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
  if (process.connected) process.disconnect();
}
