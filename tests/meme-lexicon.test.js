'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const persona = require('../src/persona');
const { DEFAULT_CONFIG } = require('../src/config');

function withLexicon(text, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-meme-lex-'));
  try {
    fs.writeFileSync(path.join(dir, 'slang.txt'), '', 'utf8');
    fs.writeFileSync(path.join(dir, 'memewiki.txt'), text, 'utf8');
    const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    config.paths = { dataDir: dir };
    config.persona = { ...config.persona, customPrompt: '你是鲲鲲，一个会接梗的群友。' };
    fn(config);
  } finally { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 }); }
}

test('67保留短词但只限精确数字Token，不在67个等普通文本里误命中', () => withLexicon('', (config) => {
  const exact = persona.memeContext(config, '这波67');
  assert.match(exact, /梗百科词条：67/);
  const embedded = persona.memeContext(config, '67个苹果');
  assert.doesNotMatch(embedded, /梗百科词条：67/);
}));

test('0721需千恋万花圈内锚点；纯日期不注入作品知识', () => withLexicon('', (config) => {
  const bare = persona.memeContext(config, '0721到了');
  assert.doesNotMatch(bare, /梗百科词条：千恋万花07\/21/);
  const anchored = persona.memeContext(config, '0721到了', '刚刚聊千恋万花和朝武芳乃');
  assert.match(anchored, /梗百科词条：千恋万花07\/21/);
}));

test('千恋万花条目不自动扩写成人物/剧情事实', () => withLexicon('', (config) => {
  const context = persona.memeContext(config, '千恋万花');
  assert.match(context, /梗百科词条：千恋万花/);
  assert.doesNotMatch(context, /自动补全角色剧情/);
}));
