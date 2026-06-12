// Auto-remediation for Azure Files Provisioned v2 — Logic App edition.
//
// Deploys, in a single step:
//   * a Consumption Logic App whose workflow reads a saturated share and bumps
//     the saturated dimension (IOPS or throughput) via ARM, using its own
//     system-assigned managed identity (no secrets, no code to publish);
//   * a role assignment letting that identity read+update file shares on the
//     target storage account;
//   * an Action Group that calls the Logic App directly (callback URL resolved
//     at deploy time — no webhook key juggling);
//   * two metric alerts (IOPS + throughput saturation) that fire the group.
//
// The whole thing is one `az deployment group create`. See ../deploy.ps1.

@description('Location for the Logic App. Metric alerts are global regardless.')
param location string = resourceGroup().location

@description('Name for the Logic App workflow.')
param logicAppName string = 'fileshare-autoscale'

@description('Name of the EXISTING storage account whose file shares should be auto-scaled.')
param targetStorageAccountName string

@description('Resource group of the target storage account (defaults to this RG).')
param targetStorageAccountResourceGroup string = resourceGroup().name

@description('Percent to scale the saturated dimension to when an alert fires (150 = x1.5).')
param bumpPercent int = 150

@description('Hard cap for provisioned IOPS (HDD max = 50000, SSD max = 102400).')
param maxIops int = 50000

@description('Hard cap for provisioned throughput MiB/s (HDD max = 5120, SSD max = 10340).')
param maxMibps int = 5120

@description('Storage ARM API version used for the GET/PATCH.')
param apiVersion string = '2024-01-01'

@description('Used-IOPS threshold that triggers an IOPS bump (~80% of the floor you want protected).')
param iopsThreshold int = 400

@description('Used-throughput (MiB/s) threshold that triggers a throughput bump.')
param mibpsThreshold int = 48

@description('How often to evaluate the rules.')
param evaluationFrequency string = 'PT1M'

@description('Lookback window for each evaluation.')
param windowSize string = 'PT5M'

// "Storage Account Contributor" lets the identity read + update file shares.
var storageAccountContributor = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '17d1049b-9a84-46fb-8f53-869881c3d3ab')
var metricNamespace = 'Microsoft.Storage/storageAccounts/fileServices'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: targetStorageAccountName
}

// Metric alerts on FileShare* metrics target the file SERVICE sub-resource,
// not the storage account itself — scope and targetResourceType must agree.
var fileServiceId = '${storage.id}/fileServices/default'

resource logic 'Microsoft.Logic/workflows@2019-05-01' = {
  name: logicAppName
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    state: 'Enabled'
    definition: loadJsonContent('workflow.json')
    parameters: {
      bumpPercent: { value: bumpPercent }
      maxIops: { value: maxIops }
      maxMibps: { value: maxMibps }
      apiVersion: { value: apiVersion }
    }
  }
}

module roleAssign 'role.bicep' = {
  name: 'logic-role-${uniqueString(logic.id)}'
  scope: resourceGroup(targetStorageAccountResourceGroup)
  params: {
    principalId: logic.identity.principalId
    roleDefinitionId: storageAccountContributor
    targetStorageAccountName: targetStorageAccountName
  }
}

resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: 'ag-fileshare-autoscale'
  location: 'global'
  properties: {
    groupShortName: 'fsAutoscl'
    enabled: true
    logicAppReceivers: [
      {
        name: 'autoscaleLogicApp'
        resourceId: logic.id
        callbackUrl: listCallbackUrl('${logic.id}/triggers/manual', '2019-05-01').value
        useCommonAlertSchema: true
      }
    ]
  }
}

resource iopsAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'fileshare-iops-saturation'
  location: 'global'
  properties: {
    description: 'A file share is approaching its provisioned IOPS limit; auto-increase IOPS.'
    severity: 2
    enabled: true
    scopes: [ fileServiceId ]
    targetResourceType: metricNamespace
    evaluationFrequency: evaluationFrequency
    windowSize: windowSize
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'usedIops'
          metricNamespace: metricNamespace
          metricName: 'FileShareMaxUsedIOPS'
          operator: 'GreaterThan'
          threshold: iopsThreshold
          timeAggregation: 'Maximum'
          criterionType: 'StaticThresholdCriterion'
          dimensions: [
            { name: 'FileShare', operator: 'Include', values: [ '*' ] }
          ]
        }
      ]
    }
    autoMitigate: true
    actions: [ { actionGroupId: actionGroup.id } ]
  }
}

resource mibpsAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'fileshare-throughput-saturation'
  location: 'global'
  properties: {
    description: 'A file share is approaching its provisioned throughput limit; auto-increase throughput.'
    severity: 2
    enabled: true
    scopes: [ fileServiceId ]
    targetResourceType: metricNamespace
    evaluationFrequency: evaluationFrequency
    windowSize: windowSize
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'usedThroughput'
          metricNamespace: metricNamespace
          metricName: 'FileShareMaxUsedBandwidthMiBps'
          operator: 'GreaterThan'
          threshold: mibpsThreshold
          timeAggregation: 'Maximum'
          criterionType: 'StaticThresholdCriterion'
          dimensions: [
            { name: 'FileShare', operator: 'Include', values: [ '*' ] }
          ]
        }
      ]
    }
    autoMitigate: true
    actions: [ { actionGroupId: actionGroup.id } ]
  }
}

output logicAppName string = logic.name
output logicAppPrincipalId string = logic.identity.principalId
output actionGroupId string = actionGroup.id
