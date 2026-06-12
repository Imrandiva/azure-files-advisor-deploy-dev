<#
.SYNOPSIS
  Build + deploy the Provisioning Advisor to Azure Container Apps (scale-to-zero),
  enable a system-assigned managed identity, and optionally grant it Monitoring
  Reader so the "Pull live peak" button works.

.EXAMPLE
  ./deploy-advisor-containerapp.ps1 -ResourceGroup rg-advisor -AppName fs-advisor -Location westeurope
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string]$ResourceGroup,
  [Parameter(Mandatory)] [string]$AppName,
  [string]$Location = "westeurope",
  [string]$GrantScope = ""
)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $here "..\advisor"

Write-Host "==> Deploying $AppName from $src ..." -ForegroundColor Cyan
az containerapp up `
  --name $AppName `
  --resource-group $ResourceGroup `
  --location $Location `
  --source $src `
  --ingress external `
  --target-port 8080

Write-Host "==> Enabling system-assigned managed identity..." -ForegroundColor Cyan
az containerapp identity assign --name $AppName --resource-group $ResourceGroup --system-assigned | Out-Null
$principalId = az containerapp identity show --name $AppName --resource-group $ResourceGroup --query principalId -o tsv
$fqdn = az containerapp show --name $AppName --resource-group $ResourceGroup --query properties.configuration.ingress.fqdn -o tsv

Write-Host "==> App URL: https://$fqdn" -ForegroundColor Green
Write-Host "==> Identity principalId: $principalId"

$monReader = "43d0d8ad-25c7-4714-9337-8ba259a9fe05"  # Monitoring Reader
if ($GrantScope) {
  Write-Host "==> Granting Monitoring Reader on $GrantScope ..." -ForegroundColor Cyan
  az role assignment create --assignee-object-id $principalId --assignee-principal-type ServicePrincipal `
    --role $monReader --scope $GrantScope | Out-Null
  Write-Host "    Granted."
} else {
  Write-Host "NOTE: grant the identity 'Monitoring Reader' on each subscription/RG users will query, e.g.:" -ForegroundColor Yellow
  Write-Host "  az role assignment create --assignee-object-id $principalId --assignee-principal-type ServicePrincipal ``"
  Write-Host "    --role $monReader --scope /subscriptions/<sub-id>"
}
