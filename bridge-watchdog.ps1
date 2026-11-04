$ErrorActionPreference = 'Continue'
$logFile = 'D:\whale-girl\data\watchdog.log'
function W($s) { (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $s | Out-File -FilePath $logFile -Append -Encoding UTF8 }
$proc = Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object { $_.CommandLine -like '*wechatauto_bridge*' }
if ($proc) {
  W ('alive PID=' + (($proc | ForEach-Object { $_.ProcessId }) -join ','))
} else {
  W 'bridge NOT running -> restart'
  try {
    Start-ScheduledTask -TaskName 'WhaleGirl-Bridge' -ErrorAction Stop
    W 'restart issued'
  } catch { W ('restart FAIL: ' + $_.Exception.Message) }
}
