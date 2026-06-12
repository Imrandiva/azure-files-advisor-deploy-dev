// One-click deploy of the Provisioning Advisor to Azure Container Apps.
//
// Deploys, in a single step:
//   * a Log Analytics workspace (required by the Container Apps environment),
//   * a Container Apps environment,
//   * the advisor Container App from a prebuilt public image, with a
//     system-assigned managed identity and scale-to-zero (minReplicas: 0).
//
// The app authenticates to Azure Monitor with its managed identity, so after
// deploy you grant that identity "Monitoring Reader" on each subscription /
// resource group your users will query (see the README). Nothing is hardcoded
// to a customer environment.

@description('Name for the Container App.')
param appName string = 'provisioning-advisor'

@description('Location for all resources.')
param location string = resourceGroup().location

@description('Container image to run. Defaults to the published public image.')
param image string = 'ghcr.io/imrandiva/azure-files-provisioning-advisor:latest'

@description('Port the app listens on.')
param targetPort int = 8080

@description('Max replicas to scale out to under load.')
@minValue(1)
@maxValue(30)
param maxReplicas int = 3

var workspaceName = '${appName}-logs'
var envName = '${appName}-env'

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: workspaceName
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: envName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: {
        external: true
        targetPort: targetPort
        transport: 'auto'
        allowInsecure: false
      }
    }
    template: {
      containers: [
        {
          name: 'advisor'
          image: image
          resources: {
            cpu: json('0.5')
            memory: '1.0Gi'
          }
          env: [
            { name: 'PORT', value: string(targetPort) }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http-scale'
            http: { metadata: { concurrentRequests: '20' } }
          }
        ]
      }
    }
  }
}

@description('Public URL of the advisor.')
output appUrl string = 'https://${app.properties.configuration.ingress.fqdn}'

@description('Managed identity principalId to grant Monitoring Reader.')
output principalId string = app.identity.principalId
