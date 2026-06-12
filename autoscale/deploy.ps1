<#
.SYNOPSIS
  Deploys the Azure Files Provisioned v2 auto-remediation (Logic App + alerts)
  in a single step. No code to publish, no function host.

.EXAMPLE
  ./deploy.ps1 -ResourceGroup rg-provisioned -TargetStorageAccount stprovv2kcux3d -Location eastus2
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string]$ResourceGroup,
  [Parameter(Mandatory)] [string]$TargetStorageAccount,
  [string]$Location = "eastus2",
  [string]$LogicAppName = "fileshare-autoscale",
  [int]$IopsThreshold = 400,
  [int]$MibpsThreshold = 48
)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$infra = Join-Path $here "infra"

Write-Host "==> Deploying Logic App + role + action group + alerts..." -ForegroundColor Cyan
az deployment group create `
  --resource-group $ResourceGroup `
  --template-file (Join-Path $infra "main.bicep") `
  --parameters logicAppName=$LogicAppName `
               targetStorageAccountName=$TargetStorageAccount `
               location=$Location `
               iopsThreshold=$IopsThreshold `
               mibpsThreshold=$MibpsThreshold `
  --only-show-errors | Out-Null

Write-Host "Done. Shares that saturate will be auto-scaled by the Logic App." -ForegroundColor Green
Write-Host "Tip: open the Logic App's run history to see each remediation decision."
