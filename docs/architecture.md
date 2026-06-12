# Architecture

This toolkit has three independent components that share one data source: **Azure Monitor
metrics** for Azure Files Provisioned v2 shares.

## Components

### 1. Provisioning Advisor (`advisor/`)
A stateless Node web app. The browser UI calls back to the server's `/usage` endpoint, which
reads `FileShare*` metrics from Azure Monitor (ARM REST, `DefaultAzureCredential`) and returns
live peak + provisioned values per share. All right-sizing and cost math lives in
`advisor.mjs`, shared verbatim between the browser and (potentially) the server. No database;
no secrets. Auth is the caller's identity (CLI locally, Managed Identity in Azure).

```
browser UI  ──HTTP──►  server.mjs ──►  azusage.mjs ──ARM REST──►  Azure Monitor
   │                                                                    │
   └───────────────  advisor.mjs (shared math)  ◄───── metrics ─────────┘
```

### 2. Portal Dashboard (`dashboard/`)
A PowerShell generator that emits Azure Portal dashboard JSON and deploys it as a shared
dashboard resource. Pure visualization over the same metrics — read-only, no compute.

### 3. Auto-remediation (`autoscale/`)
Event-driven. A metric alert fires when a share nears its provisioned cap and posts the
Common Alert Schema to an Action Group, which calls a **Consumption Logic App** directly (via
its callback URL). The workflow reads the share's current provisioning, scales the saturated
dimension to `bumpPercent`% of current (capped at HDD/SSD maxima), and PATCHes the share —
all with the Logic App's managed identity. No code to publish, no secrets.

```
Monitor metric alert ─► Action Group (logicApp receiver, common schema) ─► Logic App
                                                                              │
                                                         ARM GET share ◄──────┤
                                                         ARM PATCH share ◄─────┘  (bump, capped)
```

## Identity & roles

| Component | Identity | Role needed | Scope |
|---|---|---|---|
| Advisor | Managed Identity (Azure) / CLI (local) | **Monitoring Reader** | each sub/RG queried |
| Dashboard | the deploying user | Contributor (to create dashboard) | resource group |
| Auto-scale Logic App | system-assigned Managed Identity | **Storage Account Contributor** (or narrow custom role) | target storage account |

Role definition IDs used:
- Monitoring Reader — `43d0d8ad-25c7-4714-9337-8ba259a9fe05`
- Storage Account Contributor — `17d1049b-9a84-46fb-8f53-869881c3d3ab`

## Provisioned v2 limits (caps)

| Tier | Max IOPS | Max throughput |
|---|---|---|
| HDD (`StandardV2`) | 50,000 | 5,120 MiB/s |
| SSD (`PremiumV2`) | 102,400 | 10,340 MiB/s |

Reprovisioning uses `PATCH .../fileServices/default/shares/{share}?api-version=2024-01-01`
with `properties.provisionedIops` and `properties.provisionedBandwidthMibps`.

## Design choices

- **Stateless advisor.** No stored credentials or customer data; every request authenticates
  as the caller. Makes it safe to host for a team.
- **Only acts on fired alerts.** The Logic App checks the alert's `monitorCondition` and only
  PATCHes when a value actually changes; every decision is visible in its run history.
- **Capped bumps.** Remediation never exceeds the tier maximum, preventing a runaway alert
  loop from over-provisioning.
- **Metrics, not billing.** Per-share cost is derived from provisioned values × unit price;
  the authoritative bill is at the storage-account grain in Cost Management.
