#Requires -Version 7.0
<#
.SYNOPSIS
Reviews or deploys only shaniApi and its dedicated vault infrastructure.
.EXAMPLE
pwsh -File scripts/deploy-ai-backend.ps1 -ProjectId shanidms-3a065 -WhatIf
.EXAMPLE
pwsh -File scripts/deploy-ai-backend.ps1 -ProjectId shanidms-3a065
#>
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
param(
  [Parameter(Mandatory)]
  [ValidatePattern('^[a-z][a-z0-9-]{4,28}[a-z0-9]$')]
  [string]$ProjectId,
  [ValidatePattern('^[a-z]+-[a-z]+[0-9]+$')]
  [string]$Region = 'us-central1',
  [string[]]$AllowedCorsOrigins = @()
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$workspacePath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$sourcePath = Join-Path $workspacePath 'functions'
$functionName = 'shaniApi'
$serviceAccountId = 'shani-api-runtime'
$serviceAccountEmail = "$serviceAccountId@$ProjectId.iam.gserviceaccount.com"
$member = "serviceAccount:$serviceAccountEmail"
$roleId = 'shaniApiRuntime'
$roleName = "projects/$ProjectId/roles/$roleId"
$keyRing = 'shani-api-vault'
$key = 'account-secrets'
$kmsKeyName = "projects/$ProjectId/locations/$Region/keyRings/$keyRing/cryptoKeys/$key"
$requiredPermissions = @(
  'datastore.entities.create', 'datastore.entities.delete',
  'datastore.entities.get', 'datastore.entities.update', 'firebaseauth.users.get'
)

foreach ($origin in $AllowedCorsOrigins) {
  $parsedOrigin = $null
  if (-not [Uri]::TryCreate($origin, [UriKind]::Absolute, [ref]$parsedOrigin) -or
      $parsedOrigin.Scheme -ne 'https' -or $parsedOrigin.UserInfo -or
      $parsedOrigin.Query -or $parsedOrigin.Fragment -or
      $origin -cne $parsedOrigin.GetLeftPart([UriPartial]::Authority) -or
      $origin.Contains('|')) {
    throw "Each CORS origin must be an exact HTTPS origin without a path: $origin"
  }
}
$corsValue = ($AllowedCorsOrigins | Select-Object -Unique) -join ','
$gcloudCommand = (Get-Command gcloud -ErrorAction Stop).Source
$npmCommand = (Get-Command npm -ErrorAction Stop).Source

function Invoke-Gcloud {
  param([Parameter(Mandatory)][string[]]$Arguments)
  # gcloud.ps1 restores its process environment with Set-Item/Remove-Item.
  # Its bootstrap must run normally even in review mode. Every cloud mutation
  # is gated by the caller's ShouldProcess before entering this function.
  $WhatIfPreference = $false
  $output = & $gcloudCommand @Arguments "--project=$ProjectId" '--quiet'
  if ($LASTEXITCODE -ne 0) {
    throw "gcloud $($Arguments[0..([Math]::Min(2, $Arguments.Length - 1))] -join ' ') failed. No subsequent deployment step was run."
  }
  return $output
}

function Read-GcloudJson {
  param([Parameter(Mandatory)][string[]]$Arguments)
  $output = Invoke-Gcloud -Arguments ($Arguments + '--format=json')
  return (($output -join "`n") | ConvertFrom-Json -Depth 100)
}

Write-Host "Target: $ProjectId / $Region / $functionName"
Write-Host "Source: $sourcePath"
Write-Host "Runtime identity: $serviceAccountEmail"
Write-Host "KMS_KEY_NAME=$kmsKeyName"
Write-Host 'ALLOWED_LLM_MODELS=gpt-5.5'
Write-Host "ALLOWED_CORS_ORIGINS=$corsValue"

# Read-only inventory comes before every mutation. No Firebase-wide deploy is used.
$null = Read-GcloudJson -Arguments @('projects', 'describe', $ProjectId)
$beforeFunctions = @(Read-GcloudJson -Arguments @('functions', 'list', "--regions=$Region"))
$otherFunctions = @($beforeFunctions | Where-Object { ($_.name -split '/')[-1] -ne $functionName })
$enabledServices = @(Invoke-Gcloud -Arguments @('services', 'list', '--enabled', '--format=value(config.name)'))
$requiredServices = @(
  'cloudfunctions.googleapis.com', 'run.googleapis.com', 'artifactregistry.googleapis.com',
  'cloudbuild.googleapis.com', 'cloudkms.googleapis.com', 'iam.googleapis.com'
)
$missingServices = @($requiredServices | Where-Object { $_ -notin $enabledServices })
if ($missingServices.Count -gt 0 -and $PSCmdlet.ShouldProcess($ProjectId, "Enable APIs: $($missingServices -join ', ')")) {
  Invoke-Gcloud -Arguments (@('services', 'enable') + $missingServices) | Out-Host
}

$serviceAccounts = @(Read-GcloudJson -Arguments @('iam', 'service-accounts', 'list'))
if ($serviceAccountEmail -notin $serviceAccounts.email -and
    $PSCmdlet.ShouldProcess($serviceAccountEmail, 'Create dedicated runtime service account')) {
  Invoke-Gcloud -Arguments @('iam', 'service-accounts', 'create', $serviceAccountId,
    '--display-name=Shani API runtime') | Out-Host
}

$roles = @(Read-GcloudJson -Arguments @('iam', 'roles', 'list'))
$existingRole = $roles | Where-Object { $_.name -eq $roleName }
if ($existingRole) {
  $roleDetails = Read-GcloudJson -Arguments @('iam', 'roles', 'describe', $roleId)
  $difference = @(Compare-Object ($requiredPermissions | Sort-Object) ($roleDetails.includedPermissions | Sort-Object))
  if ($roleDetails.deleted -or $difference.Count -gt 0) {
    throw "Existing $roleName differs from the reviewed runtime permissions. Review it before continuing."
  }
} elseif ($PSCmdlet.ShouldProcess($roleName, "Create custom role: $($requiredPermissions -join ', ')")) {
  Invoke-Gcloud -Arguments @('iam', 'roles', 'create', $roleId, '--title=Shani API runtime',
    "--permissions=$($requiredPermissions -join ',')", '--stage=GA') | Out-Host
}

$projectPolicy = Read-GcloudJson -Arguments @('projects', 'get-iam-policy', $ProjectId)
$runtimeBinding = $projectPolicy.bindings | Where-Object {
  $_.role -eq $roleName -and $member -in $_.members -and -not $_.condition
}
if (-not $runtimeBinding -and $PSCmdlet.ShouldProcess($serviceAccountEmail, "Grant only $roleName on $ProjectId")) {
  Invoke-Gcloud -Arguments @('projects', 'add-iam-policy-binding', $ProjectId,
    "--member=$member", "--role=$roleName", '--condition=None') | Out-Null
}

$keyRingExists = $false
$keyExists = $false
# A disabled API is not invoked during -WhatIf, avoiding automatic enable prompts.
if ('cloudkms.googleapis.com' -in $enabledServices -or -not $WhatIfPreference) {
  $keyRings = @(Read-GcloudJson -Arguments @('kms', 'keyrings', 'list', "--location=$Region"))
  $keyRingExists = "projects/$ProjectId/locations/$Region/keyRings/$keyRing" -in $keyRings.name
}
if (-not $keyRingExists -and $PSCmdlet.ShouldProcess("$Region/$keyRing", 'Create KMS key ring')) {
  Invoke-Gcloud -Arguments @('kms', 'keyrings', 'create', $keyRing, "--location=$Region") | Out-Host
  $keyRingExists = $true
}
if ($keyRingExists) {
  $keys = @(Read-GcloudJson -Arguments @('kms', 'keys', 'list', "--keyring=$keyRing", "--location=$Region"))
  $existingKey = $keys | Where-Object { $_.name -eq $kmsKeyName }
  $keyExists = $null -ne $existingKey
  if ($keyExists -and ($existingKey.purpose -ne 'ENCRYPT_DECRYPT' -or $existingKey.primary.state -ne 'ENABLED')) {
    throw "The existing KMS key is not an enabled symmetric encryption key: $kmsKeyName"
  }
}
if (-not $keyExists -and $PSCmdlet.ShouldProcess($kmsKeyName, 'Create symmetric KMS encryption key')) {
  Invoke-Gcloud -Arguments @('kms', 'keys', 'create', $key, "--keyring=$keyRing", "--location=$Region",
    '--purpose=encryption') | Out-Host
  $keyExists = $true
}
$kmsBinding = $null
if ($keyExists) {
  $kmsPolicy = Read-GcloudJson -Arguments @('kms', 'keys', 'get-iam-policy', $key,
    "--keyring=$keyRing", "--location=$Region")
  $kmsBinding = $kmsPolicy.bindings | Where-Object {
    $_.role -eq 'roles/cloudkms.cryptoKeyEncrypterDecrypter' -and $member -in $_.members -and -not $_.condition
  }
}
if (-not $kmsBinding -and $PSCmdlet.ShouldProcess($kmsKeyName, "Grant encrypt/decrypt on this key only to $serviceAccountEmail")) {
  Invoke-Gcloud -Arguments @('kms', 'keys', 'add-iam-policy-binding', $key,
    "--keyring=$keyRing", "--location=$Region", "--member=$member",
    '--role=roles/cloudkms.cryptoKeyEncrypterDecrypter', '--condition=None') | Out-Null
}

$envValues = "^|^KMS_KEY_NAME=$kmsKeyName|ALLOWED_LLM_MODELS=gpt-5.5|ALLOWED_CORS_ORIGINS=$corsValue|GCLOUD_PROJECT=$ProjectId"
if ($PSCmdlet.ShouldProcess("$ProjectId/$Region/$functionName", 'Verify backend and deploy only shaniApi as a public HTTP service protected by Firebase authentication')) {
  & $npmCommand '--prefix' $sourcePath 'run' 'verify'
  if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed; shaniApi was not deployed.' }

  Invoke-Gcloud -Arguments @('functions', 'deploy', $functionName, '--gen2', "--region=$Region",
    '--entry-point=shaniApi', '--runtime=nodejs22', "--source=$sourcePath",
    "--ignore-file=$(Join-Path $sourcePath '.gcloudignore')", '--trigger-http', '--allow-unauthenticated',
    "--run-service-account=$serviceAccountEmail", '--memory=512MiB', '--timeout=90s',
    '--max-instances=20', '--concurrency=40', '--set-build-env-vars=GOOGLE_NODE_RUN_SCRIPTS=build',
    "--set-env-vars=$envValues") | Out-Host

  $deployed = Read-GcloudJson -Arguments @('functions', 'describe', $functionName, '--gen2', "--region=$Region")
  $baseUrl = "https://$Region-$ProjectId.cloudfunctions.net/$functionName"
  $probe = Invoke-WebRequest -Uri "$baseUrl/v1/vault/llm/status?provider=openai" -Method Get -SkipHttpErrorCheck -TimeoutSec 30
  $probeBody = $probe.Content | ConvertFrom-Json
  if ([int]$probe.StatusCode -ne 401 -or $probeBody.version -ne 1 -or $probeBody.code -ne 'unauthenticated') {
    throw 'The deployed endpoint did not return the expected authenticated API response. Inspect shaniApi before publishing clients.'
  }

  $afterFunctions = @(Read-GcloudJson -Arguments @('functions', 'list', "--regions=$Region"))
  foreach ($existingFunction in $otherFunctions) {
    $after = $afterFunctions | Where-Object { $_.name -eq $existingFunction.name }
    if (-not $after -or $after.updateTime -ne $existingFunction.updateTime) {
      Write-Warning "An unrelated function changed during deployment: $($existingFunction.name). This script did not deploy it."
    }
  }
  Write-Host "API endpoint: $baseUrl"
  Write-Host "Cloud Run service: $($deployed.serviceConfig.uri)"
  Write-Host 'Unauthenticated probe passed: HTTP 401 / unauthenticated. No provider key was used.'
  Write-Host 'Next: test save and the explicit AI connection check in the signed-in app.'
} else {
  Write-Host "Review complete. Expected endpoint: https://$Region-$ProjectId.cloudfunctions.net/$functionName"
  Write-Host 'No deployment or AI provider request was made.'
}
