<#
.SYNOPSIS
  Deploy the Provisioning Advisor to Azure App Service (Linux, Node 20).
  Default SKU is B1 (~$13/mo, always-on). Use F1 for a free demo plan.

.EXAMPLE
  ./deploy-advisor-appservice.ps1 -ResourceGroup rg-advisor -AppName fs-advisor -Sku B1
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string]$ResourceGroup,
  [Parameter(Mandatory)] [string]$AppName,
  [string]$Location = "westeurope",
  [string]$Sku = "B1",
  [string]$GrantScope = ""
)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Resolve-Path (Join-Path $here "..\advisor")
$plan = "$AppName-plan"

Write-Host "==> Ensuring resource group + plan ($Sku Linux)..." -ForegroundColor Cyan
az group create -n $ResourceGroup -l $Location --only-show-errors | Out-Null
az appservice plan create -g $ResourceGroup -n $plan --is-linux --sku $Sku --only-show-errors | Out-Null

Write-Host "==> Creating web app (Node 20)..." -ForegroundColor Cyan
az webapp create -g $ResourceGroup -p $plan -n $AppName --runtime "NODE:20-lts" --only-show-errors | Out-Null
az webapp config set -g $ResourceGroup -n $AppName --startup-file "node server.mjs" --only-show-errors | Out-Null
az webapp config appsettings set -g $ResourceGroup -n $AppName --settings SCM_DO_BUILD_DURING_DEPLOYMENT=true --only-show-errors | Out-Null

Write-Host "==> Zipping + deploying source..." -ForegroundColor Cyan
$tmp = New-Item -ItemType Directory -Path (Join-Path $env:TEMP ("advisor-" + [guid]::NewGuid().ToString("N").Substring(0,8)))
$zip = Join-Path $tmp "advisor.zip"
Compress-Archive -Path (Join-Path $src "advisor.mjs"), (Join-Path $src "ui.mjs"), (Join-Path $src "azusage.mjs"), (Join-Path $src "server.mjs"), (Join-Path $src "package.json") -DestinationPath $zip -Force
az webapp deploy -g $ResourceGroup -n $AppName --src-path $zip --type zip --only-show-errors | Out-Null
Remove-Item $tmp -Recurse -Force

Write-Host "==> Enabling system-assigned managed identity..." -ForegroundColor Cyan
az webapp identity assign -g $ResourceGroup -n $AppName --only-show-errors | Out-Null
$principalId = az webapp identity show -g $ResourceGroup -n $AppName --query principalId -o tsv

Write-Host "==> App URL: https://$AppName.azurewebsites.net" -ForegroundColor Green
Write-Host "==> Identity principalId: $principalId"

$monReader = "43d0d8ad-25c7-4714-9337-8ba259a9fe05"  # Monitoring Reader
if ($GrantScope) {
  Write-Host "==> Granting Monitoring Reader on $GrantScope ..." -ForegroundColor Cyan
  az role assignment create --assignee-object-id $principalId --assignee-principal-type ServicePrincipal `
    --role $monReader --scope $GrantScope | Out-Null
} else {
  Write-Host "NOTE: grant the identity 'Monitoring Reader' on each subscription/RG users will query, e.g.:" -ForegroundColor Yellow
  Write-Host "  az role assignment create --assignee-object-id $principalId --assignee-principal-type ServicePrincipal ``"
  Write-Host "    --role $monReader --scope /subscriptions/<sub-id>"
}
