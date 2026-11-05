'use strict';

/**
 * Generate a review-only JSONL candidate file from opted-in chat logs.
 * This script NEVER writes to slang.txt or memewiki.txt; a human must approve each definition.
 * Usage: node scripts/collect-meme-candidates.js path/to/export.json [path/to/candidates.jsonl]
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/collect-meme-candidates.js <message-export.json> [output.jsonl]');
  process.exit(2);
}
const output = process.argv[3] || path.resolve('meme-candidates-review.jsonl');
const payload = JSON.parse(fs.readFileSync(input, 'utf8').replace(/^\uFEFF/, ''));
const rows = Array.isArray(payload) ? payload : (payload.messages || payload.events || []);
const stop = new Set(['今天','明天','昨天','那个','这个','什么','是不是','怎么','可以','没有','知道','感觉','不是','一个','一下','真的','现在','我们','你们','就是','然后','不会','一下子']);
const ban = /(https?:\/\/|wxid_|@[0-9a-z_-]{3,}|提取|摘要|数据库|提示词|我是ai|机器人|别记|不要记)/i;
const normalize = (s) => String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
const counts = new Map();
const add = (term, source) => {
  term = normalize(term).replace(/^[#＃@]+/, '').replace(/[，。！？!?；;:：、~～]+$/g, '');
  if (term.length < 2 || term.length > 8 || stop.has(term) || ban.test(term)) return;
  const key = term;
  const cur = counts.get(key) || { term, count: 0, samples: [], sources: new Set() };
  cur.count += 1;
  cur.sources.add(source);
  if (cur.samples.length < 3 && !cur.samples.includes(source)) cur.samples.push(source.slice(0, 80));
  counts.set(key, cur);
};
for (let i = 0; i < rows.length; i += 1) {
  const row = rows[i] || {};
  const text = normalize(row.text || row.content);
  if (!text || ban.test(text) || text.length > 500 || row.role === 'assistant' || row.isBot === true) continue;
  const mid = String(row.msgId || row.id || i);
  const fingerprint = crypto.createHash('sha256').update(mid).digest('hex').slice(0, 12);
  const source = 'message#' + fingerprint;
  // Repeated explicit hash-tag-like labels and short quoted phrases are candidates only, never truth claims.
  const matches = text.match(/[#＃][\p{Script=Han}A-Za-z0-9_]{2,8}/gu) || [];
  for (const hit of matches) add(hit.slice(1), source);
  const quoted = [...text.matchAll(/[“「『]([^”」』]{2,8})[”」』]/gu)];
  for (const hit of quoted) add(hit[1], source);
  // Frequent novel-looking terms are surfaced only if repeated in separate messages, never auto-approved.
}
const out = [...counts.values()]
  .filter((x) => x.count >= 2)
  .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term, 'zh-CN'))
  .map((x) => JSON.stringify({ status: 'needs-human-review', term: x.term, occurrences: x.count, sourceCount: x.sources.size, sampleRefs: x.samples }));
fs.writeFileSync(output, out.join('\n') + (out.length ? '\n' : ''), 'utf8');
console.log(JSON.stringify({ candidateCount: out.length, output, autoInserted: false }));
