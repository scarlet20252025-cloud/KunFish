'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src', 'bridgeControl.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'web', 'advanced.html'), 'utf8');

test('bridge control uses dedicated API, strict authorization, explicit confirmation and fresh health', () => {
  assert.match(server, /pathname === '\/api\/bridge\/control' && method === 'POST'/);
  assert.match(server, /bridgeControlAuthorized\(req, runtime\)/);
  assert.match(server, /bridgeControlAuthorized/);
  assert.match(server, /timingSafeEqual/);
  assert.match(controller, /Get-ScheduledTask -TaskName 'WhaleGirl-Bridge'/);
  assert.match(controller, /watchdog/i);
  assert.match(controller, /PAUSED/);
  assert.match(controller, /Start-ScheduledTask -TaskName 'WhaleGirl-Bridge'/);
  assert.match(controller, /lastSeenAt/);
  assert.match(controller, /uia === true/);
  assert.match(page, /bridgeStartBtn/);
  assert.match(page, /confirm\('启动微信桥接/);
  assert.match(page, /confirm\('重启微信桥接/);
  assert.match(page, /bridgeRefreshBtn/);
});
