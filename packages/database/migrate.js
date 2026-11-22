// CLI: node packages/database/migrate.js   (safe to run repeatedly)
import { loadConfig } from '../../apps/server/src/config.js';
import { openDatabase, migrate } from './db.js';

const config = loadConfig();
const db = openDatabase(config.dbFile);
const applied = migrate(db, console.log);
console.log(applied.length ? `Applied ${applied.length} migration(s).` : 'Database already up to date.');
db.close();
