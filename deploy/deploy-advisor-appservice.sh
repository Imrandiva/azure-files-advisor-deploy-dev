#!/usr/bin/env bash
# Deploy the Provisioning Advisor to Azure App Service (Linux, Node 20).
# Default SKU is B1 (~$13/mo, always-on). Use F1 for a free demo plan.
#
# Usage:
#   ./deploy-advisor-appservice.sh <resource-group> <app-name> [location] [sku] [grant-scope]
set -euo pipefail

RG="${1:?resource group required}"
APP="${2:?web app name required}"
LOCATION="${3:-westeurope}"
SKU="${4:-B1}"
GRANT_SCOPE="${5:-}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/../advisor"
PLAN="${APP}-plan"

echo "==> Ensuring resource group + plan ($SKU Linux)..."
az group create -n "$RG" -l "$LOCATION" --only-show-errors >/dev/null
az appservice plan create -g "$RG" -n "$PLAN" --is-linux --sku "$SKU" --only-show-errors >/dev/null

echo "==> Creating web app (Node 20)..."
az webapp create -g "$RG" -p "$PLAN" -n "$APP" --runtime "NODE:20-lts" --only-show-errors >/dev/null
az webapp config set -g "$RG" -n "$APP" --startup-file "node server.mjs" --only-show-errors >/dev/null
az webapp config appsettings set -g "$RG" -n "$APP" --settings SCM_DO_BUILD_DURING_DEPLOYMENT=true --only-show-errors >/dev/null

echo "==> Zipping + deploying source..."
TMP="$(mktemp -d)"
ZIP="$TMP/advisor.zip"
( cd "$SRC" && zip -q -r "$ZIP" advisor.mjs ui.mjs azusage.mjs server.mjs package.json )
az webapp deploy -g "$RG" -n "$APP" --src-path "$ZIP" --type zip --only-show-errors >/dev/null
rm -rf "$TMP"

echo "==> Enabling system-assigned managed identity..."
az webapp identity assign -g "$RG" -n "$APP" --only-show-errors >/dev/null
PRINCIPAL_ID="$(az webapp identity show -g "$RG" -n "$APP" --query principalId -o tsv)"

echo "==> App URL: https://${APP}.azurewebsites.net"
echo "==> Identity principalId: ${PRINCIPAL_ID}"

MON_READER="43d0d8ad-25c7-4714-9337-8ba259a9fe05"  # Monitoring Reader
if [[ -n "$GRANT_SCOPE" ]]; then
  echo "==> Granting Monitoring Reader on ${GRANT_SCOPE} ..."
  az role assignment create --assignee-object-id "$PRINCIPAL_ID" --assignee-principal-type ServicePrincipal \
    --role "$MON_READER" --scope "$GRANT_SCOPE" >/dev/null
else
  echo "NOTE: grant the identity 'Monitoring Reader' on each subscription/RG users will query, e.g.:"
  echo "  az role assignment create --assignee-object-id ${PRINCIPAL_ID} --assignee-principal-type ServicePrincipal \\"
  echo "    --role ${MON_READER} --scope /subscriptions/<sub-id>"
fi
