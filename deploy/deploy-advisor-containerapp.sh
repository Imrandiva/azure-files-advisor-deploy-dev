#!/usr/bin/env bash
# Build + deploy the Provisioning Advisor to Azure Container Apps (scale-to-zero),
# enable a system-assigned managed identity, and optionally grant it Monitoring
# Reader so the "Pull live peak" button works.
#
# Usage:
#   ./deploy-advisor-containerapp.sh <resource-group> <app-name> [location] [grant-scope]
#
#   grant-scope (optional): a subscription or resource-group resource ID to grant
#   the app's identity "Monitoring Reader" on. Omit to print the command instead.
set -euo pipefail

RG="${1:?resource group required}"
APP="${2:?container app name required}"
LOCATION="${3:-westeurope}"
GRANT_SCOPE="${4:-}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/../advisor"

echo "==> Deploying $APP from $SRC ..."
az containerapp up \
  --name "$APP" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --source "$SRC" \
  --ingress external \
  --target-port 8080

echo "==> Enabling system-assigned managed identity..."
az containerapp identity assign --name "$APP" --resource-group "$RG" --system-assigned >/dev/null
PRINCIPAL_ID="$(az containerapp identity show --name "$APP" --resource-group "$RG" --query principalId -o tsv)"
FQDN="$(az containerapp show --name "$APP" --resource-group "$RG" --query properties.configuration.ingress.fqdn -o tsv)"

echo "==> App URL: https://${FQDN}"
echo "==> Identity principalId: ${PRINCIPAL_ID}"

MON_READER="43d0d8ad-25c7-4714-9337-8ba259a9fe05"  # Monitoring Reader
if [[ -n "$GRANT_SCOPE" ]]; then
  echo "==> Granting Monitoring Reader on ${GRANT_SCOPE} ..."
  az role assignment create --assignee-object-id "$PRINCIPAL_ID" --assignee-principal-type ServicePrincipal \
    --role "$MON_READER" --scope "$GRANT_SCOPE" >/dev/null
  echo "    Granted."
else
  echo "NOTE: grant the identity 'Monitoring Reader' on each subscription/RG users will query, e.g.:"
  echo "  az role assignment create --assignee-object-id ${PRINCIPAL_ID} --assignee-principal-type ServicePrincipal \\"
  echo "    --role ${MON_READER} --scope /subscriptions/<sub-id>"
fi
