// Black–Scholes pricing and Greeks (European, continuous dividend yield q).
// Used to compute Greeks when a provider supplies premium/IV but not Greeks, and by the demo feed.

const SQRT2PI = Math.sqrt(2 * Math.PI);
export const normPdf = (x) => Math.exp(-0.5 * x * x) / SQRT2PI;
export function normCdf(x) {
  // Abramowitz–Stegun 7.1.26 via erf
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

export function blackScholes({ S, K, T, r = 0.065, q = 0, sigma, type }) {
  if (T <= 0 || sigma <= 0) {
    const intrinsic = type === 'CE' ? Math.max(S - K, 0) : Math.max(K - S, 0);
    return { price: intrinsic, delta: type === 'CE' ? (S > K ? 1 : 0) : (S < K ? -1 : 0), gamma: 0, theta: 0, vega: 0, rho: 0 };
  }
  const sT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sT);
  const d2 = d1 - sigma * sT;
  const dq = Math.exp(-q * T), dr = Math.exp(-r * T);
  const gamma = (dq * normPdf(d1)) / (S * sigma * sT);
  const vega = (S * dq * normPdf(d1) * sT) / 100; // per 1 vol point
  if (type === 'CE') {
    const price = S * dq * normCdf(d1) - K * dr * normCdf(d2);
    const theta = (-(S * dq * normPdf(d1) * sigma) / (2 * sT) - r * K * dr * normCdf(d2) + q * S * dq * normCdf(d1)) / 365;
    return { price, delta: dq * normCdf(d1), gamma, theta, vega, rho: (K * T * dr * normCdf(d2)) / 100 };
  }
  const price = K * dr * normCdf(-d2) - S * dq * normCdf(-d1);
  const theta = (-(S * dq * normPdf(d1) * sigma) / (2 * sT) + r * K * dr * normCdf(-d2) - q * S * dq * normCdf(-d1)) / 365;
  return { price, delta: dq * (normCdf(d1) - 1), gamma, theta, vega, rho: (-K * T * dr * normCdf(-d2)) / 100 };
}

// Implied volatility by bisection. Returns null if the premium is outside no-arbitrage bounds.
export function impliedVol({ price, S, K, T, r = 0.065, q = 0, type }) {
  let lo = 0.001, hi = 5;
  const f = (s) => blackScholes({ S, K, T, r, q, sigma: s, type }).price - price;
  if (f(lo) > 0 || f(hi) < 0) return null;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}

// Put–call ratio and max-pain from a chain [{strike, CE:{oi}, PE:{oi}}].
export function chainStats(rows) {
  let ceOi = 0, peOi = 0;
  for (const r of rows) { ceOi += r.CE?.oi || 0; peOi += r.PE?.oi || 0; }
  let maxPain = null, minLoss = Infinity;
  for (const s of rows) {
    let loss = 0;
    for (const r of rows) {
      loss += (r.CE?.oi || 0) * Math.max(s.strike - r.strike, 0);
      loss += (r.PE?.oi || 0) * Math.max(r.strike - s.strike, 0);
    }
    if (loss < minLoss) { minLoss = loss; maxPain = s.strike; }
  }
  const maxCe = rows.reduce((a, r) => ((r.CE?.oi || 0) > (a?.CE?.oi || 0) ? r : a), null);
  const maxPe = rows.reduce((a, r) => ((r.PE?.oi || 0) > (a?.PE?.oi || 0) ? r : a), null);
  return {
    pcr: ceOi ? peOi / ceOi : null, totalCeOi: ceOi, totalPeOi: peOi, maxPain,
    oiResistance: maxCe?.strike ?? null, oiSupport: maxPe?.strike ?? null,
  };
}
