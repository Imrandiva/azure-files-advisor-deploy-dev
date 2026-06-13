# Provisioning Advisor (web app)

> ⚠️ **Unofficial demo.** Not an official Microsoft/Azure product, not affiliated with or supported by Microsoft. Provided as-is with no warranty, for demonstration purposes only.

A single-page web app that right-sizes Azure Files **Provisioned v2** shares and estimates cost.

- **Advisor tab** — per share: recommended IOPS / throughput / storage, guardrail range,
  burst limit, the exact `az storage share-rm update` command, and a cost breakdown.
- **Total cost tab** — fleet rollup (current vs suggested per month, net change, annualized)
  with the provisioned values and the full cost arithmetic for every share.
- **Unit prices tab** — edit the per-GiB / per-IOPS / per-MiB-s unit prices (per tier &
  redundancy) to match your region or negotiated rates. Overrides flow into every estimate.

## Run locally

```bash
npm install
npm start            # http://localhost:8080
```

Authentication uses `DefaultAzureCredential`, so `az login` is enough locally. Click
**Pull live peak from Azure** after entering your Subscription ID, resource group, and
storage account; the app reads `FileShare*` metrics from Azure Monitor.

## Configuration (environment variables)

| Variable | Purpose |
|---|---|
| `PORT` | Listen port (default `8080`). |
| `DEFAULT_SUBSCRIPTION_ID` | Pre-fill the Subscription ID field. |
| `DEFAULT_RESOURCE_GROUP` | Pre-fill the resource group field. |
| `DEFAULT_STORAGE_ACCOUNT` | Pre-fill the storage account field. |

## Deploy to Azure

From the repo root:

```bash
# Container Apps (scale-to-zero, cheapest for intermittent use)
deploy/deploy-advisor-containerapp.sh <rg> <app-name> westeurope /subscriptions/<sub-id>

# App Service (always-on, stable URL + custom domain)
deploy/deploy-advisor-appservice.sh <rg> <app-name> westeurope B1 /subscriptions/<sub-id>
```

The last argument is an optional scope to grant the app's Managed Identity **Monitoring
Reader** on. Grant it on every subscription/RG your users will query.

## Endpoints

| Path | Purpose |
|---|---|
| `/` | The single-page app. |
| `/advisor.js` | The shared provisioning math module (also used server-side). |
| `/usage?subscription=&rg=&account=` | JSON: live peak + provisioned metrics per share. |
| `/healthz` | Liveness probe. |

## Files

- `server.mjs` — HTTP server (static UI + `/usage`).
- `ui.mjs` — renders the single-page UI (imports `advisor.js` in the browser).
- `advisor.mjs` — pure, dependency-free provisioning + cost math (shared by UI and server).
- `azusage.mjs` — Azure Monitor metric reads via `DefaultAzureCredential` + ARM REST.
