// Live Azure Monitor usage fetch for the advisor's "Pull live peak" button.
//
// Uses DefaultAzureCredential so the same code works:
//   - In Azure (App Service / Container Apps / Functions) via a Managed Identity.
//   - Locally via `az login` (AzureCliCredential) or environment service principal.
//
// The identity needs the "Monitoring Reader" role on the storage account (or the
// resource group / subscription) to read the FileShare metrics.

import { DefaultAzureCredential } from "@azure/identity";

const ARM = "https://management.azure.com";
const SCOPE = "https://management.azure.com/.default";

const credential = new DefaultAzureCredential();
let cachedToken = null;

async function getToken() {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresOnTimestamp - now > 5 * 60 * 1000) {
    return cachedToken.token;
  }
  cachedToken = await credential.getToken(SCOPE);
  return cachedToken.token;
}

function fsResourceId(sub, rg, account) {
  return `/subscriptions/${sub}/resourceGroups/${rg}` +
    `/providers/Microsoft.Storage/storageAccounts/${account}/fileServices/default`;
}

async function listMetric(token, fsId, metric, start, end) {
  const url = `${ARM}${fsId}/providers/microsoft.insights/metrics` +
    `?api-version=2019-07-01` +
    `&metricnames=${encodeURIComponent(metric)}` +
    `&aggregation=Maximum` +
    `&interval=PT1H` +
    `&timespan=${encodeURIComponent(`${start}/${end}`)}` +
    `&$filter=${encodeURIComponent("FileShare eq '*'")}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Azure Monitor ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

// Returns a map: share -> { peakIops, peakMibps, currentIops, currentMibps, storageGiB, usedGiB }
export async function fetchShareUsage({ subscriptionId, resourceGroup, storageAccount, lookbackHours = 24 }) {
  if (!subscriptionId) throw new Error("subscriptionId is required");
  if (!resourceGroup) throw new Error("resourceGroup is required");
  if (!storageAccount) throw new Error("storageAccount is required");

  const token = await getToken();
  const fsId = fsResourceId(subscriptionId, resourceGroup, storageAccount);
  const end = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const start = new Date(Date.now() - lookbackHours * 3600 * 1000).toISOString().replace(/\.\d+Z$/, "Z");

  const metrics = {
    peakIops: "FileShareMaxUsedIOPS",
    peakMibps: "FileShareMaxUsedBandwidthMiBps",
    currentIops: "FileShareProvisionedIOPS",
    currentMibps: "FileShareProvisionedBandwidthMiBps",
    capacityBytes: "FileShareCapacityQuota",
    usedBytes: "FileCapacity",
  };

  const out = {};
  for (const [key, metric] of Object.entries(metrics)) {
    let res;
    try {
      res = await listMetric(token, fsId, metric, start, end);
    } catch {
      continue; // a missing metric shouldn't abort the whole pull
    }
    const series = res?.value?.[0]?.timeseries || [];
    for (const ts of series) {
      const share = ts.metadatavalues?.[0]?.value;
      if (!share) continue;
      const vals = (ts.data || []).map((d) => d.maximum).filter((v) => v != null);
      const peak = vals.length ? Math.max(...vals) : 0;
      out[share] = out[share] || {};
      if (key === "capacityBytes") out[share].storageGiB = Math.round(peak / (1024 ** 3));
      else if (key === "usedBytes") out[share].usedGiB = Math.max(1, Math.round(peak / (1024 ** 3)));
      else out[share][key] = Math.round(peak);
    }
  }
  return out;
}
