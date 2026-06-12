// Pure, dependency-free provisioning math for Azure Files Provisioned v2.
// Imported by extension.mjs (agent action) AND served verbatim to the iframe
// at /advisor.js so the UI and the agent compute identical numbers.
//
// Formulas & limits are from Microsoft Learn "Understand Azure Files billing"
// (provisioned v2 provisioning + guardrails sections).

// Azure retail prices: West Europe, EUR/month, provisioned v2.
// Recovered at full precision from the Azure Retail Prices API (queried via
// JPY to dodge EUR 4-decimal rounding, converted back at the API's own FX).
// SSD provisioned v2 only offers LRS/ZRS in West Europe.
export const PRICES = {
  HDD: {
    LRS:  { gib: 0.0083, iops: 0.0453, mibps: 0.0673 },
    ZRS:  { gib: 0.0102, iops: 0.0559, mibps: 0.0834 },
    GRS:  { gib: 0.0157, iops: 0.0866, mibps: 0.1287 },
    GZRS: { gib: 0.0177, iops: 0.0972, mibps: 0.1456 },
  },
  SSD: {
    LRS:  { gib: 0.1232, iops: 0.0335, mibps: 0.0484 },
    ZRS:  { gib: 0.1539, iops: 0.0413, mibps: 0.0610 },
  },
};

export const TIERS = {
  HDD: {
    label: "HDD (Standard)",
    minGiB: 32, maxGiB: 262144,
    minIops: 500, maxIops: 50000,
    minMibps: 60, maxMibps: 5120,
    // recommendation: MIN(MAX(1000 + CEIL(0.2*GiB), 500), 50000)
    iops: (g) => 1000 + Math.ceil(0.2 * g),
    // MIN(MAX(60 + CEIL(0.02*GiB), 60), 5120)
    mibps: (g) => 60 + Math.ceil(0.02 * g),
    burstFloor: 5000,
  },
  SSD: {
    label: "SSD (Premium)",
    minGiB: 32, maxGiB: 262144,
    minIops: 3000, maxIops: 102400,
    minMibps: 100, maxMibps: 10340,
    iops: (g) => 3000 + Math.ceil(1 * g),
    mibps: (g) => 100 + Math.ceil(0.1 * g),
    burstFloor: 10000,
  },
};

// Resolve unit prices for a tier + redundancy, falling back to LRS.
export function priceFor(tier, redundancy) {
  const tbl = PRICES[tier] || PRICES.HDD;
  return tbl[redundancy] || tbl.LRS;
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/**
 * @param {object} i
 * @param {"HDD"|"SSD"} i.tier
 * @param {number} i.storageGiB
 * @param {number} [i.peakIops]      observed/expected peak used IOPS
 * @param {number} [i.peakMibps]     observed/expected peak used throughput
 * @param {number} [i.currentIops]   currently provisioned IOPS (optional)
 * @param {number} [i.currentMibps]  currently provisioned throughput (optional)
 * @param {number} [i.usedGiB]       observed/expected peak used storage (optional)
 * @param {number} [i.bufferPct]     headroom over peak, default 25
 */
export function recommend(i) {
  const t = TIERS[i.tier] || TIERS.HDD;
  const buffer = 1 + (Number(i.bufferPct ?? 25) / 100);
  // Currently provisioned storage quota.
  const currentGiB = clamp(Math.round(Number(i.storageGiB) || t.minGiB), t.minGiB, t.maxGiB);

  // Right-size storage: cover peak used capacity + buffer, floored at the tier
  // minimum. If no usage supplied, keep the current provisioned size.
  const haveStorageUsage = i.usedGiB != null;
  const sizeGiB = haveStorageUsage
    ? clamp(Math.ceil(Number(i.usedGiB) * buffer), t.minGiB, t.maxGiB)
    : currentGiB;

  // IOPS/throughput formulas scale with the storage size you will provision.
  const gib = sizeGiB;

  // Azure's "typical workload" recommendation for this storage size.
  const recIops = clamp(t.iops(gib), t.minIops, t.maxIops);
  const recMibps = clamp(t.mibps(gib), t.minMibps, t.maxMibps);

  // Guardrails: you may provision anywhere from the tier minimum up to 5x the
  // recommendation (and never above the absolute tier max).
  const guardMaxIops = Math.min(5 * recIops, t.maxIops);
  const guardMaxMibps = Math.min(5 * recMibps, t.maxMibps);

  // Right-size target: cover observed peak + buffer, floored at the tier
  // minimum, capped at the guardrail. If no usage supplied, fall back to the
  // typical-workload recommendation.
  const haveUsage = i.peakIops != null || i.peakMibps != null;
  const sizeIops = i.peakIops != null
    ? clamp(Math.ceil(Number(i.peakIops) * buffer), t.minIops, guardMaxIops)
    : recIops;
  const sizeMibps = i.peakMibps != null
    ? clamp(Math.ceil(Number(i.peakMibps) * buffer), t.minMibps, guardMaxMibps)
    : recMibps;

  // Burst IOPS limit you can momentarily reach (credit-based).
  const burstIops = (prov) => Math.min(Math.max(3 * prov, t.burstFloor), t.maxIops);

  // Verdict vs currently provisioned (if provided).
  const verdictFor = (peak, current, minV) => {
    if (current == null) return null;
    if (current <= minV) return { state: "min", util: peak != null && current ? Math.round(peak / current * 100) : null };
    const util = peak != null ? Math.round(peak / current * 100) : null;
    if (util != null && util >= 80) return { state: "under", util };
    if (util != null && util < 30) return { state: "over", util };
    if (util == null) return { state: "unknown", util: null };
    return { state: "ok", util };
  };
  const vIops = verdictFor(i.peakIops, i.currentIops, t.minIops);
  const vMibps = verdictFor(i.peakMibps, i.currentMibps, t.minMibps);
  const vGiB = verdictFor(i.usedGiB, haveStorageUsage ? currentGiB : null, t.minGiB);

  const order = { under: 3, over: 2, ok: 1, min: 0, unknown: 0 };
  let overall = "unknown";
  for (const v of [vIops, vMibps, vGiB]) {
    if (v && order[v.state] >= (order[overall] ?? -1)) overall = v.state;
  }

  // Estimated monthly cost & potential savings, using the tier+redundancy
  // unit prices (West Europe, EUR/month).
  const redundancy = PRICES[i.tier] && PRICES[i.tier][i.redundancy] ? i.redundancy : "LRS";
  // Allow callers (e.g. the canvas price editor) to override the unit prices.
  const pr = i.priceOverride && typeof i.priceOverride === "object"
    ? { gib: Number(i.priceOverride.gib), iops: Number(i.priceOverride.iops), mibps: Number(i.priceOverride.mibps) }
    : priceFor(i.tier, redundancy);
  const priceIsCustom = !!(i.priceOverride && typeof i.priceOverride === "object");
  const monthly = (iops, mibps, g) => +( (iops * pr.iops) + (mibps * pr.mibps) + (g * pr.gib) ).toFixed(2);
  const haveCurrentPerf = i.currentIops != null && i.currentMibps != null;
  let savings = null;
  if (haveCurrentPerf || currentGiB !== sizeGiB) {
    let s = (currentGiB - sizeGiB) * pr.gib;
    if (haveCurrentPerf) s += ((i.currentIops - sizeIops) * pr.iops) + ((i.currentMibps - sizeMibps) * pr.mibps);
    savings = +s.toFixed(2);
  }

  // Per-component breakdown so the UI can show how each cost is derived.
  const lineItems = (iops, mibps, g) => ([
    { label: "Storage", qty: g, unit: "GiB", price: pr.gib, cost: +(g * pr.gib).toFixed(2) },
    { label: "Provisioned IOPS", qty: iops, unit: "IOPS", price: pr.iops, cost: +(iops * pr.iops).toFixed(2) },
    { label: "Provisioned throughput", qty: mibps, unit: "MiB/s", price: pr.mibps, cost: +(mibps * pr.mibps).toFixed(2) },
  ]);

  return {
    tier: i.tier, tierLabel: t.label, storageGiB: gib, bufferPct: Math.round((buffer - 1) * 100),
    haveUsage, haveStorageUsage,
    limits: { minIops: t.minIops, maxIops: t.maxIops, minMibps: t.minMibps, maxMibps: t.maxMibps, minGiB: t.minGiB, maxGiB: t.maxGiB },
    recommended: { iops: recIops, mibps: recMibps },
    guardrail: { maxIops: guardMaxIops, maxMibps: guardMaxMibps, minIops: t.minIops, minMibps: t.minMibps },
    suggested: { iops: sizeIops, mibps: sizeMibps, gib: sizeGiB },
    burst: { atSuggestedIops: burstIops(sizeIops) },
    current: { iops: i.currentIops ?? null, mibps: i.currentMibps ?? null, gib: currentGiB },
    peak: { iops: i.peakIops ?? null, mibps: i.peakMibps ?? null, gib: i.usedGiB ?? null },
    verdict: { overall, iops: vIops, mibps: vMibps, gib: vGiB },
    prices: { gib: pr.gib, iops: pr.iops, mibps: pr.mibps, currency: "EUR", period: "month", region: "West Europe", redundancy, custom: priceIsCustom },
    cost: {
      suggestedMonthly: monthly(sizeIops, sizeMibps, sizeGiB),
      currentMonthly: haveCurrentPerf ? monthly(i.currentIops, i.currentMibps, currentGiB) : null,
      savings,
      suggestedItems: lineItems(sizeIops, sizeMibps, sizeGiB),
      currentItems: haveCurrentPerf ? lineItems(i.currentIops, i.currentMibps, currentGiB) : null,
    },
  };
}

export function azCommand(o, ctx = {}) {
  const rg = ctx.resourceGroup || "<resource-group>";
  const sa = ctx.storageAccount || "<storage-account>";
  const share = ctx.share || "<share-name>";
  return `az storage share-rm update -g ${rg} --storage-account ${sa} -n ${share} ` +
    `--quota ${o.suggested.gib} --provisioned-iops ${o.suggested.iops} --provisioned-bandwidth-mibps ${o.suggested.mibps}`;
}
