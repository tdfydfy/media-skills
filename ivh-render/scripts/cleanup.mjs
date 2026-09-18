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

export function cleanupRun(target, timeoutMs = 15000) {
  const resolved = validate(target);
  console.log(`[cleanup] 开始清理临时文件（上限 ${timeoutMs / 1000}s）：${resolved}`);
  return new Promise(resolve => {
    const child = spawn(process.execPath, [HERE, '--remove', resolved], {
      stdio: ['ignore', 'inherit', 'pipe'], windowsHide: true,
    });
    let error = '', settled = false;
    const finish = ok => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(progress);
      child.stderr.destroy();
      child.unref();
      console.log(ok ? '[cleanup] 临时文件已清理' : `[cleanup] 清理未完成，成片状态不受影响；残留：${resolved}${error ? '\n' + error : ''}`);
      resolve(ok);
    };
    child.stderr.on('data', d => { error = (error + d).slice(-1000); });
    const progress = setInterval(() => console.log('[cleanup] 临时文件仍在清理，达到时限后将报告残留。'), 5000);
    const timer = setTimeout(() => {
      error = '清理超时，已请求终止清理进程';
      child.kill();
      finish(false);
    }, timeoutMs);
    child.on('error', e => { error = e.message; finish(false); });
    child.on('exit', code => finish(code === 0));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === HERE && process.argv[2] === '--remove') {
  try {
    const target = validate(process.argv[3]);
    // The blocking filesystem call lives in this disposable process only.
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 2, retryDelay: 150 });
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
