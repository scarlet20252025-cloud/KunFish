'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DeepSeekClient } = require('./llm');
const { PROVIDERS, isLocalUrl, normalizeBaseUrl, maskKey } = require('./config');

function buildSettingsProbe(runtime, body = {}) {
  const current = runtime.llm.describe();
  const provider = String(body.provider || current.provider || 'custom').trim();
  const preset = PROVIDERS[provider];
  if (!preset) throw new Error('不认识的模型服务');
  const baseUrl = normalizeBaseUrl(typeof body.baseUrl === 'string' ? body.baseUrl : current.baseUrl).slice(0, 300);
  if (!/^https?:\/\/[^\s]+$/.test(baseUrl)) throw new Error('接口地址必须为 http(s) URL');
  const parsed = new URL(baseUrl);
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('接口地址不能包含账号信息、查询参数或片段');
  const model = String(body.model || current.model || '').trim().slice(0, 80);
  if (!/^[a-zA-Z0-9._\-\/:]{1,80}$/.test(model)) throw new Error('模型名格式不正确');
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  if (apiKey && (/\s/.test(apiKey) || apiKey.length < 8 || apiKey.length > 300)) throw new Error('API Key 格式不正确');
  const needsKey = Boolean(preset.needsKey && !isLocalUrl(baseUrl));
  if (needsKey && !apiKey) throw new Error('请填写待测配置的 API Key；已保存的 Key 不会自动回显');
  const temperature = Number.isFinite(Number(body.temperature)) ? Math.max(0, Math.min(2, Number(body.temperature))) : Number(current.temperature) || 0.95;
  const sandboxSettings = path.join(runtime.config.paths.dataDir, `.settings-probe-${process.pid}-${Date.now()}.json`);
  const config = {
    ...runtime.config,
    deepseek: { ...(runtime.config.deepseek || {}), provider, baseUrl, model, apiKey, temperature },
    settings: { ...(runtime.config.settings || {}), provider, baseUrl, model, apiKey, temperature, mock: false },
    paths: { ...runtime.config.paths, settingsFile: sandboxSettings },
  };
  const client = new DeepSeekClient({ config, logger: null });
  client.provider = provider;
  client.providerLabel = preset.label;
  client.baseUrl = baseUrl;
  client.model = model;
  client.apiKey = apiKey;
  client.temperature = temperature;
  client.needsKey = needsKey;
  client.mock = false;
  client.runtime = { ...client.runtime, provider, baseUrl, model, apiKey, isLocal: isLocalUrl(baseUrl) };
  return {
    probe: () => client.probe(),
    cleanup: () => {
      client.apiKey = '';
      try { fs.unlinkSync(sandboxSettings); } catch { /* no file should normally be created */ }
    },
    descriptor: { provider, model, baseUrl, temperature, keyMasked: maskKey(apiKey) },
  };
}

module.exports = { buildSettingsProbe };
