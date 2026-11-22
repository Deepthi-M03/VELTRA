// Online, consistent SQLite backup:  npm run backup-db
// Writes data/backups/veltra-YYYYMMDD-HHMMSS.db and keeps the newest 30.
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { loadConfig, ROOT } from '../apps/server/src/config.js';

const cfg = loadConfig();
const dir = join(ROOT, 'data', 'backups'); mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const out = join(dir, `veltra-${stamp}.db`);
const db = new DatabaseSync(cfg.dbFile);
db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
db.close();
const files = readdirSync(dir).filter((f) => f.startsWith('veltra-') && f.endsWith('.db')).sort();
for (const f of files.slice(0, Math.max(0, files.length - 30))) unlinkSync(join(dir, f));
console.log(`Backup written: ${out}`);
