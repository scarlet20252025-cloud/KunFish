'use strict';

/* =========================================================
   鲲鲲 · 前端逻辑（原生 JS，无依赖）
   ========================================================= */

const $ = (id) => document.getElementById(id);
const chatEl = $('chat');
const inputEl = $('input');
const sendBtn = $('send');
const typingEl = $('typing');

const GROUP_MEMBERS = [
  { name: '阿螈', emoji: '🐟' },
  { name: '海胆酱', emoji: '🦔' },
  { name: '小丑鱼', emoji: '🐠' },
  { name: '你自己', emoji: '🙋' },
];

const state = {
  sessionId: localStorage.getItem('whale.sessionId') || '',
  mode: localStorage.getItem('whale.mode') || 'private',
  userName: localStorage.getItem('whale.userName') || '',
  streaming: false,
  status: null,
  settings: null,
  wechat: null,
};

if (!state.sessionId) {
  state.sessionId = 'w' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  localStorage.setItem('whale.sessionId', state.sessionId);
}

/* ---------------- 背景气泡 ---------------- */
function makeBubbles() {
  const host = $('bubbles');
  if (!host) return;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 26; i++) {
    const b = document.createElement('span');
    const size = 4 + Math.random() * 16;
    b.style.width = b.style.height = size + 'px';
    b.style.left = Math.random() * 100 + '%';
    b.style.animationDuration = 12 + Math.random() * 20 + 's';
    b.style.animationDelay = -Math.random() * 26 + 's';
    b.style.setProperty('--drift', Math.round((Math.random() - 0.5) * 90) + 'px');
    b.style.opacity = String(0.2 + Math.random() * 0.5);
    frag.appendChild(b);
  }
  host.appendChild(frag);
}

/* ---------------- 工具 ---------------- */
function nowLabel(d = new Date()) {
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function scrollToBottom(smooth = true) {
  chatEl.scrollTo({ top: chatEl.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

function toast(text, ms = 2600) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), ms);
}

function escapeTime(ts) {
  const d = new Date(ts || Date.now());
  return isNaN(d.getTime()) ? '' : nowLabel(d);
}

function memberEmoji(name) {
  const m = GROUP_MEMBERS.find((x) => x.name === name);
  return m ? m.emoji : (name || '你').slice(0, 1);
}

/* ---------------- 消息渲染 ---------------- */
function addMessage({ role, name, text, time, error, caret }) {
  if (role === 'system') {
    const line = document.createElement('div');
    line.className = 'system-line';
    line.textContent = text;
    chatEl.appendChild(line);
    scrollToBottom();
    return line;
  }

  const row = document.createElement('div');
  row.className = 'msg ' + (role === 'bot' ? 'bot' : 'user');

  const avatar = document.createElement('div');
  avatar.className = 'mini-avatar';
  if (role === 'bot') {
    const img = document.createElement('img');
    img.src = '/assets/avatar.jpg';
    img.alt = '';
    img.style.cssText = 'width:100%;height:100%;border-radius:50%;display:block';
    avatar.appendChild(img);
  } else {
    avatar.textContent = memberEmoji(name);
  }
  avatar.style.display = 'grid';
  avatar.style.placeItems = 'center';
  avatar.style.fontSize = '14px';

  const body = document.createElement('div');
  body.className = 'body';

  const nameEl = document.createElement('div');
  nameEl.className = 'name';
  nameEl.textContent = role === 'bot' ? '鲲鲲' : name || '你';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  if (error) bubble.style.borderColor = 'rgba(255,120,140,.45)';
  const textNode = document.createElement('span');
  textNode.className = 'bubble-text';
  textNode.textContent = text || '';
  bubble.appendChild(textNode);

  let caretEl = null;
  if (caret) {
    caretEl = document.createElement('span');
    caretEl.className = 'caret';
    bubble.appendChild(caretEl);
  }

  const timeEl = document.createElement('div');
  timeEl.className = 'time';
  timeEl.textContent = time || nowLabel();

  body.appendChild(nameEl);
  body.appendChild(bubble);
  body.appendChild(timeEl);
  row.appendChild(avatar);
  row.appendChild(body);
  chatEl.appendChild(row);
  scrollToBottom();
  return { row, bubble, textNode, caretEl };
}

function setText(node, text) {
  node.textContent = text;
}

/** 把一条长回复拆成几条气泡（更接近真实群聊） */
function expandBubbles(msgEl, bubbles) {
  if (!bubbles || bubbles.length <= 1) return;
  msgEl.row.remove();
  let delay = 0;
  for (const b of bubbles) {
    setTimeout(() => {
      addMessage({ role: 'bot', text: b, time: nowLabel() });
    }, delay);
    delay += 260;
  }
}

function showTyping(show) {
  typingEl.hidden = !show;
  if (show) scrollToBottom();
}

/* ---------------- 状态刷新 ---------------- */
async function refreshStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    state.status = data;
    const dot = $('dot');
    dot.className = 'dot';
    // 把版本号显示出来：以前网页上完全看不到版本，装了新旧包分不清
    if ($('buildVersion')) $('buildVersion').textContent = data.version ? ` · v${data.version}` : '';
    if (data.mock) dot.classList.add('mock');
    if (data.mock) {
      $('statusText').textContent = '演示模式 · 内置台词';
    } else {
      $('statusText').textContent = `${data.providerLabel || '模型'} · ${data.model} · 在线`;
    }
    $('hint').textContent = data.mock
      ? data.hasKey
        ? '⚠️ 已保存 API Key，但「演示模式」开着，现在只会说内置台词。去设置里关掉它，就是真模型了。'
        : '演示模式：还没配置模型，用的是内置台词。点右上角「设置」选一个免费模型（智谱 GLM-4-Flash / 本地 Ollama）就能真聊。'
      : `已接入 ${data.providerLabel || '模型'}（${data.model}）。记忆存在本机，共 ${data.memory.sessions} 个聊天。`;
    const gws = data.gateways || [];
    $('gatewayState').textContent = gws
      .map((g) => {
        if (!g.enabled) return `${g.platform}：未启用`;
        if (g.outboundConfigured) {
          return `${g.platform}：中转网关已配置${g.received ? ` · 收到 ${g.received} 条` : ''}`;
        }
        const b = g.bridge || {};
        const got = g.received ? ` · 收到 ${g.received} 条` : '';
        if (!b.online) {
          return `${g.platform}：桥接离线 ← 微信里收不到回复（要另开「启动微信桥接.bat」）`;
        }
        const state = b.rest
          ? '游戏运行中 · 休息模式（回复先排队）'
          : b.listener === false
            ? '收消息线程已停（微信里发消息不会进来，重启桥接）'
            : b.uia === false
              ? 'UIA 不可用（消息发不出去，看桥接窗口报错）'
              : b.uia === null
                ? '状态未知（等预热）'
                : 'UIA 正常';
        return `${g.platform}：桥接在线 · ${state}${got}`;
      })
      .join('　｜　');
    updateWebhookCodes();
  } catch (err) {
    $('dot').className = 'dot off';
    $('statusText').textContent = '连不上本地服务…';
  }
}

function updateWebhookCodes() {
  const origin = location.origin;
  $('whWechat').textContent = origin + '/webhook/wechat';
  $('whDouyin').textContent = origin + '/webhook/douyin';
}

/* ---------------- 模式 / 快捷按钮 ---------------- */
const CHIPS = {
  private: [
    { t: '你是谁呀' },
    { t: '讲个冷笑话' },
    { t: '深海小知识' },
    { t: '安慰我一下' },
    { t: '晚安' },
  ],
  group: [
    { t: '在吗', at: true },
    { t: '今天加班好累啊' },
    { t: '哈哈哈哈哈哈' },
    { t: '鲲鲲你说呢' },
    { t: '晚上吃啥' },
  ],
};

function renderChips() {
  const host = $('chips');
  host.textContent = '';
  for (const c of CHIPS[state.mode]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.textContent = c.at ? '@鲲鲲 ' + c.t : c.t;
    btn.addEventListener('click', () => {
      if (state.mode === 'group') {
        sendMessage(c.at ? '@鲲鲲 ' + c.t : c.t);
      } else {
        sendMessage(c.t);
      }
    });
    host.appendChild(btn);
  }
}

function applyMode() {
  const isGroup = state.mode === 'group';
  $('groupBar').hidden = !isGroup;
  $('senderSel').hidden = !isGroup;
  $('btnAt').hidden = !isGroup;
  $('btnMode').classList.toggle('active', isGroup);
  $('btnMode').querySelector('em').textContent = isGroup ? '私聊' : '群聊';
  inputEl.placeholder = isGroup
    ? '以群友身份说点什么…（打「鲲鲲」或点 @ 才会被接话）'
    : '跟鲲鲲说点什么…（Enter 发送 / Shift+Enter 换行）';
  renderChips();
}

/* ---------------- 发送 ---------------- */
async function sendMessage(rawText) {
  if (state.streaming) return;
  const text = String(rawText ?? inputEl.value).trim();
  if (!text) return;
  if (rawText === undefined) {
    inputEl.value = '';
    autoGrow();
  }

  const isGroup = state.mode === 'group';
  const senderName = isGroup ? $('senderSel').value : state.userName || '你';
  addMessage({ role: 'user', name: senderName, text });
  showTyping(true);
  state.streaming = true;
  sendBtn.disabled = true;

  let streamMsg = null;
  let full = '';
  let gotAny = false;

  const payload = {
    text,
    mode: state.mode,
    sessionId: state.sessionId,
    senderName,
    msgId: 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
  };

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const ct = res.headers.get('content-type') || '';

    if (!ct.includes('text/event-stream')) {
      const data = await res.json().catch(() => ({}));
      showTyping(false);
      if (data.action === 'ignore') {
        addMessage({ role: 'system', text: ignoreReasonText(data.reason) });
      } else if (data.error) {
        addMessage({ role: 'bot', text: data.error, error: true });
      }
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    const handleEvent = (evt) => {
      if (evt.type === 'meta') {
        gotAny = true;
        return;
      }
      if (evt.type === 'delta') {
        if (!streamMsg) {
          showTyping(false);
          streamMsg = addMessage({ role: 'bot', text: '', caret: true });
        }
        full += evt.text || '';
        setText(streamMsg.textNode, full);
        scrollToBottom(false);
        return;
      }
      if (evt.type === 'done') {
        if (!streamMsg) {
          showTyping(false);
          streamMsg = addMessage({ role: 'bot', text: evt.text || full, error: evt.error });
        } else {
          if (streamMsg.caretEl) streamMsg.caretEl.remove();
          setText(streamMsg.textNode, evt.text || full);
        }
        if (evt.error) {
          streamMsg.bubble.style.borderColor = 'rgba(255,120,140,.45)';
          toast('DeepSeek 没接上，先看看控制台日志或检查 API Key');
        }
        if (evt.bubbles && evt.bubbles.length > 1 && !evt.error) {
          expandBubbles(streamMsg, evt.bubbles);
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data:')) continue;
          try {
            handleEvent(JSON.parse(line.slice(5).trim()));
          } catch {
            /* ignore malformed */
          }
        }
      }
    }

    if (!gotAny && !full) {
      showTyping(false);
      addMessage({ role: 'system', text: '（鲲鲲没有回应，可能是网络或接口问题）' });
    }
  } catch (err) {
    showTyping(false);
    addMessage({ role: 'system', text: '（连不上本地服务，确认 server 还开着：node server.js）' });
    console.error(err);
  } finally {
    state.streaming = false;
    sendBtn.disabled = false;
    showTyping(false);
    if (streamMsg && streamMsg.caretEl) streamMsg.caretEl.remove();
    setTimeout(() => scrollToBottom(false), 60);
  }
}

function ignoreReasonText(reason) {
  const map = {
    not_addressed: '（鲲鲲没被叫到，只在旁边冒了个泡）',
    duplicate: '（重复消息，鲲鲲跳过了）',
    muted: '（鲲鲲闭麦中…@ 她试试）',
    cooldown: '（鲲鲲刚说完，先歇一下）',
    rate_limited: '（鲲鲲今天话有点多，先歇一下）',
    no_text: '（没有文字内容）',
  };
  return map[reason] || `（鲲鲲没有接话：${reason}）`;
}

/* ---------------- 群友自动串门 ---------------- */
const AUTO_SCRIPT = [
  { from: '阿螈', text: '今天加班到十点，人已经麻了' },
  { from: '海胆酱', text: '@鲲鲲 你说人为什么要上班啊', at: true },
  { from: '小丑鱼', text: '哈哈哈哈哈哈哈' },
  { from: '阿螈', text: '鲲鲲，安慰我一下' },
];

let autoRunning = false;
async function runAutoGroup() {
  if (autoRunning || state.streaming) return;
  autoRunning = true;
  const btn = $('btnAutoGroup');
  btn.disabled = true;
  for (const step of AUTO_SCRIPT) {
    $('senderSel').value = step.from;
    await streamForGroup(step.text, step.from);
    await new Promise((r) => setTimeout(r, 700));
  }
  btn.disabled = false;
  autoRunning = false;
}

async function streamForGroup(text, sender) {
  // 复用 sendMessage 的渲染与流式逻辑，但固定发送者
  const prevMode = state.mode;
  state.mode = 'group';
  const prevVal = $('senderSel').value;
  $('senderSel').value = sender;
  const isAt = /^@/.test(text);
  if (!isAt) {
    // 非 @ 消息也走一次接口，让鲲鲲"旁听"（会被忽略）
    const payload = {
      text,
      mode: 'group',
      sessionId: state.sessionId,
      senderName: sender,
      msgId: 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    };
    addMessage({ role: 'user', name: sender, text });
    showTyping(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('text/event-stream')) {
        const data = await res.json().catch(() => ({}));
        showTyping(false);
        if (data.action === 'ignore') addMessage({ role: 'system', text: ignoreReasonText(data.reason) });
      } else {
        // 少见：随机接话，直接读取完整流
        showTyping(false);
        await consumeStreamSimple(res);
      }
    } catch {
      showTyping(false);
    }
    state.mode = prevMode;
    $('senderSel').value = prevVal;
    return;
  }
  await sendMessage(text);
  state.mode = prevMode;
  $('senderSel').value = prevVal;
}

async function consumeStreamSimple(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let full = '';
  let msg = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data:')) continue;
        let evt;
        try { evt = JSON.parse(line.slice(5).trim()); } catch { continue; }
        if (evt.type === 'delta') {
          if (!msg) msg = addMessage({ role: 'bot', text: '', caret: true });
          full += evt.text || '';
          setText(msg.textNode, full);
          scrollToBottom(false);
        } else if (evt.type === 'done') {
          if (!msg) msg = addMessage({ role: 'bot', text: evt.text || full });
          else {
            if (msg.caretEl) msg.caretEl.remove();
            setText(msg.textNode, evt.text || full);
          }
          if (evt.bubbles && evt.bubbles.length > 1) expandBubbles(msg, evt.bubbles);
        }
      }
    }
  }
}

/* ---------------- 设置 ---------------- */

async function openSettings() {
  $('settingsModal').hidden = false;
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    state.settings = data;
    if (data.userName) state.userName = data.userName;
    const g = data.group || {};
    if ($('requireAt')) $('requireAt').checked = Boolean(g.requireAt);
    if ($('freeChat')) $('freeChat').checked = Boolean(g.freeChat);
    if ($('freeChance')) $('freeChance').value = Math.round((g.freeChatChance || 0) * 100);
    if ($('chanceVal')) $('chanceVal').textContent = Math.round((g.freeChatChance || 0) * 100) + '%';
    updateWebhookCodes();
    await loadWechatAccounts();
    await refreshStatus();
  } catch {
    toast('读取设置失败，服务还在吗？');
  }
}

/* ---------------- 微信账号（多开时选小号） ---------------- */

function fmtAccountTime(ms) {
  const n = Number(ms) || 0;
  if (!n) return '';
  const d = new Date(n);
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function accountLabel(a) {
  const parts = [];
  if (a.nick) parts.push(a.nick);
  parts.push(a.wxid || a.account);
  const t = fmtAccountTime(a.lastActive);
  if (t) parts.push('最近活跃 ' + t);
  return parts.join(' · ');
}

function renderWechatAccounts() {
  const sel = $('wechatAccount');
  if (!sel) return;
  const data = state.wechat || {};
  const accounts = Array.isArray(data.accounts) ? data.accounts : [];
  sel.textContent = '';
  const auto = document.createElement('option');
  auto.value = '';
  auto.textContent = '自动（按「最近活跃」选，双开时可能选到大号）';
  sel.appendChild(auto);
  for (const a of accounts) {
    const opt = document.createElement('option');
    opt.value = a.account;
    opt.textContent = accountLabel(a);
    sel.appendChild(opt);
  }
  // 选中的是「当前配置值」：解析得到就用目录名，解析不到就留空（下面用文字提示）
  const wanted = String(data.wanted || '');
  const current = String(data.current || '');
  sel.value = current || '';
  if (!wanted) sel.value = '';

  const help = $('wechatAccountHelp');
  const live = $('wechatAccountLive');
  if (help) {
    if (!data.dbDir) {
      help.textContent = '还没找到微信的数据目录。先双击一次「启动微信桥接.bat」，或点上面的「刷新账户列表」。';
    } else if (accounts.length === 0) {
      help.textContent = `在 ${data.dbDir} 下没扫到账号目录（微信要先登录过）。`;
    } else if (accounts.length === 1) {
      help.textContent = '本机只有 1 个微信账号，不选也行。';
    } else if (wanted && !current) {
      help.textContent = `⚠️ 配置里写的账号「${wanted}」在本机找不到；下面列出的是实际能用的账号，请重新选一个。`;
    } else {
      help.textContent = `本机有 ${accounts.length} 个微信账号。双开时一定要选小号，否则她会从大号说话。`;
    }
  }
  if (live) {
    const b = data.live;
    if (!b || !b.online) {
      live.textContent = '桥接没在跑：保存后双击「启动微信桥接.bat」才生效。';
    } else if (b.ok) {
      live.textContent = `桥接当前在用：${b.nick || b.account || '?'}（窗口已确认）`;
    } else {
      live.textContent = `桥接当前在用：${b.nick || b.account || '?'}（窗口还没认出来，现在不会发送）`;
    }
  }
}

async function loadWechatAccounts(opts = {}) {
  const sel = $('wechatAccount');
  if (!sel) return;
  if (opts.refresh) {
    const btn = $('btnRefreshAccounts');
    const help = $('wechatAccountHelp');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '正在读昵称…';
    }
    if (help) help.textContent = '正在让桥接读各账号的昵称（第一次要十几秒，别关窗口）…';
    try {
      const res = await fetch('/api/wechat/accounts/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();
      state.wechat = data;
      if (data.error) toast('读昵称失败：' + data.error);
    } catch (err) {
      toast('刷新账户失败：' + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '刷新账户列表';
      }
    }
  } else {
    try {
      const res = await fetch('/api/wechat/accounts');
      state.wechat = await res.json();
    } catch {
      return;
    }
  }
  renderWechatAccounts();
}

/** 保存时如果账号变了，写进 config.json；桥接发现值变了会自己重启 */
async function applyWechatAccount() {
  const sel = $('wechatAccount');
  if (!sel) return { changed: false };
  const want = sel.value || '';
  const cur = (state.wechat && (state.wechat.current || '')) || '';
  if (want === cur) return { changed: false };
  if (want) {
    // 账号一旦选错，她会用大号说话 —— 保存前让用户再确认一次
    const a = ((state.wechat && state.wechat.accounts) || []).find((x) => x.account === want);
    const name = (a && (a.nick || a.wxid)) || want;
    const ok = window.confirm(
      '确定让鲲鲲操作「' + name + '」这个微信号吗？\n\n' +
      '如果这是你平时聊天、加好友用的号（大号），请改成不常用的小号 —— 选错了她会用你的大号说话。'
    );
    if (!ok) {
      renderWechatAccounts(); // 下拉恢复到已保存的值
      return { changed: false, cancelled: true };
    }
  }
  const res = await fetch('/api/wechat/account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: want }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '切换微信账号失败');
  state.wechat = data;
  return { changed: true, want, online: Boolean(data.live && data.live.online) };
}

async function waitBridgeAccount(wantDir, timeoutMs = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const res = await fetch('/api/status');
      const s = await res.json();
      const gw = (s.gateways || []).find((g) => g.platform === 'wechat');
      const b = gw && gw.bridge;
      if (b && b.online && b.account === wantDir) return b;
    } catch {
      /* 服务重启中就再来一次 */
    }
  }
  return null;
}

function settingsPayload() {
  // Model connection settings now live on /advanced. The chat modal only owns group rules.
  return {
    group: {
      requireAt: $('requireAt').checked,
      freeChat: $('freeChat').checked,
      freeChatChance: Number($('freeChance').value) / 100,
    },
  };
}

async function saveSettings() {
  const btn = $('saveSettings');
  btn.disabled = true;
  btn.textContent = '正在唤醒…';
  try {
    const settingsBody = settingsPayload();
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsBody),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || '保存失败');
    // 微信账号：只有真的变了才写 config.json（桥接发现值变了会自己重启）
    const acct = await applyWechatAccount().catch((e) => {
      toast('账号没切换成功：' + e.message);
      return { changed: false };
    });
    $('settingsModal').hidden = true;
    await refreshStatus();
    if (data.settings && data.settings.vision) {
      state.vision = data.settings.vision;
    }
    if (state.status && !state.status.mock) {
      addMessage({ role: 'system', text: '（群聊规则已保存）' });
      toast('群聊规则已保存');
    } else {
      toast('已保存（当前是演示模式）');
    }
    // 账号切换是「改 config → 桥接自己重启」，这里等它回来再报结果
    if (acct && acct.changed) {
      if (!acct.want) {
        toast('已恢复「自动选账号」，桥接几秒后自己重启');
      } else if (!acct.online) {
        toast('账号已保存（桥接现在没在跑，下次启动就用这个号）');
      } else {
        toast('账号已保存，桥接几秒后自己重启…');
        const b = await waitBridgeAccount(acct.want);
        if (b) toast('切换完成：现在用「' + (b.accountNick || b.account) + '」说话');
        else toast('还没等到桥接回来：检查「启动微信桥接.bat」那个窗口是否还开着');
      }
    }
  } catch (err) {
    toast('保存失败：' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '保存并唤醒鲲鲲';
  }
}

/* ---------------- 输入框 ---------------- */
function autoGrow() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(128, inputEl.scrollHeight) + 'px';
}

function bindEvents() {
  sendBtn.addEventListener('click', () => sendMessage());

  inputEl.addEventListener('input', autoGrow);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  });

  $('btnMode').addEventListener('click', () => {
    state.mode = state.mode === 'group' ? 'private' : 'group';
    localStorage.setItem('whale.mode', state.mode);
    applyMode();
    addMessage({
      role: 'system',
      text: state.mode === 'group' ? '（切到群聊：深海鱼塘，选一个群友身份说话吧）' : '（切回私聊：只有你和鲲鲲）',
    });
  });

  $('btnSettings').addEventListener('click', openSettings);
  $('btnMemory').addEventListener('click', openMemory);
  $('saveSettings').addEventListener('click', saveSettings);
const acctRefreshBtn = $('btnRefreshAccounts');
if (acctRefreshBtn) acctRefreshBtn.addEventListener('click', () => loadWechatAccounts({ refresh: true }));
  $('clearMemory').addEventListener('click', clearMemory);
  $('btnAutoGroup').addEventListener('click', runAutoGroup);

  // 点头像看名片（完整立绘）
  const aboutBtn = $('btnAbout');
  const openAbout = () => { $('aboutModal').hidden = false; };
  aboutBtn.addEventListener('click', openAbout);
  aboutBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openAbout();
    }
  });

  $('btnAt').addEventListener('click', () => {
    const prefix = '@鲲鲲 ';
    if (!inputEl.value.includes(prefix)) inputEl.value = prefix + inputEl.value;
    inputEl.focus();
    inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
    autoGrow();
  });

  $('freeChance').addEventListener('input', (e) => {
    $('chanceVal').textContent = e.target.value + '%';
  });

  for (const btn of document.querySelectorAll('[data-close]')) {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-close');
      $(id).hidden = true;
    });
  }
  for (const modal of document.querySelectorAll('.modal')) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.hidden = true;
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      for (const modal of document.querySelectorAll('.modal')) modal.hidden = true;
    }
  });

  for (const btn of document.querySelectorAll('[data-copy]')) {
    btn.addEventListener('click', async () => {
      const text = $(btn.getAttribute('data-copy')).textContent;
      try {
        await navigator.clipboard.writeText(text);
        toast('已复制：' + text);
      } catch {
        toast('复制失败，手动选中吧：' + text);
      }
    });
  }
}

/* ---------------- 启动 ---------------- */
async function boot() {
  makeBubbles();
  bindEvents();
  applyMode();
  await refreshStatus();
  updateWebhookCodes();

  addMessage({
    role: 'bot',
    text: '在，咋啦？\n有啥想说的就说呗，我今天有点闲',
  });

  // 没配 Key 时她会用内置台词，看着跟真聊一样 —— 第一次进来就说明白
  if (state.status && state.status.mock) {
    addMessage({
      role: 'system',
      text: '（现在是「演示模式」：还没配置 API Key，她回的是内置台词，不是真模型。右上角「设置」填一把 Key 就切成真的了）',
    });
  }

  if (state.mode === 'group') {
    addMessage({ role: 'system', text: '（深海鱼塘：点「让群友来串门」看看她在群里怎么接话）' });
  } else {
    addMessage({ role: 'system', text: '（提示：被叫「鲲鲲」她就会理你；说「记住：…」她会记在小本本上）' });
  }

  setInterval(() => refreshStatus().catch(() => {}), 30000);
}

boot();
