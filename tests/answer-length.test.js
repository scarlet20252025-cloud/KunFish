'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const persona = require('../src/persona');
const { DeepSeekClient } = require('../src/llm');
const { Bot } = require('../src/bot');
const { Store } = require('../src/memory');
const { DEFAULT_CONFIG } = require('../src/config');

function baseConfig() {
  const c = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  c.persona = { ...(c.persona || {}), customPrompt: '' };
  return c;
}

function systemFor(text) {
  return persona.buildSystem({
    config: baseConfig(),
    msg: { chatType: 'private', text, cleanText: text, senderName: '阿泽' },
    profile: {}, notes: [], now: new Date('2026-11-06T15:00:00+08:00'),
  });
}

test('认真攻略/数据分析注入按任务决定长度规则，闲聊不注入', () => {
  const detailed = systemFor('详细讲讲这个副本的攻略和数据分析');
  assert.match(detailed, /【回答长度按任务决定】/);
  assert.match(detailed, /按需要写完整/);
  const casual = systemFor('今天天气不错');
  assert.doesNotMatch(casual, /【回答长度按任务决定】/);
  assert.match(casual, /闲聊时自然短/);
  assert.doesNotMatch(casual, /大多数回复就一句，10~30/);
});

test('长答请求给足生成预算，闲聊保持配置预算', () => {
  const config = {
    deepseek: { apiKey: 'sk-test-1234567890', baseUrl: 'http://127.0.0.1:1/v1', model: 'm', temperature: 0.9, maxTokens: 700, timeoutMs: 5000 },
    paths: { settingsFile: path.join(os.tmpdir(), 'whale-length-none-' + Math.random() + '.json') },
    env: {}, persona: { name: '鲲鲲' },
  };
  const llm = new DeepSeekClient({ config, logger: null });
  const turns = [{ role: 'user', content: '详细攻略' }];
  assert.ok(llm.buildPayload({ system: systemFor('给我一份详细攻略'), turns }).max_tokens >= 4096);
  assert.equal(llm.buildPayload({ system: systemFor('在吗'), turns }).max_tokens, 700);
  assert.equal(llm.buildPayload({ system: systemFor('在吗'), turns, maxTokens: 32 }).max_tokens, 32);
});

test('finalize 对认真长答保留原文，不拆气泡不截断', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-length-'));
  try {
    const config = baseConfig();
    config.chat.privateMaxChars = 40;
    config.chat.maxBubbles = 2;
    const store = new Store({ file: path.join(dir, 'store.json'), limits: config.memory });
    const bot = new Bot({ config, store, llm: { isMock: false, model: 'm', reload() {} }, logger: null, mockChunkDelayMs: 0 });
    const longText = [
      '先说结论：这套配装适合开荒。',
      '1. 抗性堆到 45 以上，不然第二阶段容易被秒。',
      '2. 武器优先选带充能的，循环更顺。',
      '3. 队伍里最好带一个奶，容错高很多。',
      '具体数据：攻击 2100，暴击 55%，充能 180%。',
      '如果打不过，先检查抗性够不够，再换武器，最后调整出手顺序。',
      '补充一点：这套对操作要求不高，但第三阶段需要留爆发，别一开场全交。',
    ].join('\n');
    const decision = {
      key: 'web:u:length:private', action: 'reply',
      msg: { chatType: 'private', text: '给我一份详细攻略', cleanText: '给我一份详细攻略' },
      system: systemFor('给我一份详细攻略'),
    };
    const bubbles = bot.finalize(decision, longText);
    assert.equal(bubbles.length, 1);
    assert.equal(bubbles[0], longText);
    assert.equal(decision.finalText, longText);
    assert.ok(store.messages(decision.key, 5).some((m) => m.role === 'assistant' && m.text === longText));
    store.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 6, retryDelay: 60 });
  }
});

test('finish_reason=length 保留已生成内容，不截短也不重复请求', async () => {
  const text = '先说结论：这套配装适合开荒。第一，抗性堆到 45 以上，不然第二阶段容易被秒。第二，武器优先带充能，循环更顺。第三，队伍带奶容错高。具体数据：攻击 2100，暴击 55%，充能 180%。如果仍打不过，先检查抗性，再换武器，最后调整出手顺序，第三阶段留爆发。';
  const config = {
    deepseek: { apiKey: 'sk-test-1234567890', baseUrl: 'http://127.0.0.1:1/v1', model: 'm', temperature: 0.9, maxTokens: 700, timeoutMs: 5000 },
    paths: { settingsFile: path.join(os.tmpdir(), 'whale-length-none-' + Math.random() + '.json') },
    env: {}, persona: { name: '鲲鲲' },
  };
  const llm = new DeepSeekClient({ config, logger: null });
  let calls = 0;
  llm._open = async () => { calls += 1; return { req: { destroy() {} }, res: { statusCode: 200, setEncoding() {}, destroy() {} } }; };
  llm._readAll = async () => JSON.stringify({ choices: [{ message: { content: text }, finish_reason: 'length' }] });
  const out = await llm.complete({ system: systemFor('详细讲讲攻略'), turns: [{ role: 'user', content: '详细讲讲攻略' }] });
  assert.equal(out, text);
  assert.equal(calls, 1);
});
