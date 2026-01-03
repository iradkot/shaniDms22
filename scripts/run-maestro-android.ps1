Param(
  # Default to the whole suite so new flows (e.g. charts-smoke.yaml) run automatically.
  [string]$FlowPath = "e2e/maestro",
  [int]$TopSlowestSteps = 10
)

$ErrorActionPreference = 'Stop'

$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $workspace

$maestroExe = Join-Path $workspace '.tools/maestro/maestro/bin/maestro.bat'

if (-not (Test-Path $maestroExe)) {
  Write-Host "Maestro not found under .tools/. Installing..."
  yarn e2e:maestro:install:win
}

$maestro = $maestroExe

$resultsDir = Join-Path $workspace 'e2e/results'
New-Item -ItemType Directory -Force -Path $resultsDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$junitRelative = "e2e/results/maestro-android-$timestamp.xml"
$junitPath = Join-Path $workspace ($junitRelative -replace '/', '\\')
$debugRelative = "e2e/results/debug-$timestamp"
$debugPath = Join-Path $workspace ($debugRelative -replace '/', '\\')

Write-Host "Running Maestro flow(s): $FlowPath"
Write-Host "JUnit report: $junitPath"
Write-Host "Debug output: $debugPath"

$sw = [System.Diagnostics.Stopwatch]::StartNew()

# Run with JUnit output + debug output (commands json) so we can count steps on Windows.
New-Item -ItemType Directory -Force -Path $debugPath | Out-Null
& $maestro test --format JUNIT --output $junitRelative --debug-output $debugRelative --flatten-debug-output $FlowPath

$exitCode = 0
if (-not $?) {
  $exitCode = 1
}
if ($LASTEXITCODE -ne $null -and $LASTEXITCODE -ne 0) {
  $exitCode = $LASTEXITCODE
}

$sw.Stop()

# Count executed/skipped steps from Maestro debug output.
$executedStepsCount = 0
$skippedStepsCount = 0
$executedAssertionsCount = 0
$executedActionsCount = 0
$executedInternalCount = 0
$executedStepDetails = @()

function Get-MaestroCommandLabel {
  param(
    [Parameter(Mandatory = $true)]$Entry
  )

  $cmd = $Entry.command
  if (-not $cmd) { return "(unknown)" }

  $props = @($cmd.PSObject.Properties | Select-Object -ExpandProperty Name)
  if ($props.Count -eq 0) { return "(unknown)" }

  $type = $props[0]

  switch ($type) {
    'tapOnElement' {
      $sel = $cmd.tapOnElement.selector
      if ($sel.idRegex) { return "tap id:$($sel.idRegex)" }
      if ($sel.textRegex) { return "tap text:$($sel.textRegex)" }
      return 'tap'
    }
    'assertConditionCommand' {
      $vis = $cmd.assertConditionCommand.condition.visible
      if ($vis.idRegex) { return "assert visible id:$($vis.idRegex)" }
      if ($vis.textRegex) { return "assert visible text:$($vis.textRegex)" }
      return 'assert'
    }
    'launchAppCommand' {
      $appId = $cmd.launchAppCommand.appId
      if ($appId) { return "launch app:$appId" }
      return 'launch app'
    }
    'backPressCommand' {
      return 'back'
    }
    'runFlowCommand' {
      return 'runFlow'
    }
    'applyConfigurationCommand' {
      return 'applyConfig'
    }
    'defineVariablesCommand' {
      return 'defineVars'
    }
    Default {
      return $type
    }
  }
}

try {
  $commandFiles = Get-ChildItem -LiteralPath $debugPath -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'commands-*.json' }
  foreach ($f in $commandFiles) {
    $json = Get-Content -LiteralPath $f.FullName -Raw | ConvertFrom-Json

    # Maestro may output either a JSON array of entries, or an object wrapper with a `value` array.
    $entries = @()
    if ($json -is [System.Array]) {
      $entries = @($json)
    } elseif ($null -ne $json.value) {
      $entries = @($json.value)
    } else {
      $entries = @($json)
    }

    $executed = @($entries | Where-Object { $_.metadata.status -in @('COMPLETED', 'FAILED') })
    $skipped = @($entries | Where-Object { $_.metadata.status -eq 'SKIPPED' })

    $executedStepsCount += $executed.Count
    $skippedStepsCount += $skipped.Count

    foreach ($e in $executed) {
      $commandType = $null
      if ($e.command) {
        $props = @($e.command.PSObject.Properties | Select-Object -ExpandProperty Name)
        if ($props.Count -gt 0) { $commandType = $props[0] }
      }

      $bucket = 'action'
      if ($commandType -eq 'assertConditionCommand') {
        $bucket = 'assertion'
      } elseif ($commandType -in @('applyConfigurationCommand', 'defineVariablesCommand')) {
        $bucket = 'internal'
      }

      if ($bucket -eq 'assertion') {
        $executedAssertionsCount += 1
      } elseif ($bucket -eq 'internal') {
        $executedInternalCount += 1
      } else {
        $executedActionsCount += 1
      }

      $durationMs = 0
      if ($e.metadata -and $e.metadata.duration -ne $null) {
        $durationMs = [int]$e.metadata.duration
      }

      $executedStepDetails += [PSCustomObject]@{
        Bucket = $bucket
        Type = $commandType
        DurationMs = $durationMs
        Label = (Get-MaestroCommandLabel -Entry $e)
      }
    }
  }
} catch {
  # best-effort only
}

# Summarize results from the JUnit xml.
# Maestro uses standard junit <testsuite tests=.. failures=.. errors=.. skipped=..>
if (-not (Test-Path -LiteralPath $junitPath)) {
  Write-Host ""
  Write-Host "Summary"
  Write-Host "- JUnit report was not created at: $junitPath"
  Write-Host ("- Duration: {0:n1}s" -f $sw.Elapsed.TotalSeconds)
  Write-Host "- Exit code: $exitCode"
  exit $exitCode
}

try {
  [xml]$xml = Get-Content -LiteralPath $junitPath
  $suite = $xml.testsuite
  if (-not $suite) {
    # Some junit writers wrap with <testsuites>
    $suite = $xml.testsuites.testsuite
  }

  $tests = [int]$suite.tests
  $failures = [int]$suite.failures
  $errors = [int]$suite.errors
  $skipped = 0
  if ($suite.skipped) { $skipped = [int]$suite.skipped }

  $passed = $tests - $failures - $errors - $skipped

  Write-Host ""
  Write-Host "Summary"
  Write-Host "- Total:   $tests"
  Write-Host "- Passed:  $passed"
  Write-Host "- Failed:  $failures"
  Write-Host "- Errors:  $errors"
  Write-Host "- Skipped: $skipped"
  Write-Host ("- Duration: {0:n1}s" -f $sw.Elapsed.TotalSeconds)
  Write-Host "- Exit code: $exitCode"

  Write-Host ""
  Write-Host "Step counts (from debug output)"
  Write-Host ("- Executed: {0} (Actions: {1}, Assertions: {2}, Internal: {3})" -f $executedStepsCount, $executedActionsCount, $executedAssertionsCount, $executedInternalCount)
  Write-Host ("- Skipped:  {0}" -f $skippedStepsCount)
  Write-Host ("- Debug:    {0}" -f $debugRelative)
  Write-Host ("- JUnit:     {0}" -f $junitRelative)

  if ($TopSlowestSteps -gt 0 -and $executedStepDetails.Count -gt 0) {
    Write-Host ""
    Write-Host ("Top {0} slowest steps" -f $TopSlowestSteps)
    $slow = $executedStepDetails |
      Sort-Object DurationMs -Descending |
      Select-Object -First $TopSlowestSteps

    foreach ($s in $slow) {
      $sec = [Math]::Round(($s.DurationMs / 1000.0), 2)
      Write-Host ("- {0,6}ms ({1,5}s) [{2}] {3}" -f $s.DurationMs, $sec, $s.Bucket, $s.Label)
    }
  }

  if ($failures -gt 0 -or $errors -gt 0) {
    Write-Host ""
    Write-Host "Failures/Errors:"
    # Print failing testcase names/messages (best-effort)
    $testcases = @($suite.testcase)
    foreach ($tc in $testcases) {
      if ($tc.failure) {
        Write-Host ("- FAIL: {0} :: {1}" -f $tc.name, $tc.failure.message)
      }
      if ($tc.error) {
        Write-Host ("- ERROR: {0} :: {1}" -f $tc.name, $tc.error.message)
      }
    }
  }
} catch {
  Write-Host "(Could not parse JUnit report for summary: $($_.Exception.Message))"
}

exit $exitCode
