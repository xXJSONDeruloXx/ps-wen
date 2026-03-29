$ErrorActionPreference = 'Stop'

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdministrator)) {
  Write-Error "Windows metadata capture requires an elevated PowerShell session (Administrator) because pktmon needs admin access."
}

$rootDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$outDir = Join-Path $rootDir 'artifacts\network'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$etlPath = Join-Path $outDir ("ps-cloud-metadata-{0}.etl" -f $timestamp)
$pcapngPath = Join-Path $outDir ("ps-cloud-metadata-{0}.pcapng" -f $timestamp)
$durationValue = if ($env:CAPTURE_DURATION) { $env:CAPTURE_DURATION } else { '180' }
$fileSizeValue = if ($env:CAPTURE_FILE_SIZE_MB) { $env:CAPTURE_FILE_SIZE_MB } else { '512' }
$portsValue = if ($env:CAPTURE_WINDOWS_PORTS) { $env:CAPTURE_WINDOWS_PORTS } else { '53,443' }
$durationSeconds = [int]$durationValue
$fileSizeMb = [int]$fileSizeValue
$captureAllPorts = $portsValue.Trim().ToLower() -in @('all', 'any', '*')
$portList = if ($captureAllPorts) {
  @()
} else {
  (($portsValue -split '[, ]+') | Where-Object { $_ }) | ForEach-Object { [int]$_ }
}

Write-Host '[ps-wen] Capturing local metadata with pktmon'
Write-Host ('  duration : {0} seconds' -f $durationSeconds)
Write-Host ('  ports    : {0}' -f $(if ($captureAllPorts) { 'all' } else { $portList -join ', ' }))
Write-Host ('  etl      : {0}' -f $etlPath)
Write-Host ('  pcapng   : {0}' -f $pcapngPath)
Write-Host
Write-Host 'Use this while exercising an official client on your own account/device.'
Write-Host 'This script is for metadata capture only.'
Write-Host

$started = $false

try {
  pktmon stop | Out-Null
  pktmon filter remove | Out-Null

  if (-not $captureAllPorts) {
    foreach ($port in $portList) {
      if ($port -eq 53) {
        pktmon filter add ("udp-{0}" -f $port) -t UDP -p $port | Out-Null
        continue
      }

      pktmon filter add ("tcp-{0}" -f $port) -t TCP -p $port | Out-Null
      pktmon filter add ("udp-{0}" -f $port) -t UDP -p $port | Out-Null
    }
  }

  pktmon start --capture --comp nics --pkt-size 0 --file-name $etlPath --file-size $fileSizeMb | Out-Null
  $started = $true
  Start-Sleep -Seconds $durationSeconds
}
finally {
  if ($started) {
    pktmon stop | Out-Null
    pktmon etl2pcap $etlPath --out $pcapngPath | Out-Null
    Write-Host
    Write-Host ('Saved ETL to   : {0}' -f $etlPath)
    Write-Host ('Saved PCAPNG to: {0}' -f $pcapngPath)
    Write-Host 'Next: npm run summarize:metadata -- artifacts/network/<capture>.pcapng'
  }
}
