(function () {
  // 访问令牌：页面首次打开时自动写入，之后所有写操作都会带上 x-bot-token。
  // 需要更换时点左侧「🔑 令牌」手动填即可。
  var DEFAULT_TOKEN = ''; // 部署时请填入自己的访问令牌，勿把真实令牌提交到仓库
  try {
    if (!localStorage.getItem('wgToken')) localStorage.setItem('wgToken', DEFAULT_TOKEN);
  } catch (e) {}

  var items = [
    ['/', '\uD83D\uDCAC', '\u804A\u5929'],
    ['/logs', '\uD83D\uDCDC', '\u65E5\u5FD7'],
    ['/slang', '\uD83D\uDCDA', '\u6897\u5E93'],
    ['/persona', '\uD83C\uDFAD', '\u4EBA\u683C'],
    ['/advanced', '\u2699\uFE0F', '\u9AD8\u7EA7'],
    ['/debug', '\uD83D\uDEE0', '\u8C03\u8BD5']
  ];
  var path = location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/index.html') path = '/';
  var isChat = path === '/';
  function build() {
    var nav = items.map(function (it) {
      var on = it[0] === path ? ' class="on"' : '';
      return '<a href="' + it[0] + '"' + on + '><span class="wg-nav-ico">' + it[1] + '</span><span>' + it[2] + '</span></a>';
    }).join('');
    var html = '<aside class="wg-side">' +
        '<div class="wg-brand"><div class="wg-brand-dot">\u9CB8</div>' +
        '<div><div class="wg-brand-name">\u9CB8\u9CB8\u63A7\u5236\u53F0</div>' +
        '<div class="wg-brand-sub">whale-girl v3.9</div></div></div>' +
        '<nav class="wg-nav">' + nav + '</nav>' +
        '<div class="wg-side-foot"><button id="wgTok">\uD83D\uDD11 \u4EE4\u724C</button></div>' +
      '</aside>';
    document.body.insertAdjacentHTML('afterbegin', html);
    document.body.classList.add(isChat ? 'wg-chat' : 'wg-page');
    var b = document.getElementById('wgTok');
    if (b) b.onclick = function () {
      var cur = localStorage.getItem('wgToken') || '';
      var v = prompt('\u8BBF\u95EE\u4EE4\u724C\uFF08\u672C\u673A\u9875\u9762\u81EA\u52A8\u83B7\u53D6\uFF1B\u8FDC\u7A0B\u8BBF\u95EE\u8BF7\u624B\u52A8\u586B\u5199\uFF09', cur);
      if (v !== null) { localStorage.setItem('wgToken', v.trim()); alert(v.trim() ? '\u4EE4\u724C\u5DF2\u4FDD\u5B58' : '\u4EE4\u724C\u5DF2\u6E05\u9664'); }
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
