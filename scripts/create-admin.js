// Create or promote an administrator account.
// Usage:  npm run create-admin -- admin@example.com "Admin Name"
// You will be prompted for a password (input is not echoed to the log).
import { createInterface } from 'node:readline/promises';
import { loadConfig } from '../apps/server/src/config.js';
import { openDatabase, migrate } from '../packages/database/db.js';
import { hashPassword, passwordProblems } from '../apps/server/src/services/auth.js';

const [email, name = 'Administrator'] = process.argv.slice(2);
if (!email || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) { console.error('Usage: npm run create-admin -- you@example.com "Your Name"'); process.exit(1); }
const db = openDatabase(loadConfig().dbFile); migrate(db);
const existing = db.get('SELECT * FROM users WHERE email = ?', email.toLowerCase());
let password = process.env.ADMIN_PASSWORD;
if (!password) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  password = await rl.question(existing ? 'New password (leave blank to keep current): ' : 'Password: ');
  rl.close();
}
if (password) {
  const p = passwordProblems(password, email);
  if (p.length) { console.error(`Password must have ${p.join(', ')}.`); process.exit(1); }
}
if (existing) {
  db.run(`UPDATE users SET role = 'admin', email_verified_at = COALESCE(email_verified_at, ?) ${password ? ', password_hash = ?' : ''} WHERE id = ?`,
    ...(password ? [new Date().toISOString(), await hashPassword(password), existing.id] : [new Date().toISOString(), existing.id]));
  console.log(`Promoted ${email} to admin.`);
} else {
  if (!password) { console.error('A password is required for a new account.'); process.exit(1); }
  db.run(`INSERT INTO users (email, password_hash, name, role, email_verified_at) VALUES (?,?,?,'admin',?)`, email.toLowerCase(), await hashPassword(password), name, new Date().toISOString());
  console.log(`Created admin ${email}.`);
}
db.run('INSERT INTO audit_logs (action, target, meta_json) VALUES (?,?,?)', 'cli.create_admin', `email:${email.toLowerCase()}`, '{}');
db.close();
