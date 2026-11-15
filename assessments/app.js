/* Meridiano · Assessments (GJG) — results stored privately in Supabase, filled copies of each guide */
(function(){
var CFG={url:'https://oqokqkrczmdnhfwiwwdv.supabase.co',key:'sb_publishable_JNIa1DnBITfMvGDDAkYBaA_7A22onL6'};
var FONTS='https://jads-marcelino.github.io/GJG/assessments/fonts/';
var sb=window.__SB||window.supabase.createClient(CFG.url,CFG.key);
var $=function(id){return document.getElementById(id);};
var S={user:null,list:[],na:null};

function toast(t,bad){var e=$('toast');e.textContent=t;e.className='toast on'+(bad?' bad':'');clearTimeout(e._t);e._t=setTimeout(function(){e.className='toast';},3600);}
function guide(key){return GUIDES.filter(function(g){return g.key===key;})[0];}
function fmt(d){try{return new Date(d).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'});}catch(e){return '';}}
function err(r,what){if(r&&r.error)throw new Error(what+': '+r.error.message);return r?r.data:null;}
function safeName(n){return String(n||'file').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\w.\-]+/g,'_').slice(-80);}

/* ---------- filled document ---------- */
function docPage(g,files,title){
 var ff='';[['Karla','normal'],['Karla','italic'],['Newsreader','normal'],['Newsreader','italic']].forEach(function(f){ff+="@font-face{font-family:'"+f[0]+"';src:url("+FONTS+f[0]+'-'+f[1]+".woff2) format('woff2');font-weight:200 800;font-style:"+f[1]+"}";});
 var body=g.order.map(function(k){return '<section class="pg">'+files[k].replace(/<p data-edit="label" style="display:none">[^<]*<\/p>/,'')+'</section>';}).join('');
 return '<!DOCTYPE html><html lang="'+(g.lang||'es')+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+'</title><style>'+ff+
 '*{box-sizing:border-box}body{margin:0;background:#E6EAE6;font-family:Karla,Arial,sans-serif;color:#1E2B27;-webkit-text-size-adjust:100%}.pg{max-width:900px;margin:22px auto;background:#fff;padding:44px 48px;box-shadow:0 2px 18px rgba(15,36,32,.12);overflow-x:auto}'+
 '@media(max-width:720px){.pg{margin:0 0 10px;padding:22px 14px}}@media print{@page{size:A4;margin:14mm}body{background:#fff}.pg{box-shadow:none;margin:0;max-width:none;padding:0;break-after:page;overflow:visible}}</style></head><body>'+body+'</body></html>';}
function build(g,ans){var sc=guideSchema(g.files,g.order),f=fillFiles(g.files,g.order,sc,ans);return {html:f.files,stage:f.stage};}

/* ---------- auth ---------- */
function drawAuth(){var a=$('auth'),u=S.user;$('who').innerHTML=u?esc(u.email)+' · <a href="#" id="out">Sign out</a>':'';
 a.style.display=u?'none':'block';$('main').style.display=u?'block':'none';
 if($('out'))$('out').onclick=function(e){e.preventDefault();sb.auth.signOut().then(function(){S.user=null;drawAuth();});};
 if(u)load();}
$('signin').onsubmit=function(e){e.preventDefault();var m=$('authMsg');m.textContent='Signing in…';
 sb.auth.signInWithPassword({email:$('email').value.trim(),password:$('pw').value}).then(function(r){if(r.error){m.textContent=r.error.message==='Invalid login credentials'?'E-mail or password is wrong.':r.error.message;return;}S.user=r.data.user;m.textContent='';drawAuth();});};

/* ---------- guides ---------- */
function drawGuides(){$('guides').innerHTML=GUIDES.map(function(g){var sc=guideSchema(g.files,g.order),n=S.list.filter(function(a){return a.guide_key===g.key;}).length;
 return '<div class="card"><p class="eb">Guide · '+(g.lang||'es').toUpperCase()+'</p><h2>'+esc(g.short)+'</h2><p class="sub">'+esc(g.name)+'<br><span class="mut">'+sc.filter(function(s){return s.kind!=='overall'}).length+' answer fields · '+n+' assessment'+(n===1?'':'s')+'</span></p>'+
 '<div class="btns"><button class="btn pri" data-new="'+g.key+'">New assessment</button><button class="btn" data-blank="'+g.key+'">Open guide</button><a class="btn" href="'+g.pdf+'" target="_blank" rel="noopener">Original PDF</a><button class="btn" data-sheet="'+g.key+'">Answer sheet</button></div></div>';}).join('');}

/* ---------- results ---------- */
function load(){sb.from('assessments').select('id,title,guide_key,source_name,source_kind,source_path,answers,stage,method,status,note,created_at,updated_at').not('guide_key','is',null).order('created_at',{ascending:false})
 .then(function(r){S.list=err(r,'Loading results')||[];drawGuides();drawList();}).catch(function(e){toast(e.message,true);});}
function drawList(){var L=$('list');if(!S.list.length){L.innerHTML='<p class="empty">No assessments yet. Choose a guide and tap <b>New assessment</b>.</p>';return;}
 L.innerHTML=S.list.map(function(a){var g=guide(a.guide_key);return '<div class="row"><div class="rt"><b>'+esc(a.title)+'</b><span class="mut">'+esc(g?g.short:a.guide_key)+' · '+fmt(a.created_at)+(a.source_name?' · '+esc(a.source_name):'')+'</span></div>'+
 '<div class="rm">'+(a.stage?'<span class="chip s'+a.stage+'">Etapa '+a.stage+'</span>':'<span class="chip">No stage</span>')+'<span class="mut">'+({auto:'Automatic',claude:'Claude',manual:'Edited'}[a.method]||a.method||'')+'</span></div>'+
 '<div class="ra"><button class="btn sm pri" data-open="'+a.id+'">Open</button><button class="btn sm" data-edit="'+a.id+'">Edit</button>'+(a.source_path?'<button class="btn sm" data-src="'+a.id+'">Source file</button>':'')+'<button class="btn sm ghost" data-del="'+a.id+'">Delete</button></div></div>';}).join('');}
function byId(id){return S.list.filter(function(a){return a.id===id;})[0];}

/* ---------- viewer ---------- */
function view(html,title,fileName){$('vTitle').textContent=title;var fr=$('vFrame');fr.srcdoc=html;$('viewer').classList.add('on');document.body.style.overflow='hidden';
 $('vPrint').onclick=function(){try{fr.contentWindow.focus();fr.contentWindow.print();}catch(e){toast('Use Download, then print from the file.',true);}};
 $('vDown').onclick=function(){download(fileName,html,'text/html');};}
function closeView(){$('viewer').classList.remove('on');document.body.style.overflow='';$('vFrame').srcdoc='';}
$('vClose').onclick=closeView;
function download(name,text,type){var b=new Blob([text],{type:type+';charset=utf-8'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u);},4000);}
function openResult(id){var a=byId(id);sb.from('assessments').select('result_html').eq('id',id).single().then(function(r){var d=err(r,'Opening');var h=d&&d.result_html;
 if(!h){var g=guide(a.guide_key);h=docPage(g,build(g,a.answers||{}).html,a.title);}view(h,a.title,safeName(a.title)+'.html');}).catch(function(e){toast(e.message,true);});}

/* ---------- new / edit ---------- */
function openNA(key,row){var g=guide(key);S.na={g:g,row:row||null,step:row?2:1,src:'file',text:row?'':'',name:row?row.source_name:'',kind:row?row.source_kind:'',file:null,
 title:row?row.title:'',ans:row?clone(row.answers||{}):{},method:row?row.method:'auto',note:row?(row.note||''):'',found:null};
 if(row)sb.from('assessments').select('source_text').eq('id',row.id).single().then(function(r){if(r.data&&S.na&&S.na.row===row){S.na.text=r.data.source_text||'';}});
 $('na').classList.add('on');document.body.style.overflow='hidden';drawNA();}
function closeNA(){$('na').classList.remove('on');document.body.style.overflow='';S.na=null;}
function fieldLabel(s){if(s.field==='fecha')return 'Fecha de la sesión';if(s.field==='participantes')return 'Directivos participantes';var q=s.q||s.field;return (s.id&&q.indexOf(s.id)!==0?s.id+' · ':'')+q;}
function drawNA(){var N=S.na,g=N.g,sc=guideSchema(g.files,g.order),h='';
 h+='<div class="mh"><div><p class="eb">'+(N.row?'Edit assessment':'New assessment')+'</p><h2>'+esc(g.short)+'</h2></div><button class="x" data-na="close" aria-label="Close">×</button></div>';
 if(N.step===1){
  h+='<label class="lb">Name of this assessment</label><input id="naTitle" class="in" placeholder="e.g. Junta Directiva · primera sesión" value="'+esc(N.title)+'">';
  h+='<div class="tabs sm">'+[['file','File'],['link','Link'],['paste','Paste']].map(function(t){return '<button data-src="'+t[0]+'" class="'+(N.src===t[0]?'on':'')+'">'+t[1]+'</button>';}).join('')+'</div>';
  if(N.src==='file')h+='<label class="drop"><input type="file" id="naFile" accept=".pdf,.docx,.txt,.md,.html,.htm,.json,.csv,application/pdf,text/*"><span id="naFileLbl">'+(N.file?esc(N.file.name):'Choose a file · PDF, Word, text or HTML<br><small>From Files, iCloud, Google Drive, Dropbox or OneDrive</small>')+'</span></label>';
  if(N.src==='link')h+='<input id="naLink" class="in" placeholder="Shared link (Google Drive, Docs, Dropbox, OneDrive, GitHub…)"><p class="hint">The link must be open to anyone with it.</p>';
  if(N.src==='paste')h+='<textarea id="naPaste" class="in ta" placeholder="Paste meeting notes, a transcript, the filled answer sheet or JSON from Claude">'+esc(N.src==='paste'?N.text:'')+'</textarea>';
  h+='<p class="hint">Best results: the <b>answer sheet</b> of this guide, or notes labelled T1…T6 and D1…D5. Free-form notes work too: read them and then ask Claude in the next step.</p>';
  h+='<p id="naMsg" class="msg"></p><div class="mf"><button class="btn ghost" data-na="close">Cancel</button><button class="btn pri" data-na="read">Read</button></div>';
 }else{
  var tot=sc.filter(function(s){return s.kind!=='overall'}).length,got=sc.filter(function(s){var v=N.ans[s.field];return s.kind!=='overall'&&v!=null&&v!==''&&v!==0;}).length,ov=overallStage(sc,N.ans);
  if(!N.row)h+='<div class="sum">'+(N.found!=null?'Automatic reading found <b>'+N.found+' of '+tot+'</b> answers. ':'')+'Review and complete below'+(N.found!=null&&N.found<tot?', or ask Claude to read the file':'')+'.</div>';
  h+='<label class="lb">Name of this assessment</label><input id="naTitle" class="in" value="'+esc(N.title)+'">';
  h+='<div class="ov">Overall stage <b>'+(ov?'Etapa '+ov:'—')+'</b><span class="mut"> · the lowest triage stage</span></div><div class="fields">';
  sc.forEach(function(s){if(s.kind==='overall')return;var v=N.ans[s.field];
   h+='<div class="fld"><label class="lb">'+esc(fieldLabel(s))+'</label>';
   if(s.kind==='stage'){h+='<div class="seg">'+[1,2,3].map(function(n){return '<button data-st="'+s.field+'" data-n="'+n+'" class="'+(+v===n?'on':'')+'">Etapa '+n+'</button>';}).join('')+'<button data-st="'+s.field+'" data-n="0" class="'+(!+v?'on':'')+'">—</button></div>'+(s.l?'<p class="hint">'+esc(s.l)+'</p>':'');}
   else h+='<textarea class="in ta s" data-f="'+s.field+'" rows="'+(s.field==='fecha'?1:2)+'">'+esc(v==null?'':v)+'</textarea>';
   h+='</div>';});
  h+='</div><label class="lb">Note (gaps, follow-ups)</label><textarea id="naNote" class="in ta s" rows="2">'+esc(N.note)+'</textarea>';
  h+='<details class="claude"'+(N.found!=null&&N.found<tot?' open':'')+'><summary>Ask Claude to fill it</summary><p class="hint">1 · Copy the request (it carries the file text and the questions). 2 · Paste it in Claude. 3 · Paste Claude\'s JSON answer here and tap Apply.</p>'+
   '<div class="btns"><button class="btn sm" data-na="copy">Copy request for Claude</button><a class="btn sm" href="https://claude.ai/new" target="_blank" rel="noopener">Open Claude ↗</a></div><textarea id="naJson" class="in ta s" rows="3" placeholder="Paste Claude\'s answer (JSON)"></textarea><div class="btns"><button class="btn sm" data-na="apply">Apply answer</button></div></details>';
  h+='<p id="naMsg" class="msg"></p><div class="mf">'+(N.row?'':'<button class="btn ghost" data-na="back">← Back</button>')+'<button class="btn" data-na="preview">Preview</button><button class="btn pri" data-na="save">'+(N.row?'Save changes':'Save filled copy')+'</button></div>';
 }
 $('naBox').innerHTML=h;var f=$('naFile');if(f)f.onchange=function(){N.file=f.files[0]||null;$('naFileLbl').textContent=N.file?N.file.name:'';};}
function collect(){var N=S.na;if(!N)return;var t=$('naTitle');if(t)N.title=t.value.trim();document.querySelectorAll('#naBox [data-f]').forEach(function(e){N.ans[e.dataset.f]=e.value.trim();});var n=$('naNote');if(n)N.note=n.value.trim();var p=$('naPaste');if(p)N.text=p.value;}
function msg(t,bad){var m=$('naMsg');if(m){m.textContent=t;m.className='msg'+(bad?' bad':'');}}
function readSource(){var N=S.na;collect();
 if(N.src==='file'){if(!N.file)return Promise.reject(new Error('Choose a file first.'));N.name=N.file.name;return readAnyFile(N.file).then(function(r){N.kind=r.kind;return r.text;});}
 if(N.src==='paste'){if(!N.text.trim())return Promise.reject(new Error('Paste the notes first.'));N.name='Pasted text';N.kind='paste';N.file=null;return Promise.resolve(N.text);}
 var url=($('naLink').value||'').trim();if(!/^https?:\/\//i.test(url))return Promise.reject(new Error('Paste a full link starting with https://'));
 return sb.functions.invoke('fetch-url',{body:{url:url,mode:'file'}}).then(function(r){var d=r.data;if(r.error||!d||d.error){var e=d&&d.error;return (r.error&&r.error.context&&r.error.context.json?r.error.context.json():Promise.resolve({})).then(function(j){throw new Error(e||(j&&j.error)||'Could not read that link.');});}
  N.name=d.name||url;N.kind='link';
  if(d.b64){var bin=atob(d.b64),u8=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);var nm=/\.(pdf|docx)$/i.test(N.name)?N.name:N.name+(/pdf/.test(d.type)||/^%PDF/.test(bin.slice(0,5))?'.pdf':'.docx');N.file=new File([u8],nm,{type:d.type||''});N.name=nm;return readAnyFile(N.file).then(function(r){return r.text;});}
  N.file=new File([d.text],safeName(N.name).replace(/(\.html?|\.txt)?$/,'.txt'),{type:'text/plain'});return /<[a-z!]/i.test(d.text)?htmlToText(d.text):d.text;});}
function doRead(){var N=S.na,b=document.querySelector('[data-na="read"]');msg('Reading…');if(b)b.disabled=true;
 readSource().then(function(text){N.text=text||'';if(!N.text.trim())throw new Error('No text found in that file. If it is a scanned PDF, paste the notes instead.');
  var sc=guideSchema(N.g.files,N.g.order);N.ans=autoAnswers(N.text,sc,guideText({files:N.g.files,order:N.g.order}));N.found=Object.keys(N.ans).filter(function(k){var v=N.ans[k];return v!=null&&v!==''&&v!==0;}).length;N.method='auto';
  if(!N.title){var base=N.kind==='paste'?'':String(N.name||'').replace(/\.[a-z0-9]+$/i,'').replace(/[_-]+/g,' ').trim();N.title=(base||'Assessment')+' · '+(N.ans.fecha||fmt(new Date()));}
  N.step=2;drawNA();}).catch(function(e){msg(e.message||String(e),true);if(b)b.disabled=false;});}
function claudePrompt(){var N=S.na,sc=guideSchema(N.g.files,N.g.order),keys={};
 var qs=sc.filter(function(s){return s.kind!=='overall'}).map(function(s){keys[s.field]=s.kind==='stage'?'1|2|3':'text';return '- '+s.field+(s.kind==='stage'?' (stage 1, 2 or 3)':'')+': '+(s.id?s.id+' · ':'')+(s.q||s.field)+(s.l?' — LECTURA: '+s.l:'');});
 return 'Fill the Meridiano discovery guide "'+N.g.name+'" from the assessment file below.\n\nRules: answer in Spanish, like the guide. For each triage question choose the stage (1, 2 or 3) following its LECTURA. Notes and findings must be short and supported by the file; do not invent facts or numbers. Leave a field as "" when the file does not cover it.\n\nReturn ONLY a JSON object with these keys (plus "note" listing the gaps):\n'+qs.join('\n')+'\n\nJSON shape: '+JSON.stringify(Object.assign(keys,{note:'text'}))+'\n\n--- ASSESSMENT FILE: '+(N.name||'')+' ---\n'+String(N.text||'').slice(0,60000);}
function applyJson(){var N=S.na;collect();var raw=($('naJson').value||'').trim().replace(/^```(?:json)?|```$/g,'').trim();var i=raw.indexOf('{'),j=raw.lastIndexOf('}');
 try{var o=JSON.parse(raw.slice(i,j+1));}catch(e){msg('That is not valid JSON. Copy only the block Claude returned.',true);return;}
 var sc=guideSchema(N.g.files,N.g.order),a=autoAnswers(JSON.stringify(o),sc,''),n=0;Object.keys(a).forEach(function(k){if(a[k]!==''&&a[k]!=null){N.ans[k]=a[k];n++;}});if(o.note)N.note=String(o.note);N.method='claude';drawNA();msg('Applied '+n+' answers from Claude.');}
function save(){var N=S.na,g=N.g;collect();if(!N.title)N.title='Assessment · '+fmt(new Date());
 var b=build(g,N.ans),html=docPage(g,b.html,N.title),btn=document.querySelector('[data-na="save"]');if(btn)btn.disabled=true;msg('Saving…');
 var method=N.row&&N.method!=='claude'?'manual':N.method;
 if(N.row){return sb.from('assessments').update({title:N.title,answers:N.ans,stage:b.stage||null,method:method,status:'filled',note:N.note||null,result_html:html,updated_at:new Date().toISOString()}).eq('id',N.row.id).then(function(r){err(r,'Saving');closeNA();toast('Saved · '+(b.stage?'Etapa '+b.stage:'no stage'));load();}).catch(function(e){msg(e.message,true);if(btn)btn.disabled=false;});}
 var id=(crypto.randomUUID?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0;return (c==='x'?r:(r&3|8)).toString(16);})),path=null;
 var up=N.file?(path=S.user.id+'/'+id+'/'+safeName(N.file.name),sb.storage.from('assessments').upload(path,N.file,{upsert:true,contentType:N.file.type||undefined}).then(function(r){if(r.error){path=null;toast('Answers saved; the source file could not be stored ('+r.error.message+').',true);}})):Promise.resolve();
 up.then(function(){return sb.from('assessments').insert({id:id,guide_key:g.key,title:N.title,source_name:N.name||null,source_kind:N.kind||null,source_path:path,source_text:String(N.text||'').slice(0,200000),answers:N.ans,stage:b.stage||null,method:method,status:'filled',note:N.note||null,result_html:html});})
  .then(function(r){err(r,'Saving');closeNA();toast('Filled copy saved · '+(b.stage?'Etapa '+b.stage:'no stage'));load();view(html,N.title,safeName(N.title)+'.html');}).catch(function(e){msg(e.message,true);if(btn)btn.disabled=false;});}
function del(id,btn){if(btn.dataset.sure!=='1'){btn.dataset.sure='1';btn.textContent='Tap again to delete';setTimeout(function(){if(btn.isConnected){btn.dataset.sure='';btn.textContent='Delete';}},4000);return;}
 var a=byId(id);(a&&a.source_path?sb.storage.from('assessments').remove([a.source_path]):Promise.resolve()).then(function(){return sb.from('assessments').delete().eq('id',id);}).then(function(r){err(r,'Deleting');toast('Assessment deleted');load();}).catch(function(e){toast(e.message,true);});}
function source(id){var a=byId(id);sb.storage.from('assessments').createSignedUrl(a.source_path,600).then(function(r){if(r.error)throw r.error;window.open(r.data.signedUrl,'_blank','noopener');}).catch(function(e){toast('Could not open the file: '+(e.message||e),true);});}

/* ---------- events ---------- */
document.addEventListener('click',function(e){var t=e.target.closest('button,[data-na]');if(!t)return;var d=t.dataset;
 if(d.new){openNA(d.new);return;}
 if(d.blank){var g=guide(d.blank);view(docPage(g,g.files,g.name),g.name,safeName(g.short)+'-guia.html');return;}
 if(d.sheet){var g2=guide(d.sheet);download(safeName(g2.short)+'-answer-sheet.txt',answerSheet({name:g2.name,files:g2.files,order:g2.order}),'text/plain');return;}
 if(d.open){openResult(d.open);return;}
 if(d.edit){var a=byId(d.edit);openNA(a.guide_key,a);return;}
 if(d.del){del(d.del,t);return;}
 if(d.src&&!S.na){source(d.src);return;}
 if(S.na){
  if(d.src){collect();S.na.src=d.src;drawNA();return;}
  if(d.st){collect();S.na.ans[d.st]=+d.n||0;if(S.na.method==='auto'&&S.na.row)S.na.method='manual';drawNA();return;}
  if(d.na==='close'){closeNA();return;}
  if(d.na==='read'){doRead();return;}
  if(d.na==='back'){collect();S.na.step=1;drawNA();return;}
  if(d.na==='copy'){collect();var p=claudePrompt();(navigator.clipboard?navigator.clipboard.writeText(p):Promise.reject()).then(function(){msg('Request copied. Paste it in Claude.');},function(){download('request-for-claude.txt',p,'text/plain');msg('Saved as a file; open it and copy the text into Claude.');});return;}
  if(d.na==='apply'){applyJson();return;}
  if(d.na==='preview'){collect();var b=build(S.na.g,S.na.ans);view(docPage(S.na.g,b.html,S.na.title||'Preview'),'Preview · '+(S.na.title||''),'preview.html');return;}
  if(d.na==='save'){save();return;}
 }});
document.addEventListener('keydown',function(e){if(e.key==='Escape'){if($('viewer').classList.contains('on'))closeView();else if(S.na)closeNA();}});

sb.auth.getSession().then(function(r){S.user=r.data&&r.data.session?r.data.session.user:null;drawAuth();});
drawGuides();
window.__AS=S;
})();
