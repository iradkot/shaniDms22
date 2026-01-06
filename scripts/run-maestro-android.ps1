Param(
  # Default to the whole suite so new flows (e.g. charts-smoke.yaml) run automatically.
  [string]$FlowPath = "e2e/maestro",
  [int]$TopSlowestSteps = 10,
  [switch]$SkipBuild,
  [switch]$SkipInstall,
  [string]$AppId = "com.shanidms22"
)

$ErrorActionPreference = 'Stop'

# PowerShell 7+ can treat native command stderr as a terminating error when
# PSNativeCommandUseErrorActionPreference is enabled. That breaks Gradle builds
# that emit harmless warnings to stderr. We capture logs and check exit codes
# explicitly instead.
try {
  if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -Scope Global -ErrorAction SilentlyContinue) {
    $global:PSNativeCommandUseErrorActionPreference = $false
  }
} catch {
  # ignore
}

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

# Per-run output folder + stable latest-run mirror for quick inspection.
$runRelative = "e2e/results/run-$timestamp"
$runPath = Join-Path $workspace ($runRelative -replace '/', '\\')
New-Item -ItemType Directory -Force -Path $runPath | Out-Null

$latestRunPath = Join-Path $resultsDir 'latest-run'
if (Test-Path -LiteralPath $latestRunPath) {
  Remove-Item -LiteralPath $latestRunPath -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force -Path $latestRunPath | Out-Null

$junitRelative = "$runRelative/maestro-android.xml"
$junitPath = Join-Path $workspace ($junitRelative -replace '/', '\\')
$debugRelative = "$runRelative/debug"
$debugPath = Join-Path $workspace ($debugRelative -replace '/', '\\')

$maestroLogPath = Join-Path $runPath 'maestro.log.txt'
$logcatPath = Join-Path $runPath 'adb-logcat.txt'
$metaPath = Join-Path $runPath 'run-info.txt'
$nodeErrorsPath = Join-Path $runPath 'node-errors'
New-Item -ItemType Directory -Force -Path $nodeErrorsPath | Out-Null

try {
  $gitSha = (git rev-parse --short HEAD 2>$null)
} catch {
  $gitSha = ''
}

"Timestamp: $timestamp" | Out-File -FilePath $metaPath -Encoding utf8
"FlowPath:   $FlowPath" | Out-File -FilePath $metaPath -Append -Encoding utf8
if ($gitSha) { "Git:       $gitSha" | Out-File -FilePath $metaPath -Append -Encoding utf8 }
"AppId:     $AppId" | Out-File -FilePath $metaPath -Append -Encoding utf8
"Workspace: $workspace" | Out-File -FilePath $metaPath -Append -Encoding utf8
try {
  "" | Out-File -FilePath $metaPath -Append -Encoding utf8
  "adb devices -l:" | Out-File -FilePath $metaPath -Append -Encoding utf8
  (adb devices -l 2>&1) | Out-File -FilePath $metaPath -Append -Encoding utf8
} catch {
  # ignore
}

Write-Host "Running Maestro flow(s): $FlowPath"
Write-Host "JUnit report: $junitPath"
Write-Host "Debug output: $debugPath"
Write-Host "Run folder:   $runPath"
Write-Host "Latest-run:   $latestRunPath"

if (-not $SkipBuild) {
  Write-Host "Building E2E-enabled Android release APK (E2E=true)..."
  $previousE2E = $env:E2E
  try {
    Push-Location (Join-Path $workspace 'android')
    $env:E2E = 'true'
    $gradleLog = (Join-Path $runPath 'gradle-assembleRelease.log.txt')
    $gradleStdout = (Join-Path $runPath 'gradle-assembleRelease.stdout.txt')
    $gradleStderr = (Join-Path $runPath 'gradle-assembleRelease.stderr.txt')

    $gradleProc = Start-Process -FilePath '.\gradlew.bat' -ArgumentList @(':app:assembleRelease') -NoNewWindow -Wait -PassThru -RedirectStandardOutput $gradleStdout -RedirectStandardError $gradleStderr
    $gradleExit = $gradleProc.ExitCode

    # Combine for convenience
    try {
      "--- STDOUT ---" | Out-File -FilePath $gradleLog -Encoding utf8
      if (Test-Path -LiteralPath $gradleStdout) { Get-Content -LiteralPath $gradleStdout | Out-File -FilePath $gradleLog -Append -Encoding utf8 }
      "" | Out-File -FilePath $gradleLog -Append -Encoding utf8
      "--- STDERR ---" | Out-File -FilePath $gradleLog -Append -Encoding utf8
      if (Test-Path -LiteralPath $gradleStderr) { Get-Content -LiteralPath $gradleStderr | Out-File -FilePath $gradleLog -Append -Encoding utf8 }
    } catch { }

    if ($gradleExit -ne 0) {
      Write-Host "Gradle failed (exit $gradleExit). Last 80 lines:" 
      try { Get-Content -LiteralPath $gradleLog -Tail 80 | ForEach-Object { Write-Host $_ } } catch { }
      throw "Gradle assembleRelease failed (exit $gradleExit). See: $gradleLog"
    }
  } finally {
    Pop-Location
    $env:E2E = $previousE2E
  }
}

if (-not $SkipInstall) {
  Write-Host "Installing APK to connected device/emulator..."
  $apkDir = Join-Path $workspace 'android\app\build\outputs\apk\release'
  if (-not (Test-Path -LiteralPath $apkDir)) {
    throw "APK output folder not found: $apkDir"
  }

  $apk = Get-ChildItem -LiteralPath $apkDir -Filter '*.apk' -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (-not $apk) {
    throw "No APK found under: $apkDir"
  }

  Write-Host "- APK: $($apk.FullName)"

  # If a different build variant is installed, install -r can fail with signature mismatch.
  # Uninstall best-effort first to keep local runs reliable.
  try {
    & adb uninstall $AppId | Out-Null
  } catch {
    # ignore
  }

  & adb install -r $apk.FullName 2>&1 | Tee-Object -FilePath (Join-Path $runPath 'adb-install.log.txt')
}

$sw = [System.Diagnostics.Stopwatch]::StartNew()

# Capture device logs while Maestro runs.
$logcatProc = $null
try {
  & adb logcat -c | Out-Null
  $logcatProc = Start-Process -FilePath 'adb' -ArgumentList @('logcat', '-v', 'threadtime') -NoNewWindow -PassThru -RedirectStandardOutput $logcatPath -RedirectStandardError (Join-Path $runPath 'adb-logcat.stderr.txt')
} catch {
  Write-Host "(warning) Could not start adb logcat capture: $($_.Exception.Message)"
}

# Run with JUnit output + debug output (commands json) so we can count steps on Windows.
New-Item -ItemType Directory -Force -Path $debugPath | Out-Null

# Maestro 2.x on Windows may treat a directory argument as a single flow.
# To ensure the full suite runs, expand directories into an explicit list of flow files.
$flowArgs = @()
$flowResolved = Join-Path $workspace ($FlowPath -replace '/', '\')
if (Test-Path -LiteralPath $flowResolved -PathType Container) {
  $yaml = @(Get-ChildItem -LiteralPath $flowResolved -Filter '*.yaml' -File -ErrorAction SilentlyContinue)
  $yml = @(Get-ChildItem -LiteralPath $flowResolved -Filter '*.yml' -File -ErrorAction SilentlyContinue)
  $flowArgs = @($yaml + $yml | Sort-Object Name | Select-Object -ExpandProperty FullName)

  if ($flowArgs.Count -eq 0) {
    throw "No Maestro flow files (*.yaml/*.yml) found under: $flowResolved"
  }

  Write-Host "Discovered $($flowArgs.Count) flow file(s) under $FlowPath"
} else {
  $flowArgs = @($FlowPath)
}

try {
  $maestroArgs = @(
    'test',
    '--format', 'JUNIT',
    '--output', $junitRelative,
    '--debug-output', $debugRelative,
    '--flatten-debug-output'
  ) + $flowArgs

  Write-Host "Invoking Maestro with $($flowArgs.Count) flow(s):"
  foreach ($f in $flowArgs) {
    Write-Host "- $f"
  }

  # Capture Maestro stdout/stderr so crashes show up in logs even when VS Code truncates output.
  & $maestro @maestroArgs 2>&1 | Tee-Object -FilePath $maestroLogPath
} catch {
  Write-Host "Maestro invocation failed: $($_.Exception.Message)"
  throw
} finally {
  if ($logcatProc -and -not $logcatProc.HasExited) {
    try { Stop-Process -Id $logcatProc.Id -Force -ErrorAction SilentlyContinue } catch { }
  }
}

$exitCode = 0
if ($LASTEXITCODE -ne $null -and $LASTEXITCODE -ne 0) {
  $exitCode = $LASTEXITCODE
}

$sw.Stop()

# Mirror run artifacts to stable latest-run folder.
try {
  Copy-Item -Path (Join-Path $runPath '*') -Destination $latestRunPath -Recurse -Force
} catch {
  Write-Host "(warning) Could not mirror to latest-run: $($_.Exception.Message)"
}

# Extract likely JS/Node/React Native crashes for quick analysis.
function Write-ErrorExtract {
  param(
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutputPath
  )

  if (-not (Test-Path -LiteralPath $InputPath)) {
    "(missing) $InputPath" | Out-File -FilePath $OutputPath -Encoding utf8
    return
  }

  $patterns = @(
    'FATAL EXCEPTION',
    'AndroidRuntime',
    'ReactNativeJS',
    'Unhandled JS Exception',
    'Invariant Violation',
    'TypeError',
    'ReferenceError',
    'SyntaxError',
    'Cannot read property',
    "doesn't exist",
    'Hermes',
    'E/unknown:ReactNative',
    'JSApplicationIllegalArgumentException'
  )

  $hits = Select-String -LiteralPath $InputPath -Pattern $patterns -SimpleMatch -Context 2,4 -ErrorAction SilentlyContinue
  if (-not $hits) {
    "No matches for error patterns." | Out-File -FilePath $OutputPath -Encoding utf8
    return
  }

  $hits | ForEach-Object { $_.ToString() } | Out-File -FilePath $OutputPath -Encoding utf8
}

Write-ErrorExtract -InputPath $maestroLogPath -OutputPath (Join-Path $nodeErrorsPath 'maestro-errors.txt')
Write-ErrorExtract -InputPath $logcatPath -OutputPath (Join-Path $nodeErrorsPath 'logcat-errors.txt')
try {
  Copy-Item -Path (Join-Path $nodeErrorsPath '*') -Destination (Join-Path $latestRunPath 'node-errors') -Recurse -Force
} catch { }

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
  $commandFiles = Get-ChildItem -LiteralPath $debugPath -File -Recurse -ErrorAction SilentlyContinue |
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
