'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');

function encodePowerShell(script) {
  return Buffer.from(String(script), 'utf16le').toString('base64');
}

function createWindowsBridgeController({
  root,
  heartbeat = () => null,
  runPowerShell,
  getSnapshot,
  pollIntervalMs = 1000,
  readinessTimeoutMs = 35000,
} = {}) {
  if (!root) throw new TypeError('bridge controller requires project root');
  let busy = false;
  let watchdogWasDisabledBeforeControl = false;

  const run = runPowerShell || ((script, timeoutMs = 12000) => new Promise((resolve, reject) => {
    const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
    const executable = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePowerShell(script)], {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, KUNFISH_ROOT: root },
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error('桥接控制脚本超时'));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { if (stdout.length < 12000) stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { if (stderr.length < 4000) stderr += chunk.toString('utf8'); });
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error((stderr || stdout || `PowerShell exit ${code}`).trim().slice(0, 1600)));
    });
  }));

  async function snapshot() {
    if (getSnapshot) return getSnapshot();
    const script = String.raw`$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath($env:KUNFISH_ROOT)
$loop=([IO.Path]::GetFullPath((Join-Path $root 'scripts\bridge_loop.bat'))).ToLowerInvariant()
$bridgeStart=([IO.Path]::GetFullPath((Join-Path $root 'bridge-start.bat'))).ToLowerInvariant()
$py=([IO.Path]::GetFullPath((Join-Path $root 'examples\wechatauto_bridge.py'))).ToLowerInvariant()
$task=Get-ScheduledTask -TaskName 'WhaleGirl-Bridge' -ErrorAction Stop
$taskValid=$false
$interactive=$false
foreach($a in $task.Actions){$args=[regex]::Replace([string]$a.Arguments,'/',[string][char]92).ToLowerInvariant();if(([string]$a.Execute).ToLowerInvariant().Contains('cmd.exe') -and ($args.Contains($loop) -or $args.Contains($bridgeStart))){$taskValid=$true}}
try{$interactive=([string]$task.Principal.LogonType -match 'InteractiveToken|Interactive')}catch{}
$ready=$null
$readyAgeSec=$null
try{$readyPath=Join-Path $root 'data\bridge-ready.json';$ready=Get-Content -LiteralPath $readyPath -Raw -Encoding UTF8|ConvertFrom-Json;$readyAgeSec=[Math]::Abs(((Get-Date)-(Get-Item -LiteralPath $readyPath).LastWriteTime).TotalSeconds)}catch{}
$readyPid=0
try{$readyPid=[int]$ready.pid}catch{}
$proc=$null
$processValid=$false
$pyRel='examples\wechatauto_bridge.py'
$rootPrefix=($root.TrimEnd([char]92)+[char]92).ToLowerInvariant()
if($readyPid -gt 0){try{$proc=Get-CimInstance Win32_Process -Filter ('ProcessId='+$readyPid) -ErrorAction Stop;if($proc){$command=([string]$proc.CommandLine).Replace('/','\').ToLowerInvariant();$exe=([string]$proc.ExecutablePath).ToLowerInvariant();$scriptOk=$command.Contains($py) -or $command.Contains($pyRel);$exeOk=$exe.StartsWith($rootPrefix);$processValid=($proc.Name -eq 'python.exe' -and $scriptOk -and $exeOk)}}catch{}}
$watch=Get-ScheduledTask -TaskName 'WhaleGirl-BridgeWatch' -ErrorAction SilentlyContinue
[pscustomobject]@{taskState=[string]$task.State;taskValid=$taskValid;interactive=$interactive;watchdogState=[string]$(if($watch){$watch.State}else{'Missing'});paused=(Test-Path (Join-Path $root 'data\PAUSED'));readyAt=[string]$ready.readyAt;readyAgeSec=$readyAgeSec;readyInstanceId=[string]$ready.instanceId;readyPid=$readyPid;processValid=$processValid}|ConvertTo-Json -Compress`;
    return JSON.parse(await run(script, 10000));
  }

  const quotedRoot = `'${String(root).replace(/'/g, "''")}'`;
  async function setPaused() {
    await run(`$root=${quotedRoot};$data=Join-Path $root 'data';New-Item -ItemType Directory -Path $data -Force|Out-Null;Set-Content -LiteralPath (Join-Path $data 'PAUSED') -Value 'web-control' -Encoding UTF8`, 10000);
  }
  async function clearPaused() {
    await run(`$root=${quotedRoot};$pause=Join-Path (Join-Path $root 'data') 'PAUSED';if(Test-Path $pause){Remove-Item -LiteralPath $pause -Force}`, 10000);
  }
  async function restoreWatchdog() {
    if (!watchdogWasDisabledBeforeControl) await run("Enable-ScheduledTask -TaskName 'WhaleGirl-BridgeWatch' -ErrorAction Stop", 10000);
  }

  async function stopWatchdogAndBridge(before) {
    if (before.watchdogState === 'Missing') throw new Error('看门狗计划任务缺失；拒绝可能导致桥接被自动重拉的操作');
    if (!['Running', 'Ready', 'Disabled'].includes(before.watchdogState)) throw new Error('看门狗状态未知，拒绝通过网页修改桥接生命周期');
    watchdogWasDisabledBeforeControl = before.watchdogState === 'Disabled';
    // Write the guard before disabling any task. Update bridge_loop and watchdog script to honor PAUSED too.
    await setPaused();
    await run("$watch=Get-ScheduledTask -TaskName 'WhaleGirl-BridgeWatch' -ErrorAction SilentlyContinue;if($watch -and $watch.State -eq 'Running'){Stop-ScheduledTask -TaskName 'WhaleGirl-BridgeWatch' -ErrorAction Stop};if($watch -and $watch.State -ne 'Disabled'){Disable-ScheduledTask -TaskName 'WhaleGirl-BridgeWatch' -ErrorAction Stop};$watch=Get-ScheduledTask -TaskName 'WhaleGirl-BridgeWatch' -ErrorAction SilentlyContinue;if($watch -and $watch.State -ne 'Disabled'){throw 'watchdog not disabled'};Stop-ScheduledTask -TaskName 'WhaleGirl-Bridge' -ErrorAction SilentlyContinue;Start-Sleep -Milliseconds 500", 12000);
    if (before.processValid && Number.isInteger(before.readyPid) && before.readyPid > 0) {
      const expected = path.join(root, 'examples', 'wechatauto_bridge.py').toLowerCase().replace(/'/g, "''");
      const stopPid = `$id=${before.readyPid};$expected='${expected}';$proc=Get-CimInstance Win32_Process -Filter ('ProcessId='+$id) -ErrorAction Stop;if($proc){$cmd=([string]$proc.CommandLine).Replace('/','\\').ToLowerInvariant();if($proc.Name -ne 'python.exe' -or !$cmd.Contains($expected)){throw 'PID ownership changed; refusing to terminate'};Stop-Process -Id $id -Force -ErrorAction Stop};Start-Sleep -Milliseconds 400;$left=Get-CimInstance Win32_Process -Filter ('ProcessId='+$id) -ErrorAction Stop;if($left -and $left.Name -eq 'python.exe' -and ([string]$left.CommandLine).ToLowerInvariant().Contains($expected)){throw 'target bridge PID remains alive'}`;
      await run(stopPid, 10000);
    }
    const after = await snapshot();
    if (after.processValid || after.taskState === 'Running' || (!watchdogWasDisabledBeforeControl && after.watchdogState !== 'Disabled')) throw new Error('旧桥接任务或看门狗仍处于可拉起状态；PAUSED 已保留，不会启动新实例');
    return after;
  }

  async function startTask(before, startedAt, action) {
    if (!before.taskValid || !before.interactive) throw new Error('计划任务未确认使用当前目录的 bridge_loop 或交互式会话，拒绝启动以保护 UIA');
    if (before.taskState === 'Running' && !before.paused && !before.processValid) throw new Error('任务运行但桥接 PID 未确认，拒绝重复启动');
    await clearPaused();
    const startScript = `$root=${quotedRoot};$data=Join-Path $root 'data';$ready=Join-Path $data 'bridge-ready.json';if(Test-Path $ready){Remove-Item -LiteralPath $ready -Force};Start-ScheduledTask -TaskName 'WhaleGirl-Bridge' -ErrorAction Stop`;
    await run(startScript, 12000);
    const deadline = Date.now() + readinessTimeoutMs;
    let latest;
    let stablePid = 0;
    let stableCount = 0;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      latest = await snapshot();
      const hb = heartbeat() || {};
      const readyFresh = latest.taskValid && latest.interactive && latest.processValid && latest.readyPid > 0 && Number(latest.readyAgeSec) <= 15 && Boolean(latest.readyInstanceId) && Date.parse(latest.readyAt) >= startedAt - 1000 && (action !== 'restart' || latest.readyPid !== before.readyPid);
      const heartbeatFresh = hb.online === true && hb.uia === true && hb.listener === true && hb.accountOk === true && hb.instanceId === latest.readyInstanceId && Number(hb.heartbeatSeq) > Number(before.heartbeatSeq || 0) && Number.isFinite(Number(hb.lastSeenAt)) && Number(hb.lastSeenAt) >= startedAt && Number(hb.lastSeenSec) <= 30;
      if (readyFresh && heartbeatFresh) {
        stableCount = stablePid === latest.readyPid ? stableCount + 1 : 1;
        stablePid = latest.readyPid;
        if (stableCount >= 2) {
          await restoreWatchdog();
          return { snapshot: latest, heartbeat: hb };
        }
      } else {
        stableCount = 0;
        stablePid = 0;
      }
    }
    await setPaused().catch(() => {});
    await restoreWatchdog().catch(() => {});
    throw new Error('桥接在等待期限内未通过新 ready、fresh heartbeat、UIA 和账号核验；已保留 PAUSED');
  }

  return {
    async status() {
      const current = await snapshot();
      return { ok: true, status: 200, snapshot: current, heartbeat: heartbeat() || {} };
    },
    async start() {
      if (busy) return { ok: false, status: 409, error: '已有桥接控制任务运行' };
      busy = true;
      try {
        const before = await snapshot();
        if (!before.taskValid || !before.interactive) return { ok: false, status: 409, error: '桥接任务目标或交互式会话不匹配', snapshot: before };
        if (before.processValid && !before.paused) {
          const hb = heartbeat() || {};
          if (hb.online && hb.uia === true && hb.accountOk === true && Number(hb.lastSeenSec) <= 30) return { ok: true, status: 200, alreadyRunning: true, snapshot: before, heartbeat: hb };
          return { ok: false, status: 409, error: 'PID 存在但健康不明确，拒绝重复启动；请用桌面启动器排查', snapshot: before, heartbeat: hb };
        }
        const result = await startTask(before, Date.now(), 'start');
        return { ok: true, status: 200, ...result };
      } catch (error) { try { await setPaused(); await restoreWatchdog(); } catch {} return { ok: false, status: 504, error: error.message, paused: true }; }
      finally { busy = false; }
    },
    async stop() {
      if (busy) return { ok: false, status: 409, error: '已有桥接控制任务运行' };
      busy = true;
      try {
        const before = await snapshot();
        if (!before.taskValid) return { ok: false, status: 409, error: '桥接任务目标与当前安装目录不匹配', snapshot: before };
        const after = await stopWatchdogAndBridge(before);
        await clearPaused();
        await restoreWatchdog();
        // The stopped scheduled task stays stopped; watchdog returns to its original enabled/running state.
        return { ok: true, status: 200, action: 'stop', paused: false, snapshot: after };
      } catch (error) { try { await setPaused(); } catch {} return { ok: false, status: 409, error: error.message, paused: true }; }
      finally { busy = false; }
    },
    async restart() {
      if (busy) return { ok: false, status: 409, error: '已有桥接控制任务运行' };
      busy = true;
      try {
        const before = await snapshot();
        if (!before.taskValid || !before.interactive) return { ok: false, status: 409, error: '拒绝重启：桥接任务未确认绑定当前目录的交互式 UIA 会话', snapshot: before };
        if (before.processValid && !before.paused) return { ok: false, status: 409, error: '当前桥接进程仍运行；为保护交互式 UIA 会话，不在后台强杀重启。请先通过桌面启动器停止/恢复后再试。', snapshot: before };
        const stopped = await stopWatchdogAndBridge(before);
        const result = await startTask(stopped, Date.now(), 'restart');
        if (!watchdogWasDisabledBeforeControl) {
          await run("Enable-ScheduledTask -TaskName 'WhaleGirl-BridgeWatch' -ErrorAction Stop", 10000);
        }
        return { ok: true, status: 200, action: 'restart', ...result };
      } catch (error) { try { await setPaused(); } catch {} return { ok: false, status: 504, error: error.message, paused: true }; }
      finally { busy = false; }
    },
  };
}

module.exports = { createWindowsBridgeController, encodePowerShell };
