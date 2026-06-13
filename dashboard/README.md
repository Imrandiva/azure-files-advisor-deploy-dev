# Portal Dashboard

> ⚠️ **Unofficial demo.** Not an official Microsoft/Azure product, not affiliated with or supported by Microsoft. Provided as-is with no warranty, for demonstration purposes only.

Deploys an **Azure Portal shared dashboard** that visualizes Provisioned v2 monitoring for
your file shares: provisioned vs used IOPS and throughput, capacity, transactions,
and a "live" 1-minute-grain section for demos.

## Deploy

```powershell
./New-FileShareDashboard.ps1 `
  -ResourceGroup <rg> `
  -StorageAccount <account> `
  -DashboardName "FileShare-ProvisionedV2-Monitoring"
```

The script reads your current subscription from `az account show`, **discovers the file shares
on the account at run time**, builds the dashboard JSON, and deploys it with
`az portal dashboard`. Open it in the portal under **Dashboard → Shared dashboards**.

## Parameters

| Parameter | Required | Default | Purpose |
|---|---|---|---|
| `-ResourceGroup` | yes | – | RG holding the storage account. |
| `-StorageAccount` | yes | – | The Provisioned v2 storage account. |
| `-Location` | no | the account's own location | Dashboard resource location. |
| `-DashboardName` | no | `FileShare-ProvisionedV2-Monitoring` | Dashboard resource name. |

## How it adapts to your shares

Nothing about the dashboard is hardcoded. The script enumerates the account's shares with
`az storage share-rm list` and builds one provisioned-vs-used row per share, plus a summary
table of each share's provisioned IOPS / MiB-s. Provisioned metrics
(`FileShareProvisionedIOPS`, `FileShareProvisionedBandwidthMiBps`) are emitted at a 1-hour
grain, so those tiles use a 1h granularity; the live activity tiles use 1-minute.
