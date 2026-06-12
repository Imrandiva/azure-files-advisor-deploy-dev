// Scoped role assignment helper (assigns a role on a single storage account).
param principalId string
param roleDefinitionId string
param targetStorageAccountName string

resource targetStorage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: targetStorageAccountName
}

resource assignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(targetStorage.id, principalId, roleDefinitionId)
  scope: targetStorage
  properties: {
    principalId: principalId
    roleDefinitionId: roleDefinitionId
    principalType: 'ServicePrincipal'
  }
}
