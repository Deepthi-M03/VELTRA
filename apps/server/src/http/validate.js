// Tiny schema validator for request bodies/queries. Unknown keys are dropped.
import { bad } from './core.js';

export const t = {
  string: (o = {}) => ({ type: 'string', ...o }),
  email: (o = {}) => ({ type: 'email', ...o }),
  number: (o = {}) => ({ type: 'number', ...o }),
  int: (o = {}) => ({ type: 'int', ...o }),
  bool: (o = {}) => ({ type: 'bool', ...o }),
  enum: (values, o = {}) => ({ type: 'enum', values, ...o }),
  array: (of, o = {}) => ({ type: 'array', of, ...o }),
};

const EMAIL_RE = /^[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}$/i;

function check(name, spec, v) {
  if (v === undefined || v === null || v === '') {
    if (spec.optional) return spec.default;
    throw bad(`${name} is required`);
  }
  switch (spec.type) {
    case 'string': {
      if (typeof v !== 'string') throw bad(`${name} must be text`);
      const s = spec.trim === false ? v : v.trim();
      if (spec.min && s.length < spec.min) throw bad(`${name} must be at least ${spec.min} characters`);
      if (s.length > (spec.max ?? 2000)) throw bad(`${name} must be at most ${spec.max ?? 2000} characters`);
      if (spec.pattern && !spec.pattern.test(s)) throw bad(`${name} has an invalid format`);
      return s;
    }
    case 'email': {
      if (typeof v !== 'string' || v.length > 254 || !EMAIL_RE.test(v.trim())) throw bad(`${name} must be a valid email address`);
      return v.trim().toLowerCase();
    }
    case 'number': case 'int': {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) throw bad(`${name} must be a number`);
      if (spec.type === 'int' && !Number.isInteger(n)) throw bad(`${name} must be a whole number`);
      if (spec.min !== undefined && n < spec.min) throw bad(`${name} must be ≥ ${spec.min}`);
      if (spec.max !== undefined && n > spec.max) throw bad(`${name} must be ≤ ${spec.max}`);
      return n;
    }
    case 'bool': return v === true || v === 'true' || v === 1 || v === '1';
    case 'enum': if (!spec.values.includes(v)) throw bad(`${name} must be one of: ${spec.values.join(', ')}`); return v;
    case 'array': {
      if (!Array.isArray(v)) throw bad(`${name} must be a list`);
      if (v.length > (spec.max ?? 50)) throw bad(`${name} has too many items`);
      if (spec.min && v.length < spec.min) throw bad(`${name} needs at least ${spec.min} item(s)`);
      return v.map((x, i) => (spec.of.type === 'object' ? validate(spec.of.shape, x) : check(`${name}[${i}]`, spec.of, x)));
    }
    default: throw new Error('bad spec');
  }
}

export function validate(shape, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw bad('Expected a JSON object');
  const out = {};
  for (const [k, spec] of Object.entries(shape)) out[k] = check(k, spec, input[k]);
  return out;
}
t.object = (shape) => ({ type: 'object', shape });
