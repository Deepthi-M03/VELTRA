// VELTRA server entry point:  npm start   (or)   node apps/server/src/index.js
import { loadConfig } from './config.js';
import { createApp } from './app.js';

const config = loadConfig();
const log = { info: (...a) => console.log('[veltra]', ...a), warn: (...a) => console.warn('[veltra]', ...a), error: (...a) => console.error('[veltra]', ...a) };
const app = await createApp(config, { log });
const addr = await app.start();
log.info(`VELTRA running at http://${addr.address === '127.0.0.1' ? 'localhost' : addr.address}:${addr.port}  (env=${config.env}, market=${config.market.provider}, payments=${config.payments.provider}, ai=${config.ai.provider})`);
if (config.market.provider === 'demo') log.warn('Market data provider is DEMO — all prices are synthetic and labelled DEMO in the UI.');

const shutdown = async (sig) => { log.info(`${sig} received, shutting down`); await app.stop(); process.exit(0); };
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (e) => app.ctx.errors.record('unhandledRejection', e));
