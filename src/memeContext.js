'use strict';

const MAX_EVENTS = 12;
const MAX_EVENT_CHARS = 180;
const MAX_THREAD_EVENTS = 8;
const MAX_THREAD_GAP_MS = 3 * 60 * 1000;
const MAX_WEAK_FOLLOWUP_MS = 45 * 1000;
const MAX_CHAIN_SPAN_MS = 90 * 1000;

const TOPIC_FAMILIES = [
  {
    id: 'steins-gate-phonewave',
    terms: ['命运石之门', 'Steins;Gate', 'Steins Gate', '电话微波炉', '电话レンジ', '未来道具八号', '未来道具8号', '凝胶香蕉', '香蕉凝胶', '嘟嘟噜', '时光机'],
    weakTerms: ['香蕉', '苹果转', '机器', '微波炉', '老库拉了', '穿越时空'],
  },
  {
    id: 'yuzu-senren',
    terms: ['千恋万花', '柚子社', '朝武芳乃', '芳乃', 'Ciallo'],
    weakTerms: ['0721', '07/21', '07-21'],
  },
];

function familyMatches(text, family, includeWeak = true) {
  const value = String(text || '').toLowerCase();
  if (family.terms.some((term) => value.includes(term.toLowerCase()))) return 'strong';
  if (includeWeak && family.weakTerms.some((term) => value.includes(term.toLowerCase()))) return 'weak';
  return '';
}

function normalizeEvent(message) {
  const name = String((message && message.name) || (message && message.role === 'assistant' ? '鲲鲲' : '群友')).slice(0, 40);
  const role = message && (message.role === 'assistant' || /^(鲲鲲|大肥鱼)$/.test(name)) ? 'assistant' : 'user';
  return {
    role,
    name,
    text: String((message && message.text) || '').replace(/\s+/g, ' ').slice(0, MAX_EVENT_CHARS),
    ts: Number((message && message.ts) || 0),
    uid: String((message && (message.uid || message.senderId)) || '').slice(0, 80),
    replyToName: String((message && message.replyToName) || '').slice(0, 40),
    replyToUserId: String((message && message.replyToUserId) || '').slice(0, 80),
    mentionedNames: Array.isArray(message && message.mentionedNames) ? message.mentionedNames.map((x) => String(x || '').slice(0, 40)).filter(Boolean) : [],
    msgId: String((message && message.msgId) || '').slice(0, 80),
  };
}

function isShortContinuation(text) {
  const value = String(text || '').trim();
  return value.length > 0 && value.length <= 32 && !/[。！？!?]/.test(value);
}

function getGap(left, right) {
  return left.ts && right.ts ? Math.max(0, right.ts - left.ts) : 0;
}

function latestHumanAnchor(events, family, beforeIndex = events.length) {
  for (let index = Math.min(beforeIndex - 1, events.length - 1); index >= 0; index -= 1) {
    const event = events[index];
    if (event.role === 'user' && familyMatches(event.text, family, false) === 'strong') return index;
  }
  return -1;
}

function makeChain(events, anchorIndex) {
  const chain = [];
  for (let index = anchorIndex; index < events.length; index += 1) {
    const event = events[index];
    if (chain.length && getGap(chain[chain.length - 1], event) > MAX_THREAD_GAP_MS) break;
    if (chain.length && chain[0].ts && event.ts && event.ts - chain[0].ts > MAX_CHAIN_SPAN_MS) break;
    chain.push(event);
    if (chain.length >= MAX_THREAD_EVENTS) break;
  }
  return chain;
}

/** Build a bounded, speaker-aware event chain. Human anchors establish topic; bot history is only candidate context. */
function buildMemeThread(history, currentMessage, nowMs = Date.now()) {
  const current = normalizeEvent(currentMessage || {});
  let events = (Array.isArray(history) ? history : []).filter((message) => message && message.text && !message.error).map(normalizeEvent);

  // Bot.handle() runs after Store has appended this inbound; remove only the exact current-event duplicate.
  const currentUid = String((currentMessage && (currentMessage.senderId || currentMessage.uid)) || '');
  const last = events[events.length - 1];
  if (last && last.text.trim() === current.text.trim() && ((current.msgId && last.msgId === current.msgId) || (currentUid && last.uid === currentUid))) events.pop();
  events = events.slice(-MAX_EVENTS);

  const explicitReply = Boolean(currentMessage && (currentMessage.atMe || currentMessage.replyToBot || currentMessage.nameAddressed || currentMessage.replyToName || currentMessage.replyToUserId));
  const currentStrong = TOPIC_FAMILIES.find((family) => familyMatches(current.text, family, false) === 'strong') || null;
  const currentWeakFamily = TOPIC_FAMILIES.find((family) => familyMatches(current.text, family, true) === 'weak') || null;

  let family = currentStrong || (explicitReply ? currentWeakFamily : null);
  if (family && currentWeakFamily && !currentStrong) {
    const candidateAnchor = latestHumanAnchor(events, family);
    const anchorTime = candidateAnchor >= 0 ? events[candidateAnchor].ts : 0;
    if (anchorTime && nowMs - anchorTime > MAX_WEAK_FOLLOWUP_MS) family = null;
  }
  if (!family && explicitReply && isShortContinuation(current.text)) {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      if (events[i].role !== 'user') continue;
      const candidate = TOPIC_FAMILIES.find((f) => familyMatches(events[i].text, f, false) === 'strong');
      if (candidate) {
        const age = events[i].ts ? Math.max(0, nowMs - events[i].ts) : 0;
        if (!age || age <= MAX_WEAK_FOLLOWUP_MS) family = candidate;
        break;
      }
    }
  }
  let anchorIndex = family ? latestHumanAnchor(events, family) : -1;
  let anchorMessageIsCurrentSender = false;
  if (anchorIndex >= 0 && currentUid && events[anchorIndex].uid && events[anchorIndex].uid === currentUid) anchorMessageIsCurrentSender = true;

  let chain = [];
  let reason = '';
  if (family && anchorIndex < 0 && !currentStrong) family = null;
  if (family && anchorIndex >= 0) {
    const anchor = events[anchorIndex];
    const age = anchor.ts ? Math.max(0, nowMs - anchor.ts) : 0;
    const recent = !age || age <= MAX_WEAK_FOLLOWUP_MS;
    const intervening = events.slice(anchorIndex + 1);
    const hasReplyEdge = intervening.some((event) => event.replyToName || event.replyToUserId);
    const currentIsWeak = familyMatches(current.text, family, true) === 'weak';
    const bridgedByWeak = intervening.some((event) => familyMatches(event.text, family, true) === 'weak');
    const sameTopicStrong = currentStrong && currentStrong.id === family.id;
    const userContinued = intervening.some((event) => event.role === 'user');
    const allowed = sameTopicStrong || (explicitReply && recent && !anchorMessageIsCurrentSender && (
      currentIsWeak || hasReplyEdge || bridgedByWeak || isShortContinuation(current.text) && userContinued
    ));
    if (allowed) {
      chain = makeChain(events, anchorIndex);
      reason = sameTopicStrong ? 'current-strong-anchor' : (currentIsWeak ? 'weak-current-anchored' : 'explicit-cross-speaker-followup');
    }
  }

  // Do not fall back to an untyped nearby window if it contains another strong topic anchor.
  if (!chain.length && explicitReply && !currentStrong && !currentWeakFamily) {
    const local = events.slice(-3);
    const containsStrongHumanTopic = local.some((event) => event.role === 'user' && TOPIC_FAMILIES.some((candidate) => familyMatches(event.text, candidate, false) === 'strong'));
    if (local.length && !containsStrongHumanTopic) {
      chain = local;
      reason = 'explicit-local-context-only';
    }
    family = null;
  }

  const lines = chain.map((event) => {
    const provenance = event.role === 'assistant' ? '机器人此前内容（候选，不作事实）' : '群友话题证据';
    const reply = event.replyToName ? `（回复${event.replyToName}）` : '';
    return `- [${provenance}] ${event.name}${reply}: ${event.text}`;
  });
  const userEvidenceText = chain.filter((event) => event.role === 'user').map((event) => `${event.name}: ${event.text}`).join('\n');
  const directContinuation = Boolean(chain.length && family && explicitReply);
  return {
    family: family && family.id || null,
    lines,
    block: lines.length
      ? `【跨发言者话题链候选｜${family && family.id || '直接上下文'}】只保留近期相邻事件和说话人；机器人内容是候选，不代表已证实。区分谁提出、谁补充、对象及先后关系；用户当前明确给出的信息优先。不相关时忽略。\n${lines.join('\n')}`
      : '',
    userEvidenceText,
    directContinuation,
    currentText: current.text,
    currentAnchors: currentStrong ? [currentStrong.id] : [],
    candidateCount: lines.length,
    reason,
    asOf: Number(nowMs) || Date.now(),
  };
}

module.exports = { buildMemeThread, TOPIC_FAMILIES, MAX_EVENTS, MAX_THREAD_EVENTS, isShortContinuation };
