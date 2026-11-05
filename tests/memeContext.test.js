'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMemeThread } = require('../src/memeContext');

test('STEINS;GATE 机器→香蕉→苹果转→老库拉了跨说话人链条完整保留事件来源', () => {
  const t0 = 1_793_853_000_000;
  const history = [
    { role: 'user', name: 'Error', uid: 'u1', text: '命运石之门那台未来道具八号（暂定）里面变成凝胶香蕉', ts: t0 },
    { role: 'assistant', name: '鲲鲲', uid: 'bot', text: '未来道具八号那微波炉，装我进去转一圈也变香蕉', ts: t0 + 3_000 },
    { role: 'assistant', name: '鲲鲲', uid: 'bot', text: '先试试拿个苹果转', ts: t0 + 7_000 },
    { role: 'assistant', name: '鲲鲲', uid: 'bot', text: '老库拉了（sticker）', ts: t0 + 10_000 }
  ];
  const current = { role: 'user', name: '人类统合思念体', senderId: 'owner', text: '给你穿越时空还不好吗', cleanText: '给你穿越时空还不好吗', atMe: true };
  const thread = buildMemeThread(history, current, t0 + 12_000);
  assert.equal(thread.family, 'steins-gate-phonewave');
  assert.equal(thread.directContinuation, true);
  assert.match(thread.block, /Error: 命运石之门/);
  assert.match(thread.block, /鲲鲲: 先试试拿个苹果转/);
  assert.match(thread.block, /鲲鲲: 老库拉了/);
  assert.match(thread.block, /机器人此前内容（候选，不作事实）/);
  assert.match(thread.userEvidenceText, /Error: 命运石之门/);
});

test('没有强锚时普通的机器/香蕉不会被强行串成STEINS;GATE', () => {
  const t0 = 1_793_853_000_000;
  const history = [
    { role: 'user', name: '阿甲', uid: 'u1', text: '机器有点旧', ts: t0 },
    { role: 'user', name: '阿乙', uid: 'u2', text: '香蕉挺甜', ts: t0 + 2_000 },
  ];
  const current = { role: 'user', name: '阿丙', senderId: 'u3', text: '给你穿越时空还不好吗', cleanText: '给你穿越时空还不好吗', atMe: true };
  const thread = buildMemeThread(history, current, t0 + 3_000);
  assert.equal(thread.family, null);
  assert.equal(thread.block, '');
});

test('明确接话短句沿用最近强锚，但超过窗口后会断开', () => {
  const t0 = 1_793_853_000_000;
  const current = { role: 'user', name: 'Owner', senderId: 'owner', text: '先试试拿个苹果转', cleanText: '先试试拿个苹果转', atMe: true };
  const recent = [{ role: 'user', name: 'Error', uid: 'u1', text: '电话微波炉是未来道具八号', ts: t0 }, { role: 'user', name: '鲲鲲', uid: 'bot', text: '那放香蕉进去看看', ts: t0 + 2_000 }];
  assert.equal(buildMemeThread(recent, current, t0 + 4_000).family, 'steins-gate-phonewave');
  assert.equal(buildMemeThread(recent, current, t0 + 80_000).family, null);
});

test('弱词不能建立话题；明确的千恋万花锚可承接0721', () => {
  const t0 = 1_793_853_000_000;
  const weak = buildMemeThread([{ role: 'user', name: '阿甲', text: '我家机器坏了', ts: t0 }], { text: '香蕉呢', atMe: true }, t0 + 2_000);
  assert.equal(weak.family, null);
  const yuzu = buildMemeThread([{ role: 'user', name: '阿甲', text: '今天聊千恋万花和芳乃', ts: t0 }], { text: '0721到了', atMe: true }, t0 + 2_000);
  assert.equal(yuzu.family, 'yuzu-senren');
});
