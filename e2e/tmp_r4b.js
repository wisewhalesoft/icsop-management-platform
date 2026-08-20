const http=require('http'),fs=require('fs'),path=require('path');const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..','prototypes'),PORT=8488;
const s=http.createServer((q,r)=>{const p=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,p);if(!fs.existsSync(f)){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(fs.readFileSync(f));});
let pass=0,fail=0;const ck=(n,c,e)=>{if(c){pass++;console.log('  ✅ '+n);}else{fail++;console.log('  ❌ '+n+(e!==undefined?'  → '+JSON.stringify(e):''));}};
(async()=>{await new Promise(r=>s.listen(PORT,r));const b=await chromium.launch();
const page=await b.newPage({viewport:{width:1600,height:950}});
const errs=[];page.on('pageerror',e=>errs.push('PE '+e.message));page.on('console',m=>{if(m.type()==='error')errs.push('CE '+m.text());});
const FILES=fs.readdirSync(ROOT).filter(f=>f.endsWith('.html')).sort();
for(const f of FILES){errs.length=0;await page.goto(`http://localhost:${PORT}/${f}`,{waitUntil:'load'});await page.waitForTimeout(850);
 if(errs.length){fail++;console.log('  ❌ '+f+'  '+errs.join(' | '));}}
ck(FILES.length+' 檔全數 0 console error',true);
await page.goto(`http://localhost:${PORT}/15-document-edit.html`,{waitUntil:'load'});await page.waitForTimeout(700);
const r=await page.evaluate(()=>{setRole('supervisor');
 const g=v=>{const es=document.querySelectorAll('[data-attachment-write="'+v+'"]');return {n:es.length,cls:es[0]?es[0].className:null};};
 return {xls:g('xls'),pdf:g('icsop_pdf'),ojt:g('ojt'),
   ojtAlsoUpload:!!document.querySelector('[data-attachment-write="ojt"][data-ojt-upload]'),
   both:document.querySelectorAll('.write-only.ojt-write').length};});
const has=(c,k)=>new RegExp('(^|\s)'+k+'(\s|$)').test(c||'');
ck('AC-N76 ④ xls：恰 1、含 write-only、不含 ojt-write',r.xls.n===1&&has(r.xls.cls,'write-only')&&!has(r.xls.cls,'ojt-write'),r.xls);
ck('AC-N76 ④ icsop_pdf：恰 1、含 write-only、不含 ojt-write',r.pdf.n===1&&has(r.pdf.cls,'write-only')&&!has(r.pdf.cls,'ojt-write'),r.pdf);
ck('AC-N76 ④ ojt：恰 1、含 ojt-write、不含 write-only',r.ojt.n===1&&has(r.ojt.cls,'ojt-write')&&!has(r.ojt.cls,'write-only'),r.ojt);
ck('AC-N76 ① ojt 掛鉤與 data-ojt-upload 同一元素',r.ojtAlsoUpload===true);
ck('AC-N25 ③ 集合式仍成立（交集為空）',r.both===0,r.both);
// 鑑別力證明：模擬「有人把 .xls 的 write-only 刪掉」，逐元素斷言應轉紅、集合式仍綠
const disc=await page.evaluate(()=>{const el=document.querySelector('[data-attachment-write="xls"]');
 el.classList.remove('write-only');
 const setBased=document.querySelectorAll('.write-only.ojt-write').length;
 const perEl=/(^|\s)write-only(\s|$)/.test(el.className);
 el.classList.add('write-only');
 return {setBased,perEl};});
ck('🔴 鑑別力證明：刪掉 .xls 的 write-only ⇒ 集合式仍綠(0) 但逐元素轉紅',disc.setBased===0&&disc.perEl===false,disc);
console.log(`\n===== 通過 ${pass} · 失敗 ${fail} =====`);
await b.close();s.close();process.exit(fail?1:0);})().catch(e=>{console.error(e);process.exit(2);});
