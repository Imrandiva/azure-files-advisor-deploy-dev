<#
.SYNOPSIS
    Generates and deploys an Azure Portal shared dashboard visualizing
    Azure Files Provisioned v2 monitoring (provisioned vs used IOPS/throughput,
    capacity, transactions) for any Provisioned v2 storage account.

.DESCRIPTION
    The script discovers the file shares on the target account at run time, so
    it adapts to whatever shares you have - nothing about the dashboard is tied
    to a specific account, share, or region.

.EXAMPLE
    ./New-FileShareDashboard.ps1 -ResourceGroup my-rg -StorageAccount mystgacct
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string]$ResourceGroup,
    [Parameter(Mandatory)] [string]$StorageAccount,
    # Defaults to the storage account's own location when omitted.
    [string]$Location      = "",
    [string]$DashboardName = "FileShare-ProvisionedV2-Monitoring"
)

$ErrorActionPreference = "Stop"
$subId = az account show --query id -o tsv
if (-not $subId) { throw "Not logged in. Run 'az login' first." }

# Discover the account (and its location) and its shares at run time so the
# dashboard is fully generic - no share names or sizes are baked into the script.
$acct = az storage account show -g $ResourceGroup -n $StorageAccount -o json | ConvertFrom-Json
if (-not $acct) { throw "Storage account '$StorageAccount' not found in resource group '$ResourceGroup'." }
if (-not $Location) { $Location = $acct.location }

$fsId = "/subscriptions/$subId/resourceGroups/$ResourceGroup/providers/Microsoft.Storage/storageAccounts/$StorageAccount/fileServices/default"

$shareInfo = az storage share-rm list --storage-account $StorageAccount -g $ResourceGroup `
    --query "[].{name:name, iops:provisionedIops, mibps:provisionedBandwidthMibps}" -o json | ConvertFrom-Json
if (-not $shareInfo) { throw "No file shares found on '$StorageAccount'. Create at least one Provisioned v2 share first." }
# Normalize to an array even when the account has a single share.
$shareInfo = @($shareInfo)
$shares = @($shareInfo.name)
Write-Host "Discovered $($shares.Count) share(s): $($shares -join ', ')" -ForegroundColor Cyan

# Build a MonitorChartPart tile.
function New-MetricTile {
    param(
        [int]$X, [int]$Y, [int]$W, [int]$H,
        [string]$Title, [string]$Subtitle,
        # array of @{ metric=..; agg=..; share=.. (optional) }
        [array]$Metrics,
        [string]$ChartType = "Line",
        [string]$Granularity = "1h",
        [string]$Relative = "7d"
    )
    $items = foreach ($m in $Metrics) {
        $md = @{
            resourceMetadata = @{ id = $fsId }
            name             = $m.metric
            aggregationType  = $m.agg
            namespace        = "microsoft.storage/storageaccounts/fileservices"
            metricVisualization = @{ displayName = $m.metric }
        }
        $md
    }
    $result = @{
        position = @{ x = $X; y = $Y; colSpan = $W; rowSpan = $H }
        metadata = @{
            inputs = @(
                @{ name = "options"; isOptional = $true }
                @{ name = "sharedTimeRange"; isOptional = $true }
            )
            type = "Extension/HubsExtension/PartType/MonitorChartPart"
            settings = @{
                content = @{
                    options = @{
                        chart = @{
                            metrics = @($items)
                            title   = $Title
                            titleKind = 2
                            visualization = @{
                                chartType = (@{Line=2; Bar=1; Area=3}[$ChartType])
                                legendVisualization = @{ isVisible = $true; position = 2 }
                                axisVisualization  = @{ x = @{ isVisible = $true }; y = @{ isVisible = $true } }
                            }
                        }
                    }
                }
            }
            # Pin a per-tile grain + window. Provisioned* metrics ONLY support PT1H,
            # so overlay tiles use "1h". The LIVE used-only tiles use "1m" for a
            # fast-moving demo view (used metrics support PT1M).
            filters = @{
                MsPortalFx_TimeRange = @{
                    model = @{
                        format = "utc"
                        granularity = $Granularity
                        relative = $Relative
                    }
                }
            }
        }
    }
    if ($Metrics[0].splitByShare) {
        $chart = $result.metadata.settings.content.options.chart
        $chart.grouping = @{ dimension = "FileShare"; sort = 2; top = 10 }
    }
    else {
        # Filter the tile to a single share. This MUST live at chart level as a
        # `filterCollection` - a per-metric `filters` array is ignored by
        # MonitorChartPart, which is why every per-share tile was rendering the
        # account-wide aggregate (all shares summed) instead of one share.
        $tileShare = ($Metrics | Where-Object { $_.share } | Select-Object -First 1).share
        if ($tileShare) {
            $chart = $result.metadata.settings.content.options.chart
            $chart.filterCollection = @{
                filters = @(@{ key = "FileShare"; operator = 0; values = @($tileShare) })
            }
        }
    }
    return $result
}

$tiles = New-Object System.Collections.ArrayList
function Add-Tile($tile) { [void]$script:tiles.Add(@{ position = $tile.position; metadata = $tile.metadata }) }

function New-MarkdownTile {
    param([int]$X,[int]$Y,[int]$W,[int]$H,[string]$Title,[string]$Markdown)
    @{
        position = @{ x = $X; y = $Y; colSpan = $W; rowSpan = $H }
        metadata = @{
            inputs = @()
            type = "Extension/HubsExtension/PartType/MarkdownPart"
            settings = @{
                content = @{
                    settings = @{
                        content = $Markdown
                        title = $Title
                        subtitle = ""
                        markdownSource = 1
                    }
                }
            }
        }
    }
}

$shareRows = ($shareInfo | ForEach-Object {
    "| $($_.name) | $($_.iops) / $($_.mibps) |"
}) -join "`n"

$verdict = @"
## Provisioned vs Used - right-sizing at a glance

Each share shows **provisioned** (flat line = what you pay for) vs **max used** (actual demand).
A large persistent gap means wasted spend; lines that ride the ceiling mean you may be throttling.
The **LIVE (1-minute)** row at the top updates within minutes; the per-share rows below overlay
provisioned (hourly) vs used.

| Share | Provisioned IOPS / MiB-s |
|---|---|
$shareRows

**To reprovision a share** (example):
``az storage share-rm update -g $ResourceGroup --storage-account $StorageAccount -n <share> --provisioned-iops <iops> --provisioned-bandwidth-mibps <mibps>``
"@
Add-Tile (New-MarkdownTile -X 0 -Y 0 -W 12 -H 3 -Title "Provisioned vs Used" -Markdown $verdict)

# ---- LIVE (1-minute grain) section: used-only tiles that move within minutes. ----
# These exclude the PT1H-only provisioned metrics so they can render at "1m".
$liveBanner = @"
## LIVE - last hour, 1-minute grain (refresh to watch it move)
These tiles show actual **used** IOPS and throughput per minute across every share on this
account - the moving lines for a demo. Compare against the provisioned ceilings below.
"@
Add-Tile (New-MarkdownTile -X 0 -Y 3 -W 12 -H 2 -Title "Live activity" -Markdown $liveBanner)

Add-Tile (New-MetricTile -X 0 -Y 5 -W 6 -H 4 -Title "LIVE used IOPS per share (1-min)" `
    -Granularity "1m" -Relative "1h" `
    -Metrics @($shares | ForEach-Object { @{metric="FileShareMaxUsedIOPS"; agg=3; share=$_} }))
Add-Tile (New-MetricTile -X 6 -Y 5 -W 6 -H 4 -Title "LIVE used throughput MiB/s per share (1-min)" `
    -Granularity "1m" -Relative "1h" `
    -Metrics @($shares | ForEach-Object { @{metric="FileShareMaxUsedBandwidthMiBps"; agg=3; share=$_} }))
Add-Tile (New-MetricTile -X 0 -Y 9 -W 12 -H 4 -Title "LIVE transactions/min (all shares, split by share)" `
    -Granularity "1m" -Relative "1h" `
    -Metrics @(@{metric="Transactions"; agg=4; splitByShare=$true}))

# Per-share row: provisioned-vs-used for Storage (GiB), IOPS, and throughput.
# Each share = one row of three 4-wide tiles.
$row = 13
foreach ($share in $shares) {
    Add-Tile (New-MetricTile -X 0 -Y $row -W 4 -H 4 -Title "$share - provisioned vs used storage" `
        -Metrics @(
            @{metric="FileShareCapacityQuota"; agg=4; share=$share}
            @{metric="FileCapacity";           agg=3; share=$share}
        ))
    Add-Tile (New-MetricTile -X 4 -Y $row -W 4 -H 4 -Title "$share - provisioned vs used IOPS" `
        -Metrics @(
            @{metric="FileShareProvisionedIOPS"; agg=4; share=$share}
            @{metric="FileShareMaxUsedIOPS";     agg=3; share=$share}
        ))
    Add-Tile (New-MetricTile -X 8 -Y $row -W 4 -H 4 -Title "$share - provisioned vs used throughput (MiB/s)" `
        -Metrics @(
            @{metric="FileShareProvisionedBandwidthMiBps"; agg=4; share=$share}
            @{metric="FileShareMaxUsedBandwidthMiBps";     agg=3; share=$share}
        ))
    $row += 4
}

$dashboard = @{
    lenses = @(
        @{
            order = 0
            parts = @($tiles)
        }
    )
    metadata = @{
        model = @{
            timeRange = @{
                value = @{ relative = @{ duration = 4; timeUnit = 1 } }
                type  = "MsPortalFx.Composition.Configuration.ValueTypes.TimeRange"
            }
        }
    }
}

$tmp = Join-Path $env:TEMP "fs-dashboard-$([guid]::NewGuid().ToString('N').Substring(0,6)).json"
$dashboard | ConvertTo-Json -Depth 40 | Set-Content -Path $tmp -Encoding ascii
Write-Host "Dashboard JSON written: $tmp"

az portal dashboard create --resource-group $ResourceGroup --name $DashboardName `
    --location $Location --input-path $tmp --query "{name:name, id:id}" -o json

$portalUrl = "https://portal.azure.com/#@/dashboard/arm/subscriptions/$subId/resourcegroups/$ResourceGroup/providers/microsoft.portal/dashboards/$DashboardName"
Write-Host "`nOpen in portal:`n$portalUrl" -ForegroundColor Cyan
Remove-Item $tmp -ErrorAction SilentlyContinue
