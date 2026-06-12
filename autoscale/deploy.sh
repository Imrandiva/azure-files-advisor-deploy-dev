#!/usr/bin/env bash
# Deploys the Azure Files Provisioned v2 auto-remediation (Logic App + alerts)
# in a single step. No code to publish, no function host.
#
# Usage: ./deploy.sh <resource-group> <target-storage-account> [location] [logic-app-name]
set -euo pipefail

RG="${1:?resource group required}"
ACCOUNT="${2:?target storage account required}"
LOCATION="${3:-eastus2}"
LOGIC_APP="${4:-fileshare-autoscale}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Deploying Logic App + role + action group + alerts..."
az deployment group create \
  --resource-group "$RG" \
  --template-file "$HERE/infra/main.bicep" \
  --parameters logicAppName="$LOGIC_APP" \
               targetStorageAccountName="$ACCOUNT" \
               location="$LOCATION" \
  --only-show-errors >/dev/null

echo "Done. Shares that saturate will be auto-scaled by the Logic App."
echo "Tip: open the Logic App's run history to see each remediation decision."
