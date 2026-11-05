'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { startServer } = require('../server');
const { Bot } = require('../src/bot');
const { Store } = require('../src/memory');
const { DEFAULT_CONFIG, resolveRuntime } = require('../src/config');

async function boot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-probe-'));
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({
    server: { host: '127.0.0.1', port: 0, openBrowser: false },
    deepseek: { provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', apiKey: 'production-fake-secret' },
    group: { requireAt: true },
  }));
  const app = await startServer({ root, env: { WHALE_LOG_FILE: '' }, port: 0, openBrowser: false, watchConfig: false });
  return {
    ...app,
    cleanup: async () => {
      await app.close();
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 4, retryDelay: 20 });
    },
  };
}

async function fakeServer() {
  let calls = 0;
  const server = http.createServer((req, res) => {
    calls += 1;
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: '咕噜' } }] }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/v1`,
    get calls() { return calls; },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test('设置试运行 mode不会改持久化、记忆或生产LLM并可恢复', async () => {
  const app = await boot();
  try {
    const settingsPath = app.runtime.config.paths.settingsFile;
    const settingsBefore = fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, 'utf8') : '';
    const original = { provider: app.runtime.llm.provider, model: app.runtime.llm.model, baseUrl: app.runtime.llm.baseUrl, apiKey: app.runtime.llm.apiKey, temperature: app.runtime.llm.temperature, mock: app.runtime.llm.mock, configProvider: app.runtime.config.provider, deepseekProvider: app.runtime.config.deepseek.provider, deepseekModel: app.runtime.config.deepseek.model, deepseekBaseUrl: app.runtime.config.deepseek.baseUrl };
    const enable = await fetch(app.url + '/api/debug/settings-probe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true, chatType: 'private' }) }).then((r) => r.json());
    assert.equal(enable.enabled, true);
    const beforeMessages = app.runtime.store.summary().totalMessages;
    const simulated = await fetch(app.url + '/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'custom', baseUrl: 'http://127.0.0.1:1/v1', model: 'temporary-model', mock: false, apiKey: 'temporary-test-key-123', userName: '临时名' }) }).then((r) => r.json());
    assert.equal(simulated.settings.model, 'temporary-model');
    assert.equal(app.runtime.llm.model, 'temporary-model');
    assert.equal(app.runtime.llm.apiKey, 'temporary-test-key-123');
    assert.equal(app.runtime.config.persona.ownerName, '临时名');
    assert.equal(app.runtime.store.summary().totalMessages, beforeMessages);
    assert.equal(fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, 'utf8') : '', settingsBefore);
    const personaFile = path.join(app.runtime.config.paths.dataDir, 'persona.json');
    assert.equal(fs.existsSync(personaFile), false, '试运行不写persona.json');
    const disable = await fetch(app.url + '/api/debug/settings-probe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: false }) }).then((r) => r.json());
    assert.equal(disable.enabled, false);
    assert.equal(app.runtime.llm.provider, original.provider);
    assert.equal(app.runtime.llm.model, original.model);
    assert.equal(app.runtime.llm.baseUrl, original.baseUrl);
    assert.equal(app.runtime.llm.apiKey, original.apiKey);
    assert.equal(app.runtime.config.persona.ownerName, '主人');
    assert.equal(app.runtime.config.provider, original.configProvider);
    assert.equal(app.runtime.config.deepseek.provider, original.deepseekProvider);
    assert.equal(app.runtime.config.deepseek.model, original.deepseekModel);
    assert.equal(app.runtime.config.deepseek.baseUrl, original.deepseekBaseUrl);
  } finally { await app.close(); }
});

test('连接探针可连本机假接口，但不会写盘或改变运行时LLM', async () => {
  const app = await boot();
  const fake = await fakeServer();
  try {
    const settingsPath = app.runtime.config.paths.settingsFile;
    const settingsBefore = fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, 'utf8') : '';
    const runtimeBefore = {
      provider: app.runtime.llm.provider,
      model: app.runtime.llm.model,
      baseUrl: app.runtime.llm.baseUrl,
      apiKey: app.runtime.llm.apiKey,
    };
    const response = await fetch(app.url + '/api/settings/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'custom', baseUrl: fake.url, model: 'fake-model', apiKey: 'temporary-fake-key' }),
    });
    const data = await response.json();
    assert.equal(data.ok, true);
    assert.equal(data.sideEffects, false);
    assert.equal(fake.calls, 1);
    assert.equal(app.runtime.llm.provider, runtimeBefore.provider);
    assert.equal(app.runtime.llm.model, runtimeBefore.model);
    assert.equal(app.runtime.llm.baseUrl, runtimeBefore.baseUrl);
    assert.equal(app.runtime.llm.apiKey, runtimeBefore.apiKey);
    assert.equal(fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, 'utf8') : '', settingsBefore);
    assert.doesNotMatch(JSON.stringify(data), /temporary-fake-key|production-fake-secret/);
  } finally {
    await fake.close();
    await app.cleanup();
  }
});
