import { DemoProvider } from './demo.js';
import { HttpFeedProvider } from './http-feed.js';

// Register new licensed providers here.
export const PROVIDERS = {
  demo: (cfg) => new DemoProvider(cfg),
  'http-feed': (cfg) => new HttpFeedProvider(cfg),
};

export function createProvider(name, cfg = {}) {
  const f = PROVIDERS[name];
  if (!f) throw new Error(`Unknown market provider "${name}". Available: ${Object.keys(PROVIDERS).join(', ')}`);
  return f(cfg);
}
