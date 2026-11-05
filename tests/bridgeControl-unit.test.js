'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createWindowsBridgeController } = require('../src/bridgeControl');

function harness(seed = {}) {
  const calls = [];
  let state = {
    taskState: 'Ready', taskValid: true, interactive: true, watchdogState: 'Ready', paused: true,
    readyAt: '', readyPid: 0, processValid: false, ...seed,
  };
  let hb = { online: false, uia: false, listener: false, accountOk: false, lastSeenAt: 0, lastSeenSec: null, instanceId: '', heartbeatSeq: 0 };
  let enableAfterPause = false;
  const run = async (script) => {
    calls.push(String(script));
    if (String(script).includes('ConvertTo-Json')) return JSON.stringify(state);
    if (String(script).includes('Disable-ScheduledTask')) state.watchdogState = 'Disabled';
    if (String(script).includes('Enable-ScheduledTask') && enableAfterPause) state.watchdogState = 'Ready';
    if (String(script).includes("'PAUSED'")) state.paused = true;
    if (String(script).includes('Start-ScheduledTask -TaskName \'WhaleGirl-Bridge\'')) {
      state.paused = false; state.taskState = 'Running'; state.readyPid = 22002; state.processValid = true;
      state.readyAt = new Date(Date.now()).toISOString();
      state.readyAgeSec = 0; state.readyInstanceId = 'instance-new';
      hb = { online: true, uia: true, listener: true, accountOk: true, lastSeenAt: Date.now(), lastSeenSec: 1, instanceId: 'instance-new', heartbeatSeq: 1 };
    }
    if (String(script).includes("Set-Content -LiteralPath") && String(script).includes("'PAUSED'")) state.paused = true;
    if (String(script).includes('Stop-ScheduledTask -TaskName \'WhaleGirl-Bridge\'')) state.taskState = 'Ready';
    if (String(script).includes('Stop-Process -Id')) { state.processValid = false; state.readyPid = 0; state.readyAt = ''; }
    return 'ok';
  };
  const ctl = createWindowsBridgeController({ root: 'C:\\fake\\KunFish', runPowerShell: run, getSnapshot: async () => ({ ...state }), heartbeat: () => ({ ...hb }), pollIntervalMs: 1, readinessTimeoutMs: 50 });
  return { ctl, calls, get state(){return state;}, set state(v){state=v;}, get hb(){return hb;}, set hb(v){hb=v;} };
}

test('status is read-only and reports scheduled task and heartbeat', async () => {
  const h = harness();
  const r = await h.ctl.status();
  assert.equal(r.ok, true);
  assert.equal(r.snapshot.taskValid, true);
  assert.equal(h.calls.length, 0);
});

test('start refuses duplicate or unhealthy bridge PID instead of spawning a second instance', async () => {
  const h = harness({ taskState: 'Running', paused: false, readyAt: new Date().toISOString(), readyPid: 22001, processValid: true });
  const r = await h.ctl.start();
  assert.equal(r.status, 409);
  assert.equal(h.calls.some((s) => s.includes('Start-ScheduledTask')), false);
});

test('start uses the fixed interactive scheduled task and waits for fresh ready plus UIA heartbeat', async () => {
  const h = harness();
  h.state.readyAgeSec = 0;
  h.state.readyInstanceId = 'instance-new';
  const r = await h.ctl.start();
  assert.equal(r.ok, true);
  assert.equal(r.snapshot.readyPid, 22002);
  assert.ok(h.calls.some((s) => s.includes('Start-ScheduledTask -TaskName \'WhaleGirl-Bridge\'')));
  assert.ok(h.calls.some((s) => s.includes('PAUSED')));
});

test('restart failure keeps PAUSED, restores watchdog schedule and does not claim success', async () => {
  const h = harness({ taskState: 'Ready', readyPid: 1100, processValid: true, watchdogState: 'Ready', paused: true, readyInstanceId: 'old-instance', heartbeatSeq: 7 });
  h.state.readyAgeSec = 1;
  h.ctl = createWindowsBridgeController({
    root: 'C:\\fake\\KunFish',
    runPowerShell: async (script) => { h.calls.push(script); if (script.includes('ConvertTo-Json')) return JSON.stringify(h.state); if (script.includes('Disable-ScheduledTask')) h.state.watchdogState = 'Disabled'; if (script.includes('Enable-ScheduledTask')) { h.state.watchdogState = 'Ready'; enableAfterPause = true; } if (script.includes('Stop-ScheduledTask -TaskName \'WhaleGirl-Bridge\'')) h.state.taskState = 'Ready'; if (script.includes('Stop-Process -Id')) {h.state.processValid=false;h.state.readyPid=0;} if (script.includes('Start-ScheduledTask -TaskName \'WhaleGirl-Bridge\'')) {h.state.taskState='Running';h.state.processValid=true;h.state.readyPid=22002;h.state.readyAt=new Date().toISOString();} return 'ok'; },
    getSnapshot: async () => ({ ...h.state }), heartbeat: () => ({online:false,uia:false,accountOk:false}), pollIntervalMs:1, readinessTimeoutMs:3,
  });
  const r = await h.ctl.restart();
  assert.equal(r.ok, false);
  assert.equal(r.status, 504);
  assert.match(r.error, /PAUSED/);
  assert.equal(h.calls.some((s) => s.includes('Enable-ScheduledTask')), true, 'watchdog schedule is restored; PAUSED gate prevents bridge relaunch');
});
