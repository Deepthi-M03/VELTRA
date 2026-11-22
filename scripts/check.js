// Static checks:  npm run check
// 1) every JS file parses  2) no hard-coded secrets  3) no raw innerHTML with interpolation outside the safe templating helper
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../apps/server/src/config.js';

const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { if (['node_modules', '.git', 'data', 'test-results'].includes(f)) continue; const p = join(d, f); statSync(p).isDirectory() ? walk(p) : f.endsWith('.js') && files.push(p); } };
walk(ROOT);
let problems = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: readFileSync(f) });
  if (r.status !== 0) { problems++; console.log(`✗ syntax ${relative(ROOT, f)}\n${r.stderr.toString().split('\n').slice(0, 4).join('\n')}`); }
  const src = readFileSync(f, 'utf8');
  if (/(sk-ant-[A-Za-z0-9]{10,}|rzp_live_[A-Za-z0-9]{6,}|AKIA[0-9A-Z]{16})/.test(src)) { problems++; console.log(`✗ possible secret in ${relative(ROOT, f)}`); }
  if (f.includes(join('apps', 'web')) && /\.innerHTML\s*=\s*`[^`]*\$\{/.test(src) && !f.endsWith('dom.js')) { problems++; console.log(`✗ interpolated innerHTML in ${relative(ROOT, f)} — use html\`\``); }
}
const gi = readFileSync(join(ROOT, '.gitignore'), 'utf8');
if (!/^\.env$/m.test(gi)) { problems++; console.log('✗ .env is not git-ignored'); }
console.log(problems ? `\n${problems} problem(s) in ${files.length} files` : `✓ ${files.length} JS files parse; no secrets; no unsafe innerHTML interpolation; .env ignored`);
process.exit(problems ? 1 : 0);
