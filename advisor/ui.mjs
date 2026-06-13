// Serves the canvas iframe HTML. The page imports the SAME advisor.mjs math
// (served at ./advisor.js) so the UI and the agent never disagree.

// Demo set spanning all four verdicts. Provisioned values are the live ones
// (been 5000, bebu 2000, beid 1500, bein 500); peak/used are representative
// observed peaks so the overview shows OVER / UNDER / Right-sized / At-minimum.
const DEFAULT_SHARES = [
  // OVER: 5000 IOPS provisioned, almost no usage -> biggest savings (the star).
  { name: "archive-been", storageGiB: 100, usedGiB: 3,   currentIops: 5000, currentMibps: 300, peakIops: 60,   peakMibps: 5 },
  // UNDER: ~94% of provisioned -> throttling risk, must increase.
  { name: "archive-bebu", storageGiB: 300, usedGiB: 275, currentIops: 2000, currentMibps: 150, peakIops: 1880, peakMibps: 142 },
  // RIGHT-SIZED: ~43% utilization -> healthy headroom, leave it alone.
  { name: "archive-beid", storageGiB: 200, usedGiB: 95,  currentIops: 1500, currentMibps: 120, peakIops: 650,  peakMibps: 52 },
  // AT-MINIMUM: provisioned at the HDD floor -> can't reduce further.
  { name: "archive-bein", storageGiB: 32,  usedGiB: 12,  currentIops: 500,  currentMibps: 60,  peakIops: 110,  peakMibps: 14 },
];

export function renderHtml(prefill = {}) {
  const p = {
    tier: "HDD", bufferPct: 25,
    subscriptionId: "", resourceGroup: "", storageAccount: "",
    shares: DEFAULT_SHARES,
    share: "archive-been",
    ...prefill,
  };
  if (!Array.isArray(p.shares) || !p.shares.length) p.shares = DEFAULT_SHARES;
  const j = JSON.stringify(p);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Provisioning Advisor</title>
<style>
  :root {
    --bg:#faf9f8; --panel:#ffffff; --panel2:#f3f2f1; --ink:#323130; --muted:#605e5c;
    --line:#edebe9; --accent:#0078d4; --accent-dark:#106ebe; --ok:#107c10; --warn:#a4660b; --bad:#d13438; --info:#0078d4;
  }
  * { box-sizing:border-box; }
  body { margin:0; font-family:'Segoe UI','Segoe UI Web (West European)',-apple-system,BlinkMacSystemFont,Roboto,'Helvetica Neue',sans-serif;
    background:var(--bg); color:var(--ink); font-size:14px; -webkit-font-smoothing:antialiased; }
  .appbar { background:#0078d4; color:#fff; height:48px; display:flex; align-items:center; padding:0 20px; gap:10px; }
  .appbar .logo { font-size:18px; line-height:1; }
  .appbar .title { font-size:15px; font-weight:600; letter-spacing:.01em; }
  .wrap { max-width:1080px; margin:0 auto; padding:24px 20px; }
  h1 { font-size:20px; font-weight:600; margin:0 0 2px; }
  .sub { color:var(--muted); margin:0 0 18px; font-size:13px; }
  .grid { display:grid; grid-template-columns:340px 1fr; gap:18px; align-items:start; }
  @media (max-width:820px){ .grid{ grid-template-columns:1fr; } }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:2px; padding:16px; box-shadow:0 1.6px 3.6px rgba(0,0,0,.08),0 .3px .9px rgba(0,0,0,.06); }
  .card h2 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin:0 0 12px; font-weight:600; }
  label { display:block; font-size:12px; color:var(--muted); margin:10px 0 4px; }
  input, select { width:100%; background:#fff; border:1px solid #8a8886; color:var(--ink);
    border-radius:2px; padding:7px 10px; font-size:14px; font-family:inherit; }
  input:focus, select:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 1px var(--accent); }
  .row { display:flex; gap:10px; } .row > div { flex:1; }
  .seg { display:flex; gap:6px; }
  .seg button { flex:1; background:#fff; border:1px solid #8a8886; color:var(--ink); padding:7px; border-radius:2px; cursor:pointer; font-family:inherit; }
  .seg button.on { background:var(--accent); border-color:var(--accent); color:#fff; font-weight:600; }
  .btn { width:100%; margin-top:10px; background:var(--accent); border:1px solid var(--accent); color:#fff;
    border-radius:2px; padding:8px; font-size:14px; font-weight:600; cursor:pointer; font-family:inherit; }
  .btn:hover { background:var(--accent-dark); border-color:var(--accent-dark); }
  .btn.secondary { background:#fff; border-color:#8a8886; color:var(--ink); font-weight:600; }
  .btn.secondary:hover { background:var(--panel2); }
  .btn:disabled { opacity:.5; cursor:default; }
  .status { font-size:11px; color:var(--muted); margin-top:6px; min-height:14px; }
  .verdict { border-radius:2px; padding:16px 18px; margin-bottom:16px; border:1px solid var(--line); border-left-width:4px; }
  .verdict h3 { margin:0 0 4px; font-size:17px; font-weight:600; }
  .verdict p { margin:0; color:var(--muted); }
  .v-over { background:#fff4e5; border-color:var(--warn); }
  .v-over h3 { color:var(--warn); }
  .v-under { background:#fde7e9; border-color:var(--bad); }
  .v-under h3 { color:var(--bad); }
  .v-ok { background:#dff6dd; border-color:var(--ok); }
  .v-ok h3 { color:var(--ok); }
  .v-min,.v-unknown { background:#eff6fc; border-color:var(--info); }
  .v-min h3,.v-unknown h3 { color:var(--info); }
  .metrics { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .metric { background:var(--panel2); border:1px solid var(--line); border-radius:2px; padding:12px; }
  .metric .t { font-size:12px; color:var(--muted); }
  .metric .big { font-size:22px; font-weight:600; margin:2px 0; }
  .metric .small { font-size:12px; color:var(--muted); }
  .bar { height:8px; background:#fff; border:1px solid var(--line); border-radius:6px; overflow:hidden; margin-top:8px; position:relative; }
  .bar > span { position:absolute; top:0; bottom:0; }
  .bar .range { background:rgba(0,120,212,.2); }
  .bar .pick { background:var(--accent); width:3px; border-radius:2px; }
  .bar .rec { background:var(--ok); width:3px; border-radius:2px; }
  .pill { display:inline-block; font-size:11px; padding:2px 8px; border-radius:999px; margin-left:6px; }
  .pill.over{ background:#fff4e5; color:var(--warn);}
  .pill.under{ background:#fde7e9; color:var(--bad);}
  .pill.ok{ background:#dff6dd; color:var(--ok);}
  .pill.min{ background:#eff6fc; color:var(--info);}
  pre { background:#f3f2f1; border:1px solid var(--line); border-radius:2px; padding:12px; overflow:auto;
    font-family:'Cascadia Code',Consolas,'Courier New',monospace; font-size:12.5px; color:#323130; white-space:pre-wrap; word-break:break-all; margin:0; }
  .cmdwrap { position:relative; }
  .copy { position:absolute; top:8px; right:8px; background:#fff; border:1px solid #8a8886;
    color:var(--ink); border-radius:2px; padding:4px 8px; font-size:11px; cursor:pointer; }
  .cost { display:flex; gap:18px; align-items:baseline; flex-wrap:wrap; }
  .cost .num { font-size:20px; font-weight:600; }
  .save { color:var(--ok); } .add { color:var(--bad); }
  .note { font-size:11px; color:var(--muted); margin-top:10px; }
  .costtbl { width:100%; border-collapse:collapse; margin-top:14px; font-size:12.5px; }
  .costtbl th { text-align:right; color:var(--muted); font-weight:600; padding:6px 8px; border-bottom:1px solid var(--line); font-size:11px; text-transform:uppercase; letter-spacing:.04em; }
  .costtbl th:first-child { text-align:left; }
  .costtbl td { text-align:right; padding:6px 8px; border-bottom:1px solid var(--line); }
  .costtbl td:first-child { text-align:left; color:var(--ink); }
  .costtbl .unit { color:var(--muted); }
  .costtbl tfoot td { font-weight:700; border-bottom:none; }
  .costtbl .less { color:var(--ok); }
  .mt { margin-top:16px; }
  .recbox { background:#eff6fc; border:1px solid var(--accent); border-left-width:4px; border-radius:2px; padding:12px 14px; margin-bottom:14px; }
  .recbox .rl { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--accent); font-weight:700; margin-bottom:5px; }
  .recbox .rt { font-size:15px; line-height:1.55; color:var(--ink); }
  .recbox .rt b { color:#004578; font-weight:700; }
  .recbox.none { background:#dff6dd; border-color:var(--ok); }
  .recbox.none .rl { color:var(--ok); }
  .recbox.wait { background:#eff6fc; border-color:var(--info); }
  .recbox.wait .rl { color:var(--info); }
  .metric .setlabel { font-size:10.5px; text-transform:uppercase; letter-spacing:.05em; color:var(--accent); font-weight:700; margin-top:1px; }
  .metric .change { font-size:12.5px; margin-top:6px; }
  .metric .change .from { color:var(--muted); }
  .metric .change .arrow { color:var(--accent); margin:0 6px; font-weight:700; }
  .metric .change .to { color:var(--ink); font-weight:700; }
  .metric .change .delta { margin-left:7px; font-weight:600; }
  .metric .change .delta.dn { color:var(--ok); } .metric .change .delta.up { color:var(--warn); }
  .tabs { display:flex; gap:4px; margin:0 0 18px; border-bottom:1px solid var(--line); }
  .tabs button { background:transparent; border:none; color:var(--muted); padding:9px 16px; font-size:13px; cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; font-family:inherit; }
  .tabs button.on { color:var(--accent); border-bottom-color:var(--accent); font-weight:600; }
  .tabs button:hover { color:var(--ink); }
  .fleetcards { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:8px; }
  @media (max-width:820px){ .fleetcards{ grid-template-columns:1fr 1fr; } }
  .fleetcard { background:var(--panel2); border:1px solid var(--line); border-radius:2px; padding:12px 14px; }
  .fleetcard .t { font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); }
  .fleetcard .big { font-size:22px; font-weight:600; margin-top:4px; }
  .priceflag { display:inline-block; font-size:11px; padding:2px 8px; border-radius:999px; margin-left:8px; background:#fff4e5; color:var(--warn); }
  .calcrow td { background:#f3f9fd; padding-top:8px; padding-bottom:11px; border-bottom:1px solid var(--line); }
  .calc { font-size:11.5px; color:var(--muted); line-height:1.85; text-align:left; }
  .calc .clab { color:var(--accent); font-weight:600; display:inline-block; min-width:118px; }
  .calc .res { color:var(--ink); font-weight:700; }
  .calc .op { color:var(--muted); }
</style>
</head>
<body>
<div class="appbar">
  <span class="logo">&#9729;</span>
  <span class="title">Microsoft Azure</span>
</div>
<div class="wrap">
  <h1>Azure Files - Provisioning Advisor</h1>
  <p class="sub">Provisioned v2. Pick a share, pull its live peak usage, and get the right provisioning, guardrails, and the exact reprovision command.</p>
  <div id="authbar" style="display:none; align-items:center; gap:10px; margin:0 0 14px; padding:8px 12px; background:var(--panel); border:1px solid var(--line); border-radius:2px; box-shadow:0 1.6px 3.6px rgba(0,0,0,.08),0 .3px .9px rgba(0,0,0,.06);">
    <span style="font-size:16px;">&#128274;</span>
    <span id="authStatus" style="font-size:13px; color:var(--muted); flex:1;">Not signed in</span>
    <button class="btn" id="signInBtn" style="width:auto; margin:0; padding:7px 14px;">Sign in with Azure</button>
    <button class="btn secondary" id="signOutBtn" style="width:auto; margin:0; padding:7px 14px; display:none;">Sign out</button>
  </div>
  <div class="tabs">
    <button data-view="advisor" class="on">Advisor</button>
    <button data-view="total">Total cost</button>
    <button data-view="prices">Unit prices</button>
  </div>
  <div id="view-advisor" class="view">
  <div class="grid">
    <div class="card">
      <h2>Azure scope</h2>
      <label>Subscription</label>
      <select id="subscriptionId"><option value="">Sign in to load subscriptions…</option></select>
      <label class="mt" style="margin-top:8px;">Resource group</label>
      <select id="resourceGroup"><option value="">—</option></select>
      <label class="mt" style="margin-top:8px;">Storage account</label>
      <select id="storageAccount"><option value="">—</option></select>
      <label class="mt" style="margin-top:8px;">File share</label>
      <select id="shareSelect"></select>
      <button class="btn" id="pullBtn">Pull live peak from Azure</button>
      <button class="btn secondary" id="pullAllBtn">Test all shares (live)</button>
      <div class="status" id="status"></div>

      <h2 class="mt">Inputs</h2>
      <label>Media tier</label>
      <div class="seg" id="seg">
        <button data-tier="HDD">HDD</button>
        <button data-tier="SSD">SSD</button>
      </div>
      <label>Redundancy</label>
      <select id="redundancy"></select>
      <label>Provisioned storage (GiB)</label>
      <input id="storageGiB" type="number" min="32" />
      <label>Peak used storage (GiB)</label>
      <input id="usedGiB" type="number" min="0" />
      <div class="row">
        <div><label>Peak used IOPS</label><input id="peakIops" type="number" min="0" /></div>
        <div><label>Peak used MiB/s</label><input id="peakMibps" type="number" min="0" /></div>
      </div>
      <div class="row">
        <div><label>Current prov. IOPS</label><input id="currentIops" type="number" min="0" /></div>
        <div><label>Current prov. MiB/s</label><input id="currentMibps" type="number" min="0" /></div>
      </div>
      <label>Headroom buffer over peak (%)</label>
      <input id="bufferPct" type="number" min="0" max="200" />
    </div>

    <div>
      <div id="verdict" class="verdict v-unknown">
        <h3 id="vTitle">-</h3>
        <p id="vBody">-</p>
      </div>

      <div class="card">
        <h2>Recommended provisioning</h2>
        <div id="recBox" class="recbox wait">
          <div class="rl">Recommended action</div>
          <div class="rt" id="recText">-</div>
        </div>
        <div class="metrics">
          <div class="metric" style="grid-column:1 / -1;">
            <div class="t">Provision storage <span id="pGiB" class="pill"></span></div>
            <div class="big" id="sGiB">-</div>
            <div class="setlabel">&#9656; set the share quota to this</div>
            <div class="change" id="gibChange"></div>
            <div class="small mt" id="gibDetail" style="margin-top:8px;">-</div>
            <div class="bar"><span class="range" id="gibRange"></span><span class="rec" id="gibRec"></span><span class="pick" id="gibPick"></span></div>
          </div>
          <div class="metric">
            <div class="t">Provision IOPS <span id="pIops" class="pill"></span></div>
            <div class="big" id="sIops">-</div>
            <div class="setlabel">&#9656; set your share to this</div>
            <div class="change" id="iopsChange"></div>
            <div class="small mt" id="iopsDetail" style="margin-top:8px;">-</div>
            <div class="bar"><span class="range" id="iopsRange"></span><span class="rec" id="iopsRec"></span><span class="pick" id="iopsPick"></span></div>
          </div>
          <div class="metric">
            <div class="t">Provision throughput <span id="pMibps" class="pill"></span></div>
            <div class="big" id="sMibps">-</div>
            <div class="setlabel">&#9656; set your share to this</div>
            <div class="change" id="mibpsChange"></div>
            <div class="small mt" id="mibpsDetail" style="margin-top:8px;">-</div>
            <div class="bar"><span class="range" id="mibpsRange"></span><span class="rec" id="mibpsRec"></span><span class="pick" id="mibpsPick"></span></div>
          </div>
        </div>
        <div class="note" id="burstNote"></div>
      </div>

      <div class="card mt">
        <h2>Reprovision command</h2>
        <div class="cmdwrap">
          <button class="copy" id="copyBtn">Copy</button>
          <pre id="cmd">-</pre>
        </div>
      </div>

      <div class="card mt">
        <h2>Estimated monthly cost</h2>
        <div class="cost">
          <div><div class="small" style="color:var(--muted)">Current</div><div class="num" id="costCur">-</div></div>
          <div><div class="small" style="color:var(--muted)">Suggested</div><div class="num" id="costSug">-</div></div>
          <div><div class="small" style="color:var(--muted)">Monthly change</div><div class="num" id="costDelta">-</div></div>
        </div>
        <table class="costtbl" id="costTable">
          <thead><tr><th>Component</th><th>Unit price</th><th>Current</th><th>Suggested</th></tr></thead>
          <tbody id="costRows"></tbody>
        </table>
        <div class="note" id="costNote">Azure retail prices - West Europe, LRS, EUR/month. Source: Azure Retail Prices API.</div>
      </div>

      <div class="card mt" id="allCard" style="display:none;">
        <h2>All shares (live)</h2>
        <div id="allBody"></div>
      </div>
    </div>
  </div>
  </div>

  <div id="view-total" class="view" style="display:none;">
    <div class="card">
      <h2>Fleet total cost estimate <span id="totalPriceFlag"></span></h2>
      <div class="fleetcards">
        <div class="fleetcard"><div class="t">Current / month</div><div class="big" id="fleetCur">-</div></div>
        <div class="fleetcard"><div class="t">Suggested / month</div><div class="big" id="fleetSug">-</div></div>
        <div class="fleetcard"><div class="t">Net change / month</div><div class="big" id="fleetDelta">-</div></div>
        <div class="fleetcard"><div class="t">Annualized impact</div><div class="big" id="fleetYr">-</div></div>
      </div>
      <table class="costtbl" id="fleetTable">
        <thead><tr><th>Share</th><th>Verdict</th><th>Current / mo</th><th>Suggested / mo</th><th>Change / mo</th></tr></thead>
        <tbody id="fleetRows"></tbody>
      </table>
      <div class="note" id="fleetNote"></div>
    </div>
  </div>

  <div id="view-prices" class="view" style="display:none;">
    <div class="grid">
      <div class="card">
        <h2>Unit prices</h2>
        <p class="sub" style="margin:0 0 6px;">Editing prices for <b id="pvTier">HDD</b> &middot; <b id="pvRed">LRS</b>. Switch tier/redundancy on the Advisor tab to edit a different combination.</p>
        <label>Storage (&euro; / GiB-month)</label>
        <input id="prGib" type="number" step="0.0001" min="0" />
        <label>Provisioned IOPS (&euro; / IOPS-month)</label>
        <input id="prIops" type="number" step="0.0001" min="0" />
        <label>Provisioned throughput (&euro; / MiB/s-month)</label>
        <input id="prMibps" type="number" step="0.0001" min="0" />
        <button class="btn" id="prApply">Apply prices</button>
        <button class="btn secondary" id="prReset">Reset to Azure defaults</button>
        <div class="status" id="prStatus"></div>
      </div>
      <div>
        <div class="card">
          <h2>Azure retail defaults</h2>
          <table class="costtbl">
            <thead><tr><th>Component</th><th>Default</th><th>In effect</th></tr></thead>
            <tbody id="prDefaults"></tbody>
          </table>
          <div class="note">Defaults are West Europe provisioned v2 prices from the Azure Retail Prices API. Overrides apply to every estimate (single share, fleet total, and the reprovision savings) for the selected tier &amp; redundancy until reset.</div>
        </div>
      </div>
    </div>
  </div>
</div>

<script src="https://alcdn.msauth.net/browser/2.38.1/js/msal-browser.min.js"></script>
<script type="module">
import { recommend, azCommand, PRICES } from "./advisor.js";
const P = ${j};
const $ = (id) => document.getElementById(id);
const fields = ["storageGiB","usedGiB","peakIops","peakMibps","currentIops","currentMibps","bufferPct","subscriptionId","resourceGroup","storageAccount"];
let tier = P.tier;
let redundancy = P.redundancy || "LRS";
let shares = P.shares.slice();
let selected = P.share || (shares[0] && shares[0].name);
let priceOverrides = {}; // keyed by tier + "/" + redundancy -> { gib, iops, mibps }
let view = "advisor";

// ---- Delegated Azure sign-in (each visitor uses their own account) ----
const AAD = P.aad || null;
const ARM_SCOPE = "https://management.azure.com/user_impersonation";
let msalApp = null, account = null;

async function initAuth() {
  if (!AAD) return; // login not configured -> host identity is used server-side
  $("authbar").style.display = "flex";
  setShares([]); // hosted flow: no demo shares; they come from the chosen account
  if (!window.msal) {
    $("authStatus").textContent = "Could not load the Microsoft sign-in library. Check network/CSP.";
    $("signInBtn").disabled = true;
    return;
  }
  msalApp = new window.msal.PublicClientApplication({
    auth: {
      clientId: AAD.clientId,
      authority: "https://login.microsoftonline.com/" + AAD.tenantId,
      redirectUri: window.location.origin + "/",
    },
    cache: { cacheLocation: "localStorage" },
  });
  if (msalApp.initialize) await msalApp.initialize();
  const accts = msalApp.getAllAccounts();
  if (accts.length) account = accts[0];
  $("signInBtn").onclick = signIn;
  $("signOutBtn").onclick = signOut;
  updateAuthUi();
  if (account) populateSubscriptions();
}

function updateAuthUi() {
  const signedIn = !!account;
  $("authStatus").textContent = signedIn ? ("Signed in as " + account.username) : "Sign in to pull live usage with your own Azure account.";
  $("signInBtn").style.display = signedIn ? "none" : "";
  $("signOutBtn").style.display = signedIn ? "" : "none";
  const blocked = AAD && !signedIn;
  if ($("pullBtn")) $("pullBtn").disabled = blocked;
  if ($("pullAllBtn")) $("pullAllBtn").disabled = blocked;
}

async function signIn() {
  try {
    const r = await msalApp.loginPopup({ scopes: [ARM_SCOPE] });
    account = r.account;
    updateAuthUi();
    populateSubscriptions();
  } catch (e) { $("status").textContent = "Sign-in failed: " + (e && e.message || e); }
}

async function signOut() {
  await msalApp.logoutPopup({ account });
  account = null;
  $("subscriptionId").innerHTML = '<option value="">Sign in to load subscriptions…</option>';
  $("resourceGroup").innerHTML = '<option value="">—</option>';
  $("storageAccount").innerHTML = '<option value="">—</option>';
  setShares([]);
  updateAuthUi();
}

async function getArmToken() {
  if (!AAD) return null;
  if (!account) throw new Error("Not signed in");
  try {
    const r = await msalApp.acquireTokenSilent({ scopes: [ARM_SCOPE], account });
    return r.accessToken;
  } catch (e) {
    const r = await msalApp.acquireTokenPopup({ scopes: [ARM_SCOPE], account });
    return r.accessToken;
  }
}

// ---- ARM-backed cascading pickers (subscription -> resource group -> account) ----
async function armGet(path) {
  const token = await getArmToken();
  const res = await fetch("https://management.azure.com" + path, { headers: { Authorization: "Bearer " + token } });
  if (!res.ok) throw new Error("ARM " + res.status + ": " + (await res.text().catch(() => "")).slice(0, 200));
  return res.json();
}

function fillSelect(id, items, placeholder, selectedVal) {
  const sel = $(id);
  sel.innerHTML = "";
  const ph = document.createElement("option");
  ph.value = ""; ph.textContent = placeholder;
  sel.appendChild(ph);
  for (const it of items) {
    const o = document.createElement("option");
    o.value = it.value; o.textContent = it.label;
    if (it.value === selectedVal) o.selected = true;
    sel.appendChild(o);
  }
}

async function populateSubscriptions() {
  try {
    $("status").textContent = "Loading your subscriptions…";
    const data = await armGet("/subscriptions?api-version=2020-01-01");
    const subs = (data.value || [])
      .map((s) => ({ value: s.subscriptionId, label: s.displayName + " (" + s.subscriptionId + ")" }))
      .sort((a, b) => a.label.localeCompare(b.label));
    fillSelect("subscriptionId", subs, "Select a subscription…", P.subscriptionId);
    $("resourceGroup").innerHTML = '<option value="">Select a subscription first…</option>';
    $("storageAccount").innerHTML = '<option value="">—</option>';
    setShares([]);
    $("status").textContent = "Loaded " + subs.length + " subscription(s).";
    if ($("subscriptionId").value) await populateResourceGroups();
  } catch (e) { $("status").textContent = "Could not list subscriptions: " + (e.message || e); }
}

async function populateResourceGroups() {
  const sub = $("subscriptionId").value;
  $("storageAccount").innerHTML = '<option value="">—</option>';
  setShares([]);
  if (!sub) { $("resourceGroup").innerHTML = '<option value="">Select a subscription first…</option>'; return; }
  try {
    $("status").textContent = "Loading resource groups…";
    const data = await armGet("/subscriptions/" + sub + "/resourcegroups?api-version=2021-04-01");
    const rgs = (data.value || [])
      .map((r) => ({ value: r.name, label: r.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
    fillSelect("resourceGroup", rgs, "Select a resource group…", P.resourceGroup);
    $("status").textContent = "Loaded " + rgs.length + " resource group(s).";
    if ($("resourceGroup").value) await populateStorageAccounts();
  } catch (e) { $("status").textContent = "Could not list resource groups: " + (e.message || e); }
}

async function populateStorageAccounts() {
  const sub = $("subscriptionId").value, rg = $("resourceGroup").value;
  setShares([]);
  if (!sub || !rg) { $("storageAccount").innerHTML = '<option value="">Select a resource group first…</option>'; return; }
  try {
    $("status").textContent = "Loading storage accounts…";
    const data = await armGet("/subscriptions/" + sub + "/resourceGroups/" + rg +
      "/providers/Microsoft.Storage/storageAccounts?api-version=2023-01-01");
    const accts = (data.value || [])
      .filter((a) => a.kind === "StorageV2" || a.kind === "FileStorage")
      .map((a) => ({ value: a.name, label: a.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
    fillSelect("storageAccount", accts, "Select a storage account…", P.storageAccount);
    $("status").textContent = accts.length
      ? "Loaded " + accts.length + " storage account(s). Pick one to load its file shares."
      : "No file-capable storage accounts in this resource group.";
    if ($("storageAccount").value) await populateShares();
  } catch (e) { $("status").textContent = "Could not list storage accounts: " + (e.message || e); }
}

async function populateShares() {
  const sub = $("subscriptionId").value, rg = $("resourceGroup").value, acct = $("storageAccount").value;
  if (!sub || !rg || !acct) { setShares([]); return; }
  try {
    $("status").textContent = "Loading file shares…";
    const data = await armGet("/subscriptions/" + sub + "/resourceGroups/" + rg +
      "/providers/Microsoft.Storage/storageAccounts/" + acct +
      "/fileServices/default/shares?api-version=2023-01-01");
    const list = (data.value || []).filter((s) => s.name && !s.name.startsWith("$"));
    if (!list.length) { setShares([]); $("status").textContent = "No file shares in this storage account."; return; }
    setShares(list.map((s) => {
      const p = s.properties || {};
      return {
        name: s.name,
        storageGiB: p.shareQuota || undefined,
        usedGiB: p.shareUsageBytes != null ? Math.max(1, Math.round(p.shareUsageBytes / (1024 ** 3))) : undefined,
        currentIops: p.provisionedIops || undefined,
        currentMibps: p.provisionedBandwidthMibps || undefined,
        peakIops: undefined,
        peakMibps: undefined,
      };
    }));
    $("status").textContent = "Loaded " + shares.length + " file share(s). Pick one, then Pull live peak.";
  } catch (e) { setShares([]); $("status").textContent = "Could not list file shares: " + (e.message || e); }
}

function resolvedRed() { return (PRICES[tier] && PRICES[tier][redundancy]) ? redundancy : "LRS"; }
function priceKey() { return tier + "/" + resolvedRed(); }
function azureDefault() { return (PRICES[tier] && PRICES[tier][resolvedRed()]) || PRICES[tier].LRS; }
function effPrice() { return priceOverrides[priceKey()] || azureDefault(); }
function isCustomPrice() { return !!priceOverrides[priceKey()]; }
function shareInput(s) {
  return { tier, redundancy, storageGiB: s.storageGiB, usedGiB: s.usedGiB, peakIops: s.peakIops, peakMibps: s.peakMibps,
    currentIops: s.currentIops, currentMibps: s.currentMibps, bufferPct: num("bufferPct"), priceOverride: effPrice() };
}

const REDUNDANCY_LABELS = { LRS: "LRS (locally redundant)", ZRS: "ZRS (zone redundant)", GRS: "GRS (geo redundant)", GZRS: "GZRS (geo-zone redundant)" };

function buildRedundancySelect() {
  const sel = $("redundancy");
  const opts = Object.keys(PRICES[tier] || {});
  if (!opts.includes(redundancy)) redundancy = "LRS";
  sel.innerHTML = "";
  for (const r of opts) {
    const o = document.createElement("option");
    o.value = r; o.textContent = REDUNDANCY_LABELS[r] || r;
    if (r === redundancy) o.selected = true;
    sel.appendChild(o);
  }
}

function init() {
  $("subscriptionId").value = P.subscriptionId ?? "";
  $("resourceGroup").value = P.resourceGroup ?? "";
  $("storageAccount").value = P.storageAccount ?? "";
  $("bufferPct").value = P.bufferPct ?? 25;
  buildShareSelect();
  buildRedundancySelect();
  loadShareIntoFields(selected);
  document.querySelectorAll("#seg button").forEach(b => {
    b.classList.toggle("on", b.dataset.tier === tier);
    b.onclick = () => { tier = b.dataset.tier; document.querySelectorAll("#seg button").forEach(x=>x.classList.toggle("on", x.dataset.tier===tier)); buildRedundancySelect(); render(); };
  });
  for (const f of fields) if ($(f)) $(f).addEventListener("input", render);
  $("redundancy").addEventListener("change", () => { redundancy = $("redundancy").value; render(); });
  $("shareSelect").addEventListener("change", () => { selected = $("shareSelect").value; loadShareIntoFields(selected); });
  $("subscriptionId").addEventListener("change", populateResourceGroups);
  $("resourceGroup").addEventListener("change", populateStorageAccounts);
  $("storageAccount").addEventListener("change", populateShares);
  $("copyBtn").onclick = () => navigator.clipboard?.writeText($("cmd").textContent);
  $("pullBtn").onclick = () => pull(false);
  $("pullAllBtn").onclick = () => pull(true);
  document.querySelectorAll(".tabs button").forEach(b => { b.onclick = () => showView(b.dataset.view); });
  $("prApply").onclick = applyPrices;
  $("prReset").onclick = resetPrices;
  render();
  initAuth();
}

function buildShareSelect() {
  const sel = $("shareSelect");
  sel.innerHTML = "";
  if (!shares.length) {
    const o = document.createElement("option");
    o.value = ""; o.textContent = "No file shares";
    sel.appendChild(o);
    return;
  }
  for (const s of shares) {
    const o = document.createElement("option");
    o.value = s.name; o.textContent = s.name;
    if (s.name === selected) o.selected = true;
    sel.appendChild(o);
  }
}

function clearShareInputs() {
  for (const f of ["storageGiB", "usedGiB", "peakIops", "peakMibps", "currentIops", "currentMibps"]) $(f).value = "";
  render();
}

// Replace the working share set and refresh the picker + inputs. Empty list
// clears everything so a share-less account never shows another account's data.
function setShares(arr) {
  shares = arr;
  selected = arr.length ? arr[0].name : null;
  buildShareSelect();
  if (selected) loadShareIntoFields(selected);
  else clearShareInputs();
}

function loadShareIntoFields(name) {
  const s = shares.find(x => x.name === name);
  if (!s) return;
  $("storageGiB").value = s.storageGiB ?? "";
  $("usedGiB").value = s.usedGiB ?? "";
  $("peakIops").value = s.peakIops ?? "";
  $("peakMibps").value = s.peakMibps ?? "";
  $("currentIops").value = s.currentIops ?? "";
  $("currentMibps").value = s.currentMibps ?? "";
  render();
}

function syncFieldsToShare() {
  const s = shares.find(x => x.name === selected);
  if (!s) return;
  s.storageGiB = num("storageGiB"); s.usedGiB = num("usedGiB"); s.peakIops = num("peakIops"); s.peakMibps = num("peakMibps");
  s.currentIops = num("currentIops"); s.currentMibps = num("currentMibps");
}

async function pull(all) {
  const rg = $("resourceGroup").value, account = $("storageAccount").value, sub = $("subscriptionId").value;
  $("status").textContent = "Querying Azure Monitor...";
  $("pullBtn").disabled = true; $("pullAllBtn").disabled = true;
  try {
    const headers = {};
    if (AAD) {
      const token = await getArmToken();
      headers.Authorization = "Bearer " + token;
    }
    const r = await fetch("./usage?subscription=" + encodeURIComponent(sub) + "&rg=" + encodeURIComponent(rg) + "&account=" + encodeURIComponent(account), { headers });
    const data = await r.json();
    if (!data.ok) { $("status").textContent = "Error: " + data.error; return; }
    const usage = data.usage || {};
    for (const s of shares) {
      const u = usage[s.name];
      if (!u) continue;
      if (u.peakIops != null) s.peakIops = u.peakIops;
      if (u.peakMibps != null) s.peakMibps = u.peakMibps;
      if (u.currentIops != null) s.currentIops = u.currentIops;
      if (u.currentMibps != null) s.currentMibps = u.currentMibps;
      if (u.storageGiB) s.storageGiB = u.storageGiB;
      if (u.usedGiB != null) s.usedGiB = u.usedGiB;
    }
    const found = Object.keys(usage).length;
    $("status").textContent = "Live data applied for " + found + " share(s).";
    loadShareIntoFields(selected);
    if (all) renderAll();
  } catch (e) {
    $("status").textContent = "Fetch failed: " + e;
  } finally {
    $("pullBtn").disabled = false; $("pullAllBtn").disabled = false;
  }
}

const num = (id) => { const v = $(id).value; return v === "" ? undefined : Number(v); };

function setBar(prefix, minV, maxV, rec, pick) {
  const span = maxV - minV || 1;
  const pct = (x) => Math.max(0, Math.min(100, ((x - minV) / span) * 100));
  $(prefix+"Range").style.left = "0%"; $(prefix+"Range").style.width = "100%";
  $(prefix+"Rec").style.left = pct(rec) + "%";
  $(prefix+"Pick").style.left = pct(pick) + "%";
}
const fmt = (n) => n == null ? "-" : "\u20ac" + Number(n).toFixed(2);

function verdictText(o) {
  const v = o.verdict.overall;
  const el = $("verdict");
  el.className = "verdict v-" + v;
  const map = {
    over: ["Over-provisioned - you can save money",
      "Provisioned capacity far exceeds observed peak usage. Drop to the suggested values below to stop paying for idle headroom."],
    under: ["Under-provisioned - risk of throttling",
      "Observed peak is at or above 80% of provisioned capacity. Increase provisioning to keep headroom and avoid latency."],
    ok: ["Right-sized", "Provisioning matches usage with healthy headroom. No change needed."],
    min: ["At tier minimum", "Already provisioned at the floor for this tier. You cannot go lower; only storage size affects cost here."],
    unknown: ["Enter usage to get a verdict", "Add peak used IOPS / throughput (from your monitoring) to see whether this share is over- or under-provisioned."],
  };
  const [t, b] = map[v] || map.unknown;
  $("vTitle").textContent = t; $("vBody").textContent = b;
}
function pill(id, state) {
  const el = $(id);
  if (!state) { el.textContent = ""; el.className = "pill"; return; }
  const lbl = { over:"over", under:"under", ok:"ok", min:"min", unknown:"" }[state.state] || "";
  el.textContent = lbl ? (lbl + (state.util!=null? " - "+state.util+"% used":"")) : "";
  el.className = "pill " + (lbl||"");
}

function currentInput() {
  return {
    tier, redundancy, storageGiB: num("storageGiB"), usedGiB: num("usedGiB"),
    peakIops: num("peakIops"), peakMibps: num("peakMibps"),
    currentIops: num("currentIops"), currentMibps: num("currentMibps"),
    bufferPct: num("bufferPct"), priceOverride: effPrice(),
  };
}

function changeLine(id, current, suggested, unit) {
  const el = $(id);
  if (current == null) { el.innerHTML = '<span class="from">No current value entered</span>'; return; }
  const d = suggested - current;
  const cls = d < 0 ? "dn" : d > 0 ? "up" : "";
  const deltaTxt = d === 0 ? "no change" : (d < 0 ? "\u2212" : "+") + Math.abs(d).toLocaleString() + " " + unit;
  el.innerHTML = '<span class="from">Now ' + current.toLocaleString() + '</span>'
    + '<span class="arrow">\u2192</span><span class="to">' + suggested.toLocaleString() + ' ' + unit + '</span>'
    + '<span class="delta ' + cls + '">(' + deltaTxt + ')</span>';
}

function recAction(o) {
  const box = $("recBox"), txt = $("recText");
  const v = o.verdict.overall;
  const cur = o.current;
  const si = o.suggested.iops, sm = o.suggested.mibps;
  if ((!o.haveUsage && !o.haveStorageUsage) || v === "unknown") {
    box.className = "recbox wait";
    txt.innerHTML = "Enter <b>peak used storage / IOPS / throughput</b> (or click <b>Pull live peak from Azure</b>) to get a right-sizing recommendation for this share.";
    return;
  }
  const matches = cur && cur.iops === si && cur.mibps === sm && cur.gib === o.suggested.gib;
  if (v === "ok" || matches) {
    box.className = "recbox none";
    txt.innerHTML = "<b>No change needed.</b> This share is right-sized at <b>" + o.suggested.gib.toLocaleString()
      + " GiB</b> / <b>" + si.toLocaleString() + " IOPS</b> / <b>" + sm.toLocaleString() + " MiB/s</b> with healthy headroom over its peak usage.";
    return;
  }
  box.className = "recbox";
  const verb = v === "over" ? "Reduce" : v === "under" ? "Increase" : "Set";
  const parts = [];
  if (o.haveStorageUsage && cur && cur.gib != null && cur.gib !== o.suggested.gib) parts.push("storage from <b>" + cur.gib.toLocaleString() + "</b> to <b>" + o.suggested.gib.toLocaleString() + " GiB</b>");
  if (cur && cur.iops != null && cur.iops !== si) parts.push("IOPS from <b>" + cur.iops.toLocaleString() + "</b> to <b>" + si.toLocaleString() + "</b>");
  else parts.push("IOPS to <b>" + si.toLocaleString() + "</b>");
  if (cur && cur.mibps != null && cur.mibps !== sm) parts.push("throughput from <b>" + cur.mibps.toLocaleString() + "</b> to <b>" + sm.toLocaleString() + " MiB/s</b>");
  else parts.push("throughput to <b>" + sm.toLocaleString() + " MiB/s</b>");
  let tail = "";
  if (o.cost.savings != null && o.cost.savings > 0) tail = " Saves <b>\u20ac" + o.cost.savings.toFixed(2) + "/mo</b> (\u20ac" + (o.cost.savings * 12).toFixed(2) + "/yr).";
  else if (o.cost.savings != null && o.cost.savings < 0) tail = " Adds <b>\u20ac" + (-o.cost.savings).toFixed(2) + "/mo</b> for safe headroom.";
  txt.innerHTML = "<b>" + verb + "</b> " + parts.join(" and ") + "." + tail + " Then run the command below.";
}

function render() {
  syncFieldsToShare();
  const o = recommend(currentInput());
  verdictText(o);
  recAction(o);
  $("sGiB").textContent = o.suggested.gib.toLocaleString() + " GiB";
  $("sIops").textContent = o.suggested.iops.toLocaleString() + " IOPS";
  $("sMibps").textContent = o.suggested.mibps.toLocaleString() + " MiB/s";
  changeLine("gibChange", o.current ? o.current.gib : null, o.suggested.gib, "GiB");
  changeLine("iopsChange", o.current ? o.current.iops : null, o.suggested.iops, "IOPS");
  changeLine("mibpsChange", o.current ? o.current.mibps : null, o.suggested.mibps, "MiB/s");
  $("gibDetail").textContent = "Peak used: " + (o.peak.gib != null ? o.peak.gib.toLocaleString() + " GiB" : "n/a") + "  \u00b7  tier min: " + o.limits.minGiB.toLocaleString() + " GiB  \u00b7  buffer: " + o.bufferPct + "%";
  $("iopsDetail").textContent = "Azure typical: " + o.recommended.iops.toLocaleString() + "  \u00b7  guardrail max: " + o.guardrail.maxIops.toLocaleString() + "  \u00b7  tier min: " + o.limits.minIops.toLocaleString();
  $("mibpsDetail").textContent = "Azure typical: " + o.recommended.mibps.toLocaleString() + "  \u00b7  guardrail max: " + o.guardrail.maxMibps.toLocaleString() + "  \u00b7  tier min: " + o.limits.minMibps.toLocaleString();
  pill("pGiB", o.verdict.gib); pill("pIops", o.verdict.iops); pill("pMibps", o.verdict.mibps);
  const gibTop = Math.max(o.current ? o.current.gib : 0, o.suggested.gib, o.peak.gib || 0, o.limits.minGiB + 1);
  setBar("gib", o.limits.minGiB, gibTop, o.peak.gib != null ? o.peak.gib : o.suggested.gib, o.suggested.gib);
  setBar("iops", o.limits.minIops, o.guardrail.maxIops, o.recommended.iops, o.suggested.iops);
  setBar("mibps", o.limits.minMibps, o.guardrail.maxMibps, o.recommended.mibps, o.suggested.mibps);
  $("burstNote").textContent = "On the bar: blue = recommended value to set (for your usage); green = Azure's typical recommendation for this storage size. Burst at the suggested IOPS: up to " + o.burst.atSuggestedIops.toLocaleString() + " IOPS (credit-based).";
  $("cmd").textContent = azCommand(o, { resourceGroup: $("resourceGroup").value, storageAccount: $("storageAccount").value, share: selected });
  $("costCur").textContent = fmt(o.cost.currentMonthly);
  $("costSug").textContent = fmt(o.cost.suggestedMonthly);
  if (o.cost.savings == null) { $("costDelta").textContent = "-"; $("costDelta").className = "num"; }
  else if (o.cost.savings >= 0) { $("costDelta").textContent = "-" + fmt(o.cost.savings) + "/mo"; $("costDelta").className = "num save"; }
  else { $("costDelta").textContent = "+" + fmt(-o.cost.savings) + "/mo"; $("costDelta").className = "num add"; }
  renderCostTable(o);
  if (view === "total") renderTotal();
  if (view === "prices") loadPriceEditor();
}

function renderCostTable(o) {
  const pr = o.prices;
  const sym = "\u20ac";
  const sug = o.cost.suggestedItems || [];
  const cur = o.cost.currentItems;
  const priceStr = {
    "Storage": sym + pr.gib + " / GiB",
    "Provisioned IOPS": sym + pr.iops + " / IOPS",
    "Provisioned throughput": sym + pr.mibps + " / MiB/s",
  };
  let rows = "";
  for (let k = 0; k < sug.length; k++) {
    const s = sug[k];
    const c = cur ? cur[k] : null;
    rows += "<tr><td>" + s.label + ' <span class="unit">(' + s.qty.toLocaleString() + " " + s.unit + ")</span></td>"
      + "<td>" + priceStr[s.label] + "</td>"
      + "<td>" + (c ? sym + c.cost.toFixed(2) : "-") + "</td>"
      + "<td>" + sym + s.cost.toFixed(2) + "</td></tr>";
  }
  const sugTotal = o.cost.suggestedMonthly, curTotal = o.cost.currentMonthly;
  rows += "<tr style='font-weight:700'><td>Total / month</td><td></td>"
    + "<td>" + (curTotal != null ? sym + curTotal.toFixed(2) : "-") + "</td>"
    + "<td>" + sym + sugTotal.toFixed(2) + "</td></tr>";
  if (o.cost.savings != null && o.cost.savings > 0) {
    rows += "<tr><td class='less'>Monthly saving</td><td></td><td></td><td class='less'>-" + sym + o.cost.savings.toFixed(2)
      + " (-" + sym + (o.cost.savings * 12).toFixed(2) + "/yr)</td></tr>";
  }
  $("costRows").innerHTML = rows;
  $("costNote").textContent = "Azure retail prices - " + pr.region + ", " + pr.redundancy + ", " + pr.currency + "/month (provisioned v2 " + o.tier + ")."
    + (pr.custom ? " Custom unit prices applied (edit on the Unit prices tab)." : " Source: Azure Retail Prices API.");
}

function renderAll() {
  $("allCard").style.display = "block";
  const rows = shares.map(s => {
    const o = recommend(shareInput(s));
    const v = o.verdict.overall;
    const color = { over:"var(--warn)", under:"var(--bad)", ok:"var(--ok)", min:"var(--info)", unknown:"var(--muted)" }[v];
    const lbl = { over:"OVER-PROVISIONED", under:"UNDER-PROVISIONED", ok:"Right-sized", min:"At minimum", unknown:"No usage" }[v];
    const sav = o.cost.savings == null ? "-" : (o.cost.savings >= 0 ? "save \u20ac" + o.cost.savings.toFixed(2) : "add \u20ac" + (-o.cost.savings).toFixed(2));
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--line);">'
      + '<div><b>' + s.name + '</b><div class="small" style="color:var(--muted)">used ' + (s.usedGiB??'-') + ' GiB / peak ' + (s.peakIops??'-') + ' IOPS / ' + (s.peakMibps??'-') + ' MiB/s vs prov ' + (s.storageGiB??'-') + ' GiB / ' + (s.currentIops??'-') + ' / ' + (s.currentMibps??'-') + '</div></div>'
      + '<div style="text-align:right"><span style="color:' + color + ';font-weight:600">' + lbl + '</span>'
      + '<div class="small" style="color:var(--muted)">&rarr; ' + o.suggested.gib + ' GiB / ' + o.suggested.iops + ' IOPS / ' + o.suggested.mibps + ' MiB/s &middot; ' + sav + '/mo</div></div></div>';
  }).join("");
  $("allBody").innerHTML = rows;
}
function showView(name) {
  view = name;
  for (const v of ["advisor", "total", "prices"]) {
    const el = $("view-" + v); if (el) el.style.display = (v === name) ? "" : "none";
  }
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.view === name));
  if (name === "total") renderTotal();
  if (name === "prices") loadPriceEditor();
}

const eur = (n) => "\u20ac" + Number(n).toFixed(2);
const eurp = (n) => "\u20ac" + Number(n); // unit price, full precision

// Build an explicit cost formula from advisor line items, e.g.
// "100 GiB x EUR0.0083 + 5000 IOPS x EUR0.0453 + ... = EUR0.83 + ... = EUR247.52"
function calcStr(items, total) {
  const terms = items.map(it => it.qty.toLocaleString() + " " + it.unit + " \u00d7 " + eurp(it.price)).join("  +  ");
  const costs = items.map(it => eur(it.cost)).join(" + ");
  return terms + "  <span class='op'>=</span>  " + costs + "  <span class='op'>=</span>  <span class='res'>" + eur(total) + "</span>";
}

function renderTotal() {
  let curT = 0, sugT = 0, anyCur = false, rows = "";
  for (const s of shares) {
    const o = recommend(shareInput(s));
    const cur = o.cost.currentMonthly, sug = o.cost.suggestedMonthly;
    if (cur != null) { curT += cur; anyCur = true; }
    sugT += sug;
    const v = o.verdict.overall;
    const color = { over:"var(--warn)", under:"var(--bad)", ok:"var(--ok)", min:"var(--info)", unknown:"var(--muted)" }[v];
    const lbl = { over:"Over-provisioned", under:"Under-provisioned", ok:"Right-sized", min:"At minimum", unknown:"No usage" }[v];
    const d = cur != null ? +(sug - cur).toFixed(2) : null;
    const dStr = d == null ? "-"
      : d < 0 ? "<span class='less'>\u2212" + eur(Math.abs(d)) + "</span>"
      : d > 0 ? "<span style='color:var(--bad)'>+" + eur(d) + "</span>" : "no change";
    const c = o.current, sg = o.suggested;
    rows += "<tr><td>" + s.name + "</td>"
      + "<td style='text-align:left;color:" + color + ";font-weight:600'>" + lbl + "</td>"
      + "<td>" + (cur != null ? eur(cur) : "-") + "</td>"
      + "<td>" + eur(sug) + "</td>"
      + "<td>" + dStr + "</td></tr>";
    // Detail row: provisioned values + the arithmetic behind both columns.
    let detail = "<div class='calc'>";
    detail += "<div><span class='clab'>Provisioned now</span> " + (c.gib != null ? c.gib.toLocaleString() : "-") + " GiB / "
      + (c.iops != null ? c.iops.toLocaleString() : "-") + " IOPS / " + (c.mibps != null ? c.mibps.toLocaleString() : "-") + " MiB/s</div>";
    if (o.cost.currentItems) detail += "<div><span class='clab'>Current cost</span> " + calcStr(o.cost.currentItems, cur) + "</div>";
    detail += "<div><span class='clab'>Suggested</span> " + sg.gib.toLocaleString() + " GiB / " + sg.iops.toLocaleString() + " IOPS / " + sg.mibps.toLocaleString() + " MiB/s</div>";
    detail += "<div><span class='clab'>Suggested cost</span> " + calcStr(o.cost.suggestedItems, sug) + "</div>";
    detail += "</div>";
    rows += "<tr class='calcrow'><td colspan='5'>" + detail + "</td></tr>";
  }
  const net = anyCur ? +(sugT - curT).toFixed(2) : null;
  rows += "<tr style='font-weight:700'><td>Fleet total</td><td></td>"
    + "<td>" + (anyCur ? eur(curT) : "-") + "</td><td>" + eur(sugT) + "</td>"
    + "<td>" + (net == null ? "-" : net < 0 ? "<span class='less'>\u2212" + eur(Math.abs(net)) + "</span>" : net > 0 ? "<span style='color:var(--bad)'>+" + eur(net) + "</span>" : "no change") + "</td></tr>";
  $("fleetRows").innerHTML = rows;
  $("fleetCur").textContent = anyCur ? eur(curT) : "-";
  $("fleetSug").textContent = eur(sugT);
  const dEl = $("fleetDelta"), yEl = $("fleetYr");
  if (net == null) { dEl.textContent = "-"; dEl.className = "big"; yEl.textContent = "-"; }
  else if (net < 0) { dEl.textContent = "\u2212" + eur(Math.abs(net)); dEl.className = "big save"; yEl.textContent = "save " + eur(Math.abs(net) * 12) + "/yr"; }
  else if (net > 0) { dEl.textContent = "+" + eur(net); dEl.className = "big add"; yEl.textContent = "+" + eur(net * 12) + "/yr"; }
  else { dEl.textContent = "no change"; dEl.className = "big"; yEl.textContent = "-"; }
  $("totalPriceFlag").innerHTML = isCustomPrice() ? "<span class='priceflag'>custom prices</span>" : "";
  const up = effPrice();
  $("fleetNote").textContent = "Across " + shares.length + " share(s), tier " + tier + " / " + resolvedRed() + ". "
    + "Unit prices: " + eurp(up.gib) + "/GiB + " + eurp(up.iops) + "/IOPS + " + eurp(up.mibps) + "/MiB-s per month. "
    + (isCustomPrice() ? "Custom unit prices (Unit prices tab)." : "Azure retail, West Europe, EUR/month.");
}

function loadPriceEditor() {
  const pr = effPrice(), def = azureDefault();
  $("pvTier").textContent = tier; $("pvRed").textContent = resolvedRed();
  $("prGib").value = pr.gib; $("prIops").value = pr.iops; $("prMibps").value = pr.mibps;
  const rows = [
    ["Storage", "gib", "/ GiB"], ["Provisioned IOPS", "iops", "/ IOPS"], ["Provisioned throughput", "mibps", "/ MiB/s"],
  ].map(([label, k, unit]) =>
    "<tr><td>" + label + "</td><td>\u20ac" + def[k] + " " + unit + "</td><td>\u20ac" + pr[k] + " " + unit + "</td></tr>"
  ).join("");
  $("prDefaults").innerHTML = rows;
  $("prStatus").textContent = isCustomPrice()
    ? "Custom prices active for " + tier + " / " + resolvedRed() + "."
    : "Using Azure retail defaults for " + tier + " / " + resolvedRed() + ".";
}

function applyPrices() {
  priceOverrides[priceKey()] = { gib: Number($("prGib").value), iops: Number($("prIops").value), mibps: Number($("prMibps").value) };
  loadPriceEditor(); render();
  $("prStatus").textContent = "Applied. All estimates now use these prices for " + tier + " / " + resolvedRed() + ".";
}

function resetPrices() {
  delete priceOverrides[priceKey()];
  loadPriceEditor(); render();
}

init();
</script>
</body>
</html>`;
}
