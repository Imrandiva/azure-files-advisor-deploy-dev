# Auto-remediation (Logic App + alert rules)

> ⚠️ **Unofficial demo.** Not an official Microsoft/Azure product, not affiliated with or supported by Microsoft. Provided as-is with no warranty, for demonstration purposes only.

Automatically increases a Provisioned v2 share's IOPS or throughput when it
approaches its limit — no Function App, no code to publish, no secrets.

```
Azure Monitor metric alert (FileShare* near limit, split by FileShare dimension)
        │  Common Alert Schema
        ▼
Action Group ──► Logic App (managed identity)
                    │ ARM GET  the share's provisioning
                    │ bump the saturated dimension × bumpPercent (capped)
                    ▼ ARM PATCH
                 Share reprovisioned
```

Everything is one Bicep deployment. The Action Group calls the Logic App
directly via its callback URL (resolved at deploy time), and the Logic App talks
to ARM with its own **system-assigned managed identity** — there are no function
keys, connection strings, or webhook URLs to manage.

## Deploy

```powershell
./deploy.ps1 -ResourceGroup <rg> -TargetStorageAccount <account> -Location <region>
```

```bash
./deploy.sh <rg> <account> <region>
```

That single command deploys `infra/main.bicep`, which creates the Logic App, the
role assignment, the action group, and the two metric alerts.

Optional thresholds: `-IopsThreshold` (default 400) and `-MibpsThreshold`
(default 48). Tune these to your shares' provisioned values — they should fire
as a share nears its cap.

## Behavior / settings

These are Logic App workflow parameters (set in `infra/main.bicep`):

| Parameter | Default | Purpose |
|---|---|---|
| `bumpPercent` | `150` | Scale the saturated dimension to this % of current (150 = ×1.5). |
| `maxIops` | `50000` | Hard cap for provisioned IOPS (HDD max; SSD = 102400). |
| `maxMibps` | `5120` | Hard cap for provisioned throughput (HDD max; SSD = 10340). |
| `apiVersion` | `2024-01-01` | Storage ARM API version. |

The workflow only acts when an alert **fires** (it ignores the auto-resolve
callback), and only PATCHes when the new value actually differs from the current
one. If a share is already at the cap, it's left unchanged.

> **Important:** the metric alerts split on the **FileShare** dimension, so each
> firing names exactly one share. The workflow reads the first dimension value as
> the share name — keep the alerts split on FileShare (the supplied `main.bicep`
> already does this).

## Identity & permissions

The Logic App uses a system-assigned managed identity. `main.bicep` grants it
**Storage Account Contributor** on the target account (via `role.bicep`). To
narrow it, swap in a custom role limited to:

```
Microsoft.Storage/storageAccounts/fileServices/shares/read
Microsoft.Storage/storageAccounts/fileServices/shares/write
```

## Test it without waiting for a real alert

Grab the trigger URL and POST the sample Common Alert Schema payload:

```bash
URL=$(az rest --method post \
  --uri "https://management.azure.com$(az resource show -g <rg> -n fileshare-autoscale \
        --resource-type Microsoft.Logic/workflows --query id -o tsv)/triggers/manual/listCallbackUrl?api-version=2019-05-01" \
  --query value -o tsv)
curl -s -X POST "$URL" -H "Content-Type: application/json" --data @sample-alert.json
```

Edit `sample-alert.json` (storage account ID + FileShare dimension) to match your
environment, then watch the run under the Logic App's **Run history** in the
portal — each step shows the parsed share, the current vs. new values, and the
PATCH result.

## Files

- `infra/main.bicep` — Logic App + managed identity + role + action group + the two metric alerts (one deployment).
- `infra/workflow.json` — the Logic App workflow definition (parse alert → GET → bump → PATCH).
- `infra/role.bicep` — Storage Account Contributor role assignment helper.
- `deploy.ps1` / `deploy.sh` — one-step deployment.
- `sample-alert.json` — sample Common Alert Schema body for testing.
