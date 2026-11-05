'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const persona=require('../src/persona');
const {DEFAULT_CONFIG}=require('../src/config');
// The source module may reuse temporary lexicon caches across tests; fixture mtime changes per temp root.
function fixture(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'whale-genshin-'));
 try{
  fs.writeFileSync(path.join(dir,'slang.txt'),'','utf8');
  fs.writeFileSync(path.join(dir,'memewiki.txt'),['原神启动｜玩家准备打开原神时的起哄口号。','原神牛逼｜无厘头口号，可以表示起哄或认可。','久留美｜多义日文人名，实际指代依赖上下文。'].join(String.fromCharCode(10)),'utf8');
  const config=JSON.parse(JSON.stringify(DEFAULT_CONFIG));config.paths={dataDir:dir};config.persona={...config.persona,customPrompt:'你是鲲鲲，一个爱接梗的群友。'};config.persona.master={names:['主人'],wxids:['owner-id']};fn(config);
 }finally{fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:20});}
}
test('被@喊“原神牛逼”直接接当前口号，不编造群体反应',()=>fixture(config=>{
 const sys=persona.buildSystem({config,msg:{chatType:'group',senderName:'人类统合思念体',text:'原神牛逼',cleanText:'原神牛逼',isMaster:true,atMe:true,addressedToBot:true},now:new Date('2026-11-05T12:00:00+08:00')});
 assert.match(sys,/梗百科词条：原神牛逼/);assert.match(sys,/对于「原神启动」「原神牛逼」这类单独口号/);assert.match(sys,/机器人此前的推测不算已核实事实/);
}));
test('“你就说原神牛不牛比”先回答态度，不被夸张口号取代',()=>fixture(config=>{
 const sys=persona.buildSystem({config,msg:{chatType:'group',senderName:'主人',text:'你就说原神牛不牛比',cleanText:'你就说原神牛不牛比',isMaster:true,atMe:true,addressedToBot:true},now:new Date('2026-11-05T12:00:00+08:00')});
 assert.match(sys,/梗百科词条：原神牛不牛比/);assert.match(sys,/先直接回答问句/);
}));
test('“原神启动”识别成群友口号，不是游戏命令',()=>fixture(config=>{
 const sys=persona.buildSystem({config,msg:{chatType:'group',senderName:'群友',text:'原神启动',cleanText:'原神启动',isMaster:false,atMe:true,addressedToBot:true},now:new Date('2026-11-05T12:00:00+08:00')});
 assert.match(sys,/梗百科词条：原神启动/);assert.match(sys,/群聊里常作游戏口号\/起哄/);
}));
test('同名“久留美”不凭机器人历史误匹配',()=>fixture(config=>{
 const base={chatType:'group',senderName:'群友',text:'这么喜欢久留美吗',cleanText:'这么喜欢久留美吗',isMaster:false,atMe:true,addressedToBot:true};
 const noContext=persona.buildSystem({config,msg:base,now:new Date('2026-11-05T12:00:00+08:00')});assert.doesNotMatch(noContext,/梗百科词条：久留美/);
 const botOnly=persona.buildSystem({config,msg:{...base,recentGroupContext:['鲲鲲: 刚才群友说原神角色真多']},now:new Date('2026-11-05T12:00:00+08:00')});assert.doesNotMatch(botOnly,/梗百科词条：久留美/);
}));
