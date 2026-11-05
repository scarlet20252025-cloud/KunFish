'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadConfig, loadSettings, resolveRuntime, storeModelProfile, activateModelProfile, deleteModelProfile } = require('../src/config');

function fixture(initial = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-profiles-'));
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ server: { port: 0, openBrowser: false }, deepseek: { apiKey: 'legacy-deepseek-secret', model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com' } }));
  if (Object.keys(initial).length) fs.writeFileSync(path.join(root, 'data', 'settings.json'), JSON.stringify(initial));
  const config = loadConfig({ root, env: {} });
  return { root, config, close: () => fs.rmSync(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 20 }) };
}

test('legacy Flat settings keep working until a named profile is explicitly activated', () => {
  const f = fixture();
  try {
    const runtime = resolveRuntime(f.config);
    assert.equal(runtime.model, 'deepseek-flash');
    assert.equal(runtime.baseUrl, 'https://api.deepseek.com');
    assert.equal(runtime.apiKey, 'legacy-deepseek-secret');
  } finally { f.close(); }
});

test('profile save is isolated, activation wins, and deletion cannot remove active profile', () => {
  const f = fixture();
  try {
    storeModelProfile(f.config, { id: 'local-test', name: '本机假接口', provider: 'custom', baseUrl: 'http://127.0.0.1:43210/v1', model: 'fake-model', temperature: 0.7, apiKey: 'fake-profile-secret' });
    assert.equal(resolveRuntime(f.config).model, 'deepseek-flash', '保存配置不得自动切换生产运行参数');
    activateModelProfile(f.config, 'local-test');
    const active = resolveRuntime(f.config);
    assert.equal(active.model, 'fake-model');
    assert.equal(active.baseUrl, 'http://127.0.0.1:43210/v1');
    assert.equal(active.apiKey, 'fake-profile-secret');
    assert.throws(() => deleteModelProfile(f.config, 'local-test'), /不能删除当前配置/);
  } finally { f.close(); }
});

test('profile save retains an existing profile key when password input is blank', () => {
  const f = fixture({ modelProfiles: [{ id: 'p1', name: 'P1', provider: 'custom', baseUrl: 'http://127.0.0.1:43210/v1', model: 'm1', temperature: 0.8 }], profileKeys: { p1: 'profile-secret-123' }, activeProfileId: '' });
  try {
    storeModelProfile(f.config, { id: 'p1', name: 'P1 edit', provider: 'custom', baseUrl: 'http://127.0.0.1:43210/v1', model: 'm2', temperature: 0.5 });
    assert.equal(loadSettings(f.config).profileKeys.p1, 'profile-secret-123');
    assert.throws(() => storeModelProfile(f.config, { id: 'bad', name: 'bad', provider: 'custom', baseUrl: 'http://user:pass@127.0.0.1:43210/v1', model: 'm' }), /地址不能包含/);
  } finally { f.close(); }
});
