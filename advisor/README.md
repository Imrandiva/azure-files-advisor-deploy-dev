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
az login             # sign in with your own Azure account
npm install
npm start            # http://localhost:8080
```

Authentication uses `DefaultAzureCredential`, so `az login` is all you need locally —
the server talks to Azure **as your signed-in account**, using your permissions. On the
page, the **Subscription → Resource group → Storage account → File share** pickers load
automatically from your `az login` session, so just choose your scope and click **Pull
live peak from Azure** to read `FileShare*` metrics from Azure Monitor.

> Your account needs the **Monitoring Reader** role on the storage account (or its
> resource group / subscription) for the live pull to return data. Without it the scope
> still loads, but the metric pull comes back empty.

For hosted, multi-user deployments you can instead enable a delegated browser sign-in so
each visitor uses their own Azure account — see `AAD_CLIENT_ID` below.

## Configuration (environment variables)

| Variable | Purpose |
|---|---|
| `PORT` | Listen port (default `8080`). |
| `DEFAULT_SUBSCRIPTION_ID` | Pre-select the Subscription in the picker. |
| `DEFAULT_RESOURCE_GROUP` | Pre-select the resource group in the picker. |
| `DEFAULT_STORAGE_ACCOUNT` | Pre-select the storage account in the picker. |
| `AAD_CLIENT_ID` | Entra app (client) ID. When set, the page shows a **Sign in with Azure** button (delegated MSAL login) instead of using the host `az login` identity. |
| `AAD_TENANT_ID` | Tenant for the delegated login (default `organizations`). |


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
| `/arm?path=<arm-path>` | ARM read proxy using the host `az login` / Managed Identity, backing the scope pickers. Disabled when `AAD_CLIENT_ID` is set (the browser then calls ARM directly with the signed-in user's token). |
| `/usage?subscription=&rg=&account=` | JSON: live peak + provisioned metrics per share. |
| `/healthz` | Liveness probe. |

## Files

- `server.mjs` — HTTP server (static UI + `/arm` + `/usage`).
- `ui.mjs` — renders the single-page UI (imports `advisor.js` in the browser).
- `advisor.mjs` — pure, dependency-free provisioning + cost math (shared by UI and server).
- `azusage.mjs` — Azure Monitor metric reads + host ARM token via `DefaultAzureCredential`.
