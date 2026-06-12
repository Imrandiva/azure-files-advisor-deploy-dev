# Azure Files Provisioned v2 Toolkit

A self-serve toolkit for **monitoring, right-sizing, and auto-remediating** Azure Files
**Provisioned v2** shares (HDD `StandardV2` and SSD `PremiumV2`). Bring your own Azure
subscription.

Three independent pieces, usable together or separately:

| Folder | What it is | Run it |
|---|---|---|
| [`advisor/`](advisor/) | A hostable web app that recommends right-sized IOPS / throughput / storage per share, with **live cost estimates** and editable unit prices. Pull live peak usage straight from Azure Monitor. | Locally with `npm start`, or deploy to App Service / Container Apps |
| [`dashboard/`](dashboard/) | A PowerShell script that deploys an **Azure Portal shared dashboard** visualizing provisioned vs used IOPS/throughput per share, plus live 1-minute activity tiles. | `pwsh New-FileShareDashboard.ps1` |
| [`autoscale/`](autoscale/) | An **auto-remediation** Logic App + Monitor alert rules: when a share approaches its provisioned limit, it automatically increases the provisioning. No code to publish, no secrets. | `pwsh deploy.ps1` / `./deploy.sh` |

```
                       ┌─────────────────────────┐
                       │   Provisioning Advisor   │  ← right-size + cost (advisor/)
                       │      (web app, BYO sub)  │
                       └───────────┬──────────────┘
                                   │ reads metrics
   ┌───────────────┐        ┌──────▼───────────┐        ┌───────────────────────┐
   │ Portal        │ reads  │  Azure Monitor   │ alerts │  Action Group         │
   │ Dashboard     │◄───────┤  (FileShare      ├───────►│  → Logic App          │
   │ (dashboard/)  │        │   metrics)       │        │  → bump provisioning  │
   └───────────────┘        └──────────────────┘        │     (autoscale/)      │
                                                         └───────────────────────┘
```

## Prerequisites

- An Azure subscription with one or more **Provisioned v2** file shares.
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) (`az login` done).
- Node.js 18+ (for the advisor).
- PowerShell 7+ (`pwsh`) for the dashboard script.
- Auto-scale needs only the Azure CLI — it's a Logic App deployed via Bicep (no Functions Core Tools, no code to publish).

## Quick start

### 1. Right-size with the advisor (local)

```bash
cd advisor
npm install
npm start
# open http://localhost:8080, enter your Subscription ID / RG / storage account,
# then click "Pull live peak from Azure"
```

The advisor uses [`DefaultAzureCredential`](https://learn.microsoft.com/javascript/api/@azure/identity/defaultazurecredential),
so locally it picks up your `az login`. When hosted in Azure it uses the app's
Managed Identity (needs **Monitoring Reader** on whatever it queries).

### 2. Deploy the dashboard

```powershell
cd dashboard
./New-FileShareDashboard.ps1 -ResourceGroup <rg> -StorageAccount <account> -Location <region>
```

### 3. Turn on auto-remediation

```powershell
cd autoscale
./deploy.ps1 -ResourceGroup <rg> -TargetStorageAccount <account>
```

See each folder's README for details and parameters (e.g. `bumpPercent`, thresholds).

## How costs are estimated

The advisor ships with **West Europe retail unit prices** for Provisioned v2 (per GiB,
per provisioned IOPS, per provisioned MiB/s, by redundancy). You can override any of them
on the **Unit prices** tab — useful for other regions, EA/MCA discounts, or what-if
analysis. The **Total cost** tab rolls every share up into a fleet estimate and shows the
full arithmetic behind each number.

> Prices are estimates for planning. Your actual bill is in **Cost Management**. Billing
> granularity for Files is the **storage account**, so per-share figures are metric-derived,
> not billed amounts.

## Security notes

- No secrets are stored in the app. The advisor authenticates with a Managed Identity
  (in Azure) or your CLI login (locally).
- The advisor only needs **read** access (Monitoring Reader). The auto-scale Logic App needs
  **write** access to file shares (Storage Account Contributor, or a narrower custom role).
- The auto-scale Logic App only acts on a **fired** alert and only PATCHes when the value
  actually changes; every decision is visible in the Logic App's run history.

## License

[MIT](LICENSE)
