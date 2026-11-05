$ErrorActionPreference = 'Continue'
$root = 'D:\whale-girl'
$logFile = Join-Path $root 'data\watchdog.log'
function W($s) { (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $s | Out-File -FilePath $logFile -Append -Encoding UTF8 }
# The web lifecycle controller owns this maintenance gate. Never auto-start the bridge while set.
$paused = Join-Path $root 'data\PAUSED'
if (Test-Path -LiteralPath $paused) { W 'PAUSED gate present; skip restart'; exit 0 }
$proc = Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object { $_.CommandLine -like '*wechatauto_bridge*' }
if ($proc) {
  W ('alive PID=' + (($proc | ForEach-Object { $_.ProcessId }) -join ','))
} else {
  W 'bridge NOT running -> restart'
  # Check the pause gate again immediately before the task launch to reduce race risk.
  if (Test-Path -LiteralPath $paused) { W 'PAUSED gate appeared; skip restart'; exit 0 }
  try {
    Start-ScheduledTask -TaskName 'WhaleGirl-Bridge' -ErrorAction Stop
    W 'restart issued'
  } catch { W ('restart FAIL: ' + $_.Exception.Message) }
}
