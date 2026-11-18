/* Meridiano · Quadro — kanban leve da equipe.
   Dados no Supabase (tabelas jira_*, bucket privado jira-files). ?demo abre com dados em memória. */
'use strict';
const CFG = { url: 'https://oqokqkrczmdnhfwiwwdv.supabase.co', key: 'sb_publishable_JNIa1DnBITfMvGDDAkYBaA_7A22onL6' };
const DEMO = new URLSearchParams(location.search).has('demo');
const LANES = [['backlog', 'Backlog'], ['todo', 'A fazer'], ['doing', 'Fazendo'], ['review', 'Revisão'], ['done', 'Feito']];
const LN = Object.fromEntries(LANES);
const PRI = { high: 'Alta', medium: 'Média', low: 'Baixa' };
const PRANK = { high: 0, medium: 1, low: 2 };
const COLORS = ['#C9A94E', '#8DB4D6', '#7FC8A2', '#C7A2E0', '#F0A38A', '#9FC3B8'];
const IC = {
  clip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 11.5l-8.6 8.6a5 5 0 01-7.1-7.1l8.6-8.6a3.3 3.3 0 014.7 4.7l-8.6 8.6a1.7 1.7 0 01-2.4-2.4l7.9-7.9"/></svg>',
  msg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 12.3l2.7 2.7L16 9.6"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
};

/* ---------------- state & helpers ---------------- */
const S = { members: [], tasks: [], comments: [], files: [], me: null, filter: 'all', q: '', lane: 'todo', openId: null, loaded: false, urls: {} };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Math.random().toString(16).slice(2) + Date.now().toString(16));
const ts = v => (v ? Date.parse(v) : 0);
const store = { get(k) { try { return localStorage.getItem(k) } catch (_) { return null } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch (_) {} } };
const member = id => S.members.find(m => m.id === id);
const nm = id => (member(id) || {}).name || 'Sem responsável';
const first = id => {
  const n = nm(id), p = n.split(' '), f = p[0];
  if (p.length > 1 && S.members.some(m => m.id !== id && m.name.split(' ')[0] === f)) return `${f} ${p[p.length - 1][0]}.`;
  return f;
};
const initials = n => { const p = String(n || '?').trim().split(/\s+/); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); };
const colorOf = id => { const order = [...S.members].sort((a, b) => ts(a.created_at) - ts(b.created_at) || a.name.localeCompare(b.name)); const i = order.findIndex(m => m.id === id); return COLORS[(i < 0 ? 0 : i) % COLORS.length]; };
const av = (id, cls = '') => id && member(id)
  ? `<span class="av ${cls}" style="--c:${colorOf(id)}" title="${esc(nm(id))}">${esc(initials(nm(id)))}</span>`
  : `<span class="av none ${cls}">?</span>`;
const code = t => 'MER-' + (t.number ?? '·');
function ago(v) { const t = ts(v); if (!t) return ''; const s = (Date.now() - t) / 1000; if (s < 60) return 'agora'; if (s < 3600) return Math.floor(s / 60) + ' min'; if (s < 86400) return Math.floor(s / 3600) + ' h'; if (s < 604800) return Math.floor(s / 86400) + ' d'; return new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }); }
function size(b) { if (!b) return ''; if (b < 1024) return b + ' B'; if (b < 1048576) return Math.round(b / 1024) + ' KB'; return (b / 1048576).toFixed(1) + ' MB'; }
const spent = t => (Number(t.time_spent_ms) || 0) + (t.timer_started_at ? Math.max(0, Date.now() - ts(t.timer_started_at)) : 0);
function dur(ms, long) { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; if (long) return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`; return h ? `${h}h ${String(m).padStart(2, '0')}m` : (m ? `${m}m` : '<1m'); }
const dod = t => Array.isArray(t.dod) ? t.dod : [];
const dodOk = t => dod(t).length > 0 && dod(t).every(i => i.done);
const canMove = t => !!S.me && (!t.owner_id || t.owner_id === S.me);
const toReview = t => t.status === 'review' && (t.reviewers || []).includes(S.me) && !(t.approvals || {})[S.me];
const commentsOf = id => S.comments.filter(c => c.task_id === id);
const filesOf = id => S.files.filter(f => f.task_id === id);
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 3200); }
const errMsg = e => (e && (e.message || e.error_description)) || 'Algo deu errado. Tente de novo.';
async function act(fn, okMsg) {
  try { await fn(); await reload(); if (okMsg) toast(okMsg); return true; }
  catch (e) { console.error(e); toast(errMsg(e)); await reload().catch(() => {}); return false; }
}

/* ---------------- data: Supabase ---------------- */
function supaApi() {
  const sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: false } });
  const chk = r => { if (r.error) throw r.error; return r.data; };
  const safe = n => String(n).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80);
  return {
    async loadAll() {
      const [m, t, c, f] = await Promise.all([
        sb.from('jira_members').select('*').order('name'),
        sb.from('jira_tasks').select('*'),
        sb.from('jira_comments').select('*').order('created_at'),
        sb.from('jira_files').select('*').order('created_at'),
      ]);
      return { members: chk(m), tasks: chk(t), comments: chk(c), files: chk(f) };
    },
    addMember: async name => chk(await sb.from('jira_members').insert({ name }).select().single()),
    createTask: async row => chk(await sb.from('jira_tasks').insert(row).select().single()),
    updateTask: async (id, patch) => chk(await sb.from('jira_tasks').update(patch).eq('id', id).select().single()),
    deleteTask: async t => {
      const paths = filesOf(t.id).filter(f => f.path).map(f => f.path);
      if (paths.length) await sb.storage.from('jira-files').remove(paths);
      chk(await sb.from('jira_tasks').delete().eq('id', t.id));
    },
    addComment: async row => chk(await sb.from('jira_comments').insert(row)),
    approve: async (task, mem, note) => chk(await sb.rpc('jira_approve', { p_task: task, p_member: mem, p_note: note })),
    timer: async (task, start) => chk(await sb.rpc('jira_timer', { p_task: task, p_start: start })),
    async upload(task, file, by) {
      const path = `${task}/${uuid()}-${safe(file.name)}`;
      chk(await sb.storage.from('jira-files').upload(path, file, { contentType: file.type || 'application/octet-stream' }));
      chk(await sb.from('jira_files').insert({ task_id: task, kind: 'file', name: file.name, path, mime: file.type || '', size: file.size, uploaded_by: by }));
    },
    addLink: async (task, name, url, by) => chk(await sb.from('jira_files').insert({ task_id: task, kind: 'link', name, url, uploaded_by: by })),
    async removeFile(f) { if (f.path) await sb.storage.from('jira-files').remove([f.path]); chk(await sb.from('jira_files').delete().eq('id', f.id)); },
    async signed(paths) {
      if (!paths.length) return {};
      const d = chk(await sb.storage.from('jira-files').createSignedUrls(paths, 3600));
      const o = {}; d.forEach(x => { if (x.signedUrl) o[x.path] = x.signedUrl; }); return o;
    },
    subscribe(cb) {
      const ch = sb.channel('jira-board');
      ['jira_tasks', 'jira_comments', 'jira_files', 'jira_members'].forEach(table => ch.on('postgres_changes', { event: '*', schema: 'public', table }, cb));
      ch.subscribe();
    },
  };
}

/* ---------------- data: memória (?demo) — mesmas regras do banco ---------------- */
function memApi() {
  const now = () => new Date().toISOString();
  const db = { members: ['Gabriel Talasso', 'Gustavo Lee', 'Gustavo Sabillon', 'Jeny Ventura'].map(name => ({ id: uuid(), name, created_at: now() })), tasks: [], comments: [], files: [] };
  let seq = 0; const blobs = {};
  const clone = o => JSON.parse(JSON.stringify(o));
  const guard = (old, nw) => {
    if (['review', 'done'].includes(nw.status) && (!old || old.status !== nw.status) && !dodOk(nw))
      throw new Error('Defina e conclua a definição de pronto antes de enviar para ' + (nw.status === 'done' ? 'Feito' : 'Revisão'));
    if (nw.status === 'done' && (!old || old.status !== 'review')) throw new Error('Uma tarefa só vai para Feito depois de aprovada na Revisão');
  };
  return {
    async loadAll() { return clone(db); },
    async addMember(name) { if (db.members.some(m => m.name === name)) throw new Error('Esse nome já existe'); const m = { id: uuid(), name, created_at: now() }; db.members.push(m); return m; },
    async createTask(row) { const t = Object.assign({ id: uuid(), number: ++seq, description: '', status: 'todo', priority: 'medium', reviewers: [], approvals: {}, time_spent_ms: 0, timer_started_at: null, dod: [], created_at: now(), done_at: null }, clone(row), { updated_at: now() }); guard(null, t); db.tasks.push(t); return clone(t); },
    async updateTask(id, patch) { const t = db.tasks.find(x => x.id === id); const nw = Object.assign({}, t, clone(patch), { updated_at: now() }); guard(t, nw); Object.assign(t, nw); return clone(t); },
    async deleteTask(t) { db.tasks = db.tasks.filter(x => x.id !== t.id); db.comments = db.comments.filter(c => c.task_id !== t.id); db.files = db.files.filter(f => f.task_id !== t.id); },
    async addComment(row) { db.comments.push(Object.assign({ id: uuid(), body: '', meta: {}, created_at: now() }, clone(row))); },
    async approve(task, mem, note) {
      const t = db.tasks.find(x => x.id === task);
      if (t.status !== 'review') throw new Error('A tarefa não está em revisão');
      if (!t.reviewers.includes(mem)) throw new Error('Você não é revisor desta tarefa');
      t.approvals[mem] = now();
      db.comments.push({ id: uuid(), task_id: task, author_id: mem, kind: 'approve', body: note || '', meta: {}, created_at: now() });
      if (t.reviewers.every(r => t.approvals[r])) { const nw = Object.assign({}, t, { status: 'done' }); guard(t, nw); t.status = 'done'; t.done_at = now(); }
      return clone(t);
    },
    async timer(task, start) {
      const t = db.tasks.find(x => x.id === task);
      if (start) { t.timer_started_at = t.timer_started_at || now(); if (['backlog', 'todo'].includes(t.status)) t.status = 'doing'; }
      else { if (t.timer_started_at) t.time_spent_ms += Date.now() - ts(t.timer_started_at); t.timer_started_at = null; }
      return clone(t);
    },
    async upload(task, file, by) { const path = `${task}/${uuid()}-${file.name}`; blobs[path] = URL.createObjectURL(file); db.files.push({ id: uuid(), task_id: task, kind: 'file', name: file.name, path, mime: file.type, size: file.size, uploaded_by: by, created_at: now() }); },
    async addLink(task, name, url, by) { db.files.push({ id: uuid(), task_id: task, kind: 'link', name, url, uploaded_by: by, created_at: now() }); },
    async removeFile(f) { db.files = db.files.filter(x => x.id !== f.id); },
    async signed(paths) { const o = {}; paths.forEach(p => { if (blobs[p]) o[p] = blobs[p]; }); return o; },
    subscribe() {},
  };
}

const api = DEMO || !window.supabase ? memApi() : supaApi();

/* ---------------- load & boot ---------------- */
let reloading = null, reloadAgain = false;
async function reload() {
  if (reloading) { reloadAgain = true; return reloading; }
  reloading = (async () => {
    do {
      reloadAgain = false;
      const d = await api.loadAll();
      S.members = d.members; S.tasks = d.tasks; S.comments = d.comments; S.files = d.files; S.loaded = true;
    } while (reloadAgain);
  })();
  try { await reloading; $('#banner').hidden = true; } finally { reloading = null; }
  route();
}
let rt; const soon = () => { clearTimeout(rt); rt = setTimeout(() => reload().catch(netFail), 250); };
function netFail(e) { console.error(e); const b = $('#banner'); b.textContent = 'Sem conexão com o servidor. O quadro tenta de novo sozinho.'; b.hidden = false; }

function route() {
  if (S.me && !member(S.me)) { S.me = null; store.set('jira.me', null); }
  $('#login').hidden = !!S.me; $('#app').hidden = !S.me;
  if (!S.me) renderLogin(); else renderApp();
}

async function boot() {
  applyTheme(store.get('jira.theme') || 'dark');
  S.me = store.get('jira.me');
  try { await reload(); } catch (e) { route(); netFail(e); }
  api.subscribe(soon);
  setInterval(() => reload().catch(netFail), 45000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) soon(); });
  setInterval(tick, 1000);
}
function tick() {
  $$('[data-tid]').forEach(el => { const t = S.tasks.find(x => x.id === el.dataset.tid); if (t && t.timer_started_at) el.textContent = dur(spent(t), el.dataset.long === '1'); });
}
function applyTheme(t) { document.documentElement.dataset.theme = t; $('meta[name=theme-color]').content = t === 'light' ? '#F8F6F1' : '#0F2420'; store.set('jira.theme', t); }

/* ---------------- login ---------------- */
function renderLogin() {
  const box = $('#people');
  box.innerHTML = S.members.map(m => `<button class="person" data-login="${esc(m.id)}">${av(m.id)}<span><b>${esc(m.name)}</b><small>Entrar</small></span></button>`).join('')
    + `<button class="person add" id="addPerson"><span class="plus">+</span><span><b>Não estou na lista</b><small>Adicionar meu nome</small></span></button>`;
  $$('[data-login]', box).forEach(b => b.onclick = () => login(b.dataset.login));
  $('#addPerson').onclick = () => { $('#addForm').hidden = false; $('#addName').focus(); };
  if (!S.loaded) box.innerHTML = '<div class="mut">Carregando a equipe…</div>';
}
$('#addForm').onsubmit = async e => {
  e.preventDefault();
  const name = $('#addName').value.trim().replace(/\s+/g, ' ');
  if (!name) return;
  const ex = S.members.find(m => m.name.toLowerCase() === name.toLowerCase());
  if (ex) { login(ex.id); return; }
  try { const m = await api.addMember(name); await reload(); login(m.id); } catch (err) { toast(errMsg(err)); }
};
function login(id) { S.me = id; store.set('jira.me', id); S.filter = 'all'; route(); toast(`Olá, ${first(id)}.`); }
function logout() { S.me = null; store.set('jira.me', null); closeDrawer(true); route(); }

/* ---------------- board ---------------- */
function visible(t) {
  if (S.filter === 'mine' && t.owner_id !== S.me) return false;
  if (S.filter === 'rev' && !toReview(t)) return false;
  if (S.filter === 'high' && t.priority !== 'high') return false;
  if (S.q) { const q = S.q.toLowerCase(); if (!(`${t.title} ${t.description} ${code(t)} ${nm(t.owner_id)}`.toLowerCase().includes(q))) return false; }
  return true;
}
function renderApp() {
  $('#meBtn').innerHTML = `${av(S.me)}<span>${esc(first(S.me))}</span>`;
  $('#today').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const week = Date.now() - 7 * 864e5;
  $('#stats').innerHTML = [
    [S.tasks.filter(t => t.status === 'doing').length, 'em andamento'],
    [S.tasks.filter(t => t.status === 'review').length, 'em revisão'],
    [S.tasks.filter(t => t.status === 'done' && ts(t.done_at) > week).length, 'feitas em 7 dias'],
  ].map(([n, l]) => `<div><b>${n}</b>${l}</div>`).join('');
  const nRev = S.tasks.filter(toReview).length;
  const tb = $('#toolbar');
  if (!tb.dataset.built) {
    tb.dataset.built = '1';
    tb.innerHTML = `<span id="chips" style="display:contents"></span><label class="search">${IC.search}<input id="q" type="search" placeholder="Buscar" aria-label="Buscar tarefas"></label>`;
    $('#q').oninput = e => { S.q = e.target.value.trim(); renderBoard(); };
  }
  $('#chips').innerHTML = [['all', 'Todas'], ['mine', 'Minhas'], ['rev', 'Para eu revisar'], ['high', 'Prioridade alta']]
    .map(([k, l]) => `<button class="chip ${S.filter === k ? 'on' : ''}" data-f="${k}">${l}${k === 'rev' && nRev ? `<span class="n">${nRev}</span>` : ''}</button>`).join('');
  renderBoard();
  if (S.openId) fillDrawer();
}
function renderBoard() {
  const by = {}; LANES.forEach(([k]) => by[k] = []);
  S.tasks.filter(visible).forEach(t => (by[t.status] || by.backlog).push(t));
  for (const k in by) by[k].sort((a, b) => (PRANK[a.priority] - PRANK[b.priority]) || (ts(b.updated_at) - ts(a.updated_at)));
  $('#tabs').innerHTML = LANES.map(([k, l]) => `<button class="tab ${S.lane === k ? 'on' : ''}" style="--lc:var(--l-${k})" data-lane="${k}">${l}<span>${by[k].length}</span></button>`).join('');
  $('#board').innerHTML = LANES.map(([k, l]) => `
    <section class="col ${S.lane === k ? 'on' : ''}" data-col="${k}" style="--lc:var(--l-${k})">
      <div class="colh"><i></i><span class="eb">${l}</span><span class="cnt">${by[k].length}</span>${['backlog', 'todo', 'doing'].includes(k) ? `<button class="add" data-new="${k}" title="Nova tarefa em ${l}">+</button>` : ''}</div>
      <div class="cards">${by[k].length ? by[k].map(card).join('') : `<div class="empty">${emptyMsg(k)}</div>`}</div>
    </section>`).join('');
}
function emptyMsg(k) {
  if (!S.tasks.length && (k === 'todo')) return 'Nenhuma tarefa ainda.<br>Comece com <b>+ Nova tarefa</b>.';
  if (S.filter === 'rev' && k === 'review') return 'Nada esperando sua revisão.';
  return { backlog: 'Ideias e pedidos', todo: 'Nada planejado', doing: 'Ninguém trabalhando', review: 'Nada em revisão', done: 'Nada concluído' }[k];
}
function card(t) {
  const fl = filesOf(t.id).length, cm = commentsOf(t.id).filter(c => c.kind === 'comment').length;
  const d = dod(t), dn = d.filter(i => i.done).length, ap = t.approvals || {};
  const run = !!t.timer_started_at, sp = spent(t);
  const rv = (t.status === 'review' || t.status === 'done') && (t.reviewers || []).length
    ? `<div class="rv">${t.reviewers.map(r => `<span class="rchip ${ap[r] ? 'ok' : ''}">${av(r, 'xs')}${esc(first(r))} ${ap[r] ? '✓' : '…'}</span>`).join('')}</div>` : '';
  return `<article class="card" data-id="${esc(t.id)}" draggable="${canMove(t) && t.status !== 'review' && t.status !== 'done'}">
    <div class="k"><span>${esc(code(t))}</span><span class="prio ${esc(t.priority)}">${PRI[t.priority] || ''}</span><span class="sp"></span>
      ${sp > 0 || run ? `<span class="tm ${run ? 'run' : ''}" data-tid="${esc(t.id)}">${dur(sp)}</span>` : ''}</div>
    <h3>${esc(t.title)}</h3>
    ${t.description ? `<p>${esc(t.description)}</p>` : ''}
    <div class="f">${av(t.owner_id, 'xs')}<span>${esc(t.owner_id ? first(t.owner_id) : 'Sem responsável')}</span><span class="sp"></span>
      ${d.length ? `<span class="meta" title="Definição de pronto" style="${dn === d.length ? 'color:var(--ok)' : ''}">${IC.check}${dn}/${d.length}</span>` : ''}
      ${fl ? `<span class="meta">${IC.clip}${fl}</span>` : ''}${cm ? `<span class="meta">${IC.msg}${cm}</span>` : ''}</div>${rv}</article>`;
}

/* ---------------- global events ---------------- */
document.addEventListener('click', e => {
  const f = e.target.closest('[data-f]'); if (f) { S.filter = f.dataset.f; if (S.filter === 'rev') S.lane = 'review'; renderApp(); return; }
  const tb = e.target.closest('.tab[data-lane]'); if (tb) { S.lane = tb.dataset.lane; renderBoard(); return; }
  const nw = e.target.closest('[data-new]'); if (nw) { openNew(nw.dataset.new); return; }
  const c = e.target.closest('.card[data-id]'); if (c) { openDrawer(c.dataset.id); return; }
  if (!e.target.closest('#menu') && !e.target.closest('#meBtn')) $('#menu').hidden = true;
});
$('#newTop').onclick = () => openNew();
$('#fab').onclick = () => openNew();
$('#themeBtn').onclick = () => applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
$('#meBtn').onclick = () => {
  const m = $('#menu');
  m.innerHTML = `<div style="padding:10px 12px 8px"><div class="eb" style="color:var(--mut2)">Conectado como</div><div class="serif" style="font-size:20px;margin-top:4px">${esc(nm(S.me))}</div></div><hr>
    <button id="mSwitch">Trocar de pessoa</button><button id="mTheme">Alternar tema claro/escuro</button>`;
  m.hidden = !m.hidden;
  $('#mSwitch').onclick = () => { m.hidden = true; logout(); };
  $('#mTheme').onclick = () => { m.hidden = true; $('#themeBtn').click(); };
};
$('#scrim').onclick = () => closeDrawer();
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('#modal').classList.contains('on')) closeModal(); else closeDrawer(); } });
$('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });

let dragId = null;
document.addEventListener('dragstart', e => { const c = e.target.closest && e.target.closest('.card'); if (!c) return; dragId = c.dataset.id; c.classList.add('dragging'); try { e.dataTransfer.setData('text/plain', dragId); } catch (_) {} });
document.addEventListener('dragend', () => { dragId = null; $$('.dragging,.drop').forEach(x => x.classList.remove('dragging', 'drop')); });
document.addEventListener('dragover', e => { const col = e.target.closest && e.target.closest('.col'); if (!col || !dragId) return; e.preventDefault(); $$('.col.drop').forEach(x => x !== col && x.classList.remove('drop')); col.classList.add('drop'); });
document.addEventListener('drop', e => { const col = e.target.closest && e.target.closest('.col'); if (!col || !dragId) return; e.preventDefault(); col.classList.remove('drop'); const t = S.tasks.find(x => x.id === dragId); if (t) moveTask(t, col.dataset.col); });

/* ---------------- rules ---------------- */
async function moveTask(t, to) {
  if (t.status === to) return;
  if (!canMove(t)) { toast(`Só ${first(t.owner_id)}, responsável pela tarefa, pode movê-la.`); return; }
  if (to === 'done') { toast('A tarefa só vai para Feito depois de aprovada na Revisão.'); return; }
  if (to === 'review') {
    if (!dodOk(t)) { toast(dod(t).length ? 'Marque todos os itens da definição de pronto antes da revisão.' : 'Escreva a definição de pronto antes de enviar para revisão.'); openDrawer(t.id); setTimeout(() => { const el = $('#dodSec'); el && el.scrollIntoView({ behavior: 'smooth', block: 'center' }); $('#dodNew') && $('#dodNew').focus(); }, 280); return; }
    openReviewChooser(t); return;
  }
  const ok = await act(async () => {
    if (t.timer_started_at && to !== 'doing') await api.timer(t.id, false);
    const patch = { status: to }; if (t.status === 'review') patch.approvals = {}; if (!t.owner_id) patch.owner_id = S.me;
    await api.updateTask(t.id, patch);
  }, t.status === 'review' ? 'Tarefa retirada da revisão' : null);
  if (ok) { S.lane = to; renderBoard(); }
}

/* ---------------- modal ---------------- */
function openModal(html) { $('#mbox').innerHTML = html; $('#modal').classList.add('on'); }
function closeModal() { $('#modal').classList.remove('on'); }
const memberOpts = sel => `<option value="">Sem responsável</option>` + S.members.map(m => `<option value="${esc(m.id)}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)}${m.id === S.me ? ' (você)' : ''}</option>`).join('');

function openNew(lane) {
  const start = ['backlog', 'todo', 'doing'].includes(lane) ? lane : (['backlog', 'todo', 'doing'].includes(S.lane) ? S.lane : 'todo');
  openModal(`<div class="eb">Nova tarefa</div><h2 style="margin-top:6px">O que precisa ser feito?</h2>
    <label class="lb" for="nTitle">Título</label><input class="in" id="nTitle" maxlength="200" placeholder="Ex.: Revisar proposta do cliente">
    <label class="lb" for="nDesc">Descrição</label><textarea class="in" id="nDesc" rows="3" placeholder="Contexto, links, detalhes"></textarea>
    <label class="lb" for="nDod">Definição de pronto</label><textarea class="in" id="nDod" rows="3" style="min-height:80px" placeholder="Um critério por linha. Ex.:&#10;Cliente aprovou o escopo&#10;Arquivo final anexado"></textarea>
    <div class="hint">Obrigatória para a tarefa ir para Revisão e Feito. Dá para completar depois.</div>
    <div class="grid2"><div><label class="lb" for="nLane">Raia</label><select class="sel" id="nLane">${['backlog', 'todo', 'doing'].map(k => `<option value="${k}" ${k === start ? 'selected' : ''}>${LN[k]}</option>`).join('')}</select></div>
      <div><label class="lb" for="nOwner">Responsável</label><select class="sel" id="nOwner">${memberOpts(S.me)}</select></div></div>
    <label class="lb">Prioridade</label><div class="segs" id="nPri">${['high', 'medium', 'low'].map(k => `<button type="button" class="${k} ${k === 'medium' ? 'on' : ''}" data-p="${k}">${PRI[k]}</button>`).join('')}</div>
    <label class="lb" for="nFiles">Anexos</label><input type="file" id="nFiles" multiple class="in" style="padding:8px">
    <div class="mfoot"><button class="btn ghost" id="nCancel">Cancelar</button><button class="btn pri" id="nGo">Criar tarefa</button></div>`);
  setTimeout(() => $('#nTitle').focus(), 50);
  $('#nPri').onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; $$('#nPri button').forEach(x => x.classList.toggle('on', x === b)); };
  $('#nCancel').onclick = closeModal;
  $('#nGo').onclick = async () => {
    const title = $('#nTitle').value.trim(); if (!title) { toast('Dê um título à tarefa.'); $('#nTitle').focus(); return; }
    const items = $('#nDod').value.split('\n').map(s => s.trim()).filter(Boolean).map(text => ({ id: uuid(), text, done: false }));
    const files = [...$('#nFiles').files];
    $('#nGo').disabled = true;
    try {
      const t = await api.createTask({ title, description: $('#nDesc').value.trim(), dod: items, status: $('#nLane').value, owner_id: $('#nOwner').value || null, priority: ($('#nPri .on') || {}).dataset.p || 'medium', created_by: S.me });
      for (const f of files) { try { await api.upload(t.id, f, S.me); } catch (e) { toast(`Não consegui enviar ${f.name}: ${errMsg(e)}`); } }
      closeModal(); S.lane = t.status; await reload(); toast(`${code(t)} criada`); openDrawer(t.id);
    } catch (e) { toast(errMsg(e)); $('#nGo').disabled = false; }
  };
}

function openReviewChooser(t) {
  const others = S.members.filter(m => m.id !== t.owner_id);
  openModal(`<div class="eb">Revisão · ${esc(code(t))}</div><h2 style="margin-top:6px">Quem valida?</h2>
    <p class="mut">A tarefa só vai para Feito quando todos os escolhidos aprovarem.</p>
    ${others.map(m => `<label class="chk"><input type="checkbox" value="${esc(m.id)}">${av(m.id)}<span>${esc(m.name)}</span></label>`).join('')}
    <label class="lb" for="rqNote">Recado (opcional)</label><textarea class="in" id="rqNote" rows="2" style="min-height:60px" placeholder="O que olhar com atenção?"></textarea>
    <div class="mfoot"><button class="btn ghost" id="rqCancel">Cancelar</button><button class="btn pri" id="rqGo">Enviar para revisão</button></div>`);
  $('#rqCancel').onclick = closeModal;
  $('#rqGo').onclick = async () => {
    const ids = $$('#mbox .chk input:checked').map(i => i.value);
    if (!ids.length) { toast('Escolha pelo menos uma pessoa.'); return; }
    const note = $('#rqNote').value.trim();
    $('#rqGo').disabled = true;
    const ok = await act(async () => {
      if (t.timer_started_at) await api.timer(t.id, false);
      await api.updateTask(t.id, { status: 'review', reviewers: ids, approvals: {} });
      await api.addComment({ task_id: t.id, author_id: S.me, kind: 'review', body: note, meta: { to: ids } });
    }, `Enviada para revisão de ${ids.map(first).join(' e ')}`);
    if (ok) { closeModal(); S.lane = 'review'; renderBoard(); } else $('#rqGo').disabled = false;
  };
}

/* ---------------- drawer ---------------- */
let base = null;
const dirty = () => { const a = $('#dTitle'), b = $('#dDesc'); return !!(a && b && base && (a.value !== base.title || b.value !== base.desc)); };
function openDrawer(id) {
  if (!S.tasks.find(t => t.id === id)) return;
  S.openId = id; base = null;
  const d = $('#drawer');
  d.innerHTML = `<div class="dr-head"><span class="lane-tag" id="dLane"></span><span class="mut2 sm" id="dCode" style="font-weight:700;letter-spacing:.06em"></span><span class="grow"></span><button class="icon-btn" id="dClose" aria-label="Fechar">${IC.close}</button></div>
  <div class="dr-body">
    <textarea class="ttl" id="dTitle" rows="1" maxlength="200"></textarea>
    <div class="lanes" id="dLanes" style="margin-top:12px"></div><div class="hint" id="dHint"></div>
    <dl class="props">
      <dt>Responsável</dt><dd><select class="sel" id="dOwner"></select></dd>
      <dt>Prioridade</dt><dd><div class="segs" id="dPri"></div></dd>
      <dt>Criada</dt><dd class="mut sm" id="dCreated"></dd>
    </dl>
    <div class="sec" id="dodSec"><div class="lb">${IC.check.replace('<svg', '<svg width="14" height="14"')}Definição de pronto <span id="dodProg" style="margin-left:auto;letter-spacing:.05em"></span></div>
      <div id="dodList"></div>
      <div class="linkrow" id="dodAdd"><input class="in" id="dodNew" maxlength="200" placeholder="Adicionar critério de pronto"><button class="btn sm" id="dodAddBtn">Adicionar</button></div>
      <div class="hint" id="dodHint"></div></div>
    <div class="sec"><div class="lb">Tempo dedicado</div><div class="timer"><span class="big" id="dTime" data-long="1"></span><button class="btn" id="dTimerBtn"></button></div><div class="hint" id="dTimeHint"></div></div>
    <div class="sec" id="dRev"></div>
    <div class="sec"><div class="lb">Descrição</div><textarea class="in" id="dDesc" rows="5" placeholder="Contexto, links, detalhes"></textarea>
      <div class="savebar" id="dSave" hidden><button class="btn pri sm" id="dSaveBtn">Salvar</button><button class="btn ghost sm" id="dDiscard">Descartar</button></div></div>
    <div class="sec"><div class="lb">Anexos</div><div id="dFiles"></div>
      <div class="upl"><label class="btn sm">+ Arquivo<input type="file" id="dFile" multiple hidden></label><button class="btn sm" id="dLinkBtn">+ Link</button></div>
      <div class="linkrow" id="dLinkRow" hidden><input class="in" id="dUrl" type="url" placeholder="https://… (Drive, Figma, Notion)"><button class="btn pri sm" id="dLinkAdd">Adicionar</button></div>
      <div class="hint" id="dUpMsg"></div></div>
    <div class="sec"><div class="lb">Atividade</div><div id="dComments"></div>
      <div class="cbox"><textarea class="in" id="dCText" rows="2" placeholder="Escreva um comentário"></textarea><button class="btn pri" id="dCSend">Enviar</button></div></div>
    <div class="dfoot" id="dFoot"></div>
  </div>`;
  $('#scrim').classList.add('on'); d.classList.add('on');
  const ti = $('#dTitle'), de = $('#dDesc');
  const fit = () => { ti.style.height = 'auto'; ti.style.height = ti.scrollHeight + 'px'; };
  const onEdit = () => { $('#dSave').hidden = !dirty(); fit(); };
  ti.oninput = onEdit; de.oninput = onEdit;
  ti.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); saveText(); } };
  $('#dClose').onclick = () => closeDrawer();
  $('#dSaveBtn').onclick = saveText;
  $('#dDiscard').onclick = () => { ti.value = base.title; de.value = base.desc; onEdit(); };
  $('#dOwner').onchange = e => act(() => api.updateTask(S.openId, { owner_id: e.target.value || null }));
  $('#dPri').onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; const t = cur(); if (t.priority !== b.dataset.p) act(() => api.updateTask(t.id, { priority: b.dataset.p })); };
  $('#dTimerBtn').onclick = toggleTimer;
  $('#dodAddBtn').onclick = addDod;
  $('#dodNew').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addDod(); } };
  $('#dFile').onchange = e => { const fs = [...e.target.files]; e.target.value = ''; upload(fs); };
  $('#dLinkBtn').onclick = () => { $('#dLinkRow').hidden = !$('#dLinkRow').hidden; if (!$('#dLinkRow').hidden) $('#dUrl').focus(); };
  $('#dLinkAdd').onclick = addLink;
  $('#dUrl').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } };
  $('#dCSend').onclick = sendComment;
  fillDrawer(); fit();
}
const cur = () => S.tasks.find(t => t.id === S.openId);
function closeDrawer(force) {
  if (!force && S.openId && dirty()) { toast('Há alterações não salvas. Salve ou descarte.'); return; }
  $('#drawer').classList.remove('on'); $('#scrim').classList.remove('on'); S.openId = null;
}
function fillDrawer() {
  const t = cur();
  if (!t) { closeDrawer(true); return; }
  const mov = canMove(t), locked = t.status === 'review' || t.status === 'done';
  const tag = $('#dLane'); tag.textContent = LN[t.status]; tag.style.setProperty('--lc', `var(--l-${t.status})`);
  $('#dCode').textContent = code(t);
  const ti = $('#dTitle'), de = $('#dDesc');
  if (!dirty() && document.activeElement !== ti && document.activeElement !== de) { ti.value = t.title; de.value = t.description || ''; base = { title: ti.value, desc: de.value }; ti.style.height = 'auto'; ti.style.height = ti.scrollHeight + 'px'; }
  // lanes
  $('#dLanes').innerHTML = LANES.map(([k, l]) => `<button class="${t.status === k ? 'on' : ''}" style="--lc:var(--l-${k})" data-mv="${k}" ${(!mov || k === 'done' || (t.status === 'done' && k === 'review')) && t.status !== k ? 'disabled' : ''}><i></i>${l}</button>`).join('');
  $$('#dLanes [data-mv]').forEach(b => b.onclick = () => moveTask(cur(), b.dataset.mv));
  $('#dHint').textContent = !mov ? `Só ${first(t.owner_id)}, responsável, move esta tarefa.`
    : t.status === 'review' ? 'Em revisão. Vai para Feito quando todos os revisores aprovarem.'
    : t.status === 'done' ? 'Concluída. Você pode reabrir movendo para outra raia.'
    : 'Para concluir: complete a definição de pronto e envie para Revisão.';
  const os = $('#dOwner'); os.innerHTML = memberOpts(t.owner_id); os.disabled = !mov || locked;
  $('#dPri').innerHTML = ['high', 'medium', 'low'].map(k => `<button type="button" class="${k} ${t.priority === k ? 'on' : ''}" data-p="${k}">${PRI[k]}</button>`).join('');
  $('#dCreated').textContent = `por ${first(t.created_by)} · ${ago(t.created_at)}`;
  // definition of done
  const items = dod(t), dn = items.filter(i => i.done).length;
  $('#dodProg').textContent = items.length ? `${dn} de ${items.length}` : '';
  $('#dodProg').style.color = items.length && dn === items.length ? 'var(--ok)' : '';
  $('#dodList').innerHTML = items.length ? items.map(i => `<label class="chk" style="margin-top:6px"><input type="checkbox" data-dod="${esc(i.id)}" ${i.done ? 'checked' : ''} ${locked ? 'disabled' : ''}><span style="flex:1;${i.done ? 'text-decoration:line-through;color:var(--mut2)' : ''}">${esc(i.text)}</span>${locked ? '' : `<button class="icon-btn" style="width:28px;height:28px" data-dodrm="${esc(i.id)}" aria-label="Remover critério">${IC.close}</button>`}</label>`).join('')
    : '<div class="empty" style="text-align:left;padding:14px">Sem definição de pronto. Escreva os critérios que dizem quando esta tarefa está concluída.</div>';
  $$('[data-dod]').forEach(c => c.onchange = () => setDod(dod(cur()).map(i => i.id === c.dataset.dod ? Object.assign({}, i, { done: c.checked }) : i)));
  $$('[data-dodrm]').forEach(b => b.onclick = e => { e.preventDefault(); setDod(dod(cur()).filter(i => i.id !== b.dataset.dodrm)); });
  $('#dodAdd').hidden = locked;
  $('#dodHint').textContent = locked ? (t.status === 'review' ? 'Travada durante a revisão. Retire da revisão para alterar.' : 'Critérios cumpridos e validados.') : '';
  // timer
  const run = !!t.timer_started_at, tEl = $('#dTime');
  tEl.dataset.tid = t.id; tEl.textContent = dur(spent(t), true); tEl.classList.toggle('run', run);
  const tb = $('#dTimerBtn'), open = ['backlog', 'todo', 'doing'].includes(t.status);
  tb.textContent = run ? 'Pausar' : (spent(t) ? 'Retomar' : 'Iniciar'); tb.className = 'btn ' + (run ? 'warn' : 'pri');
  tb.hidden = !(mov && (open || run));
  $('#dTimeHint').textContent = run ? `Contando desde ${new Date(ts(t.timer_started_at)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. Pausa sozinho ao sair de Fazendo.`
    : (mov && open ? 'Iniciar o cronômetro move a tarefa para Fazendo.' : '');
  // review
  const rv = $('#dRev'), keep = $('#rNote') ? $('#rNote').value : '', hadFocus = document.activeElement && document.activeElement.id === 'rNote';
  const revs = t.reviewers || [], ap = t.approvals || {};
  if ((t.status === 'review' || t.status === 'done') && revs.length) {
    const amRev = t.status === 'review' && revs.includes(S.me) && !ap[S.me];
    rv.innerHTML = `<div class="revbox ${t.status === 'done' ? 'done' : ''}"><h4>${t.status === 'done' ? 'Validada' : 'Aguardando validação'}</h4>
      ${revs.map(r => `<div class="revrow">${av(r)}<span>${esc(nm(r))}${r === S.me ? ' <span class="mut2">(você)</span>' : ''}</span><span class="st ${ap[r] ? 'ok' : 'pend'}">${ap[r] ? '✓ Aprovou · ' + ago(ap[r]) : 'Pendente'}</span></div>`).join('')}
      ${amRev ? `<textarea class="in" id="rNote" rows="2" style="min-height:60px;margin-top:10px" placeholder="Comentário (obrigatório para pedir ajustes)"></textarea>
        <div class="revact"><button class="btn ok" id="rOk">Aprovar</button><button class="btn warn" id="rNo">Pedir ajustes</button></div>` : ''}
      ${t.status === 'review' && t.owner_id === S.me ? `<div class="revact"><button class="btn ghost sm" id="rCancel">Retirar da revisão</button></div>` : ''}</div>`;
    if (amRev) { $('#rNote').value = keep; if (hadFocus) $('#rNote').focus(); $('#rOk').onclick = approve; $('#rNo').onclick = requestChanges; }
    if ($('#rCancel')) $('#rCancel').onclick = () => moveTask(cur(), 'doing');
  } else rv.innerHTML = '';
  // files
  const fl = filesOf(t.id);
  const need = fl.filter(f => f.path && !S.urls[f.path]).map(f => f.path);
  if (need.length) api.signed(need).then(o => { Object.assign(S.urls, o); if (S.openId === t.id) fillFiles(t); }).catch(() => {});
  fillFiles(t);
  // comments
  const kinds = { review: 'pediu revisão', approve: 'aprovou', changes: 'pediu ajustes' };
  const cms = commentsOf(t.id);
  $('#dComments').innerHTML = cms.length ? cms.map(c => `<div class="cm">${av(c.author_id)}<div class="b"><div class="h"><b>${esc(first(c.author_id))}</b>${kinds[c.kind] ? `<span class="kind ${c.kind}">${kinds[c.kind]}${c.kind === 'review' && c.meta && c.meta.to ? ' · ' + esc(c.meta.to.map(first).join(', ')) : ''}</span>` : ''} · ${ago(c.created_at)}</div>${c.body ? `<div class="t">${esc(c.body)}</div>` : ''}</div></div>`).join('')
    : '<div class="mut2 sm">Sem comentários.</div>';
  // footer
  const ft = $('#dFoot');
  if (!ft.dataset.confirm) {
    ft.innerHTML = `<span class="mut2 sm" style="flex:1">Atualizada ${ago(t.updated_at)}</span>` + ((t.owner_id === S.me || t.created_by === S.me || !t.owner_id) ? `<button class="btn warn sm" id="dDel">Excluir</button>` : '');
    if ($('#dDel')) $('#dDel').onclick = () => {
      ft.dataset.confirm = '1';
      ft.innerHTML = `<span style="flex:1;font-weight:600">Excluir ${esc(code(t))} de vez?</span><button class="btn ghost sm" id="dDelNo">Cancelar</button><button class="btn warn sm" id="dDelYes">Excluir</button>`;
      $('#dDelNo').onclick = () => { delete ft.dataset.confirm; fillDrawer(); };
      $('#dDelYes').onclick = async () => { base = null; const tt = cur(); closeDrawer(true); await act(() => api.deleteTask(tt), `${code(tt)} excluída`); };
    };
  }
}
function fillFiles(t) {
  const fl = filesOf(t.id);
  $('#dFiles').innerHTML = fl.length ? fl.map(f => {
    const href = f.kind === 'link' ? f.url : (S.urls[f.path] || '');
    const img = f.kind === 'file' && /^image\//.test(f.mime || '') && href;
    const ext = f.kind === 'link' ? 'link' : (String(f.name).split('.').pop() || 'arq').slice(0, 4);
    return `<div class="file">${img ? `<img class="th" src="${esc(href)}" alt="">` : `<span class="th">${esc(ext)}</span>`}
      <div class="fn">${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(f.name)}</a>` : `<span style="font-weight:600">${esc(f.name)}</span>`}
      <div class="mut2 sm">${f.kind === 'link' ? 'Link' : esc(size(f.size))} · ${esc(first(f.uploaded_by))} · ${ago(f.created_at)}</div></div>
      <button class="icon-btn" style="width:30px;height:30px" data-rmf="${esc(f.id)}" aria-label="Remover anexo">${IC.close}</button></div>`;
  }).join('') : '<div class="mut2 sm" style="margin-bottom:10px">Nenhum anexo.</div>';
  $$('[data-rmf]').forEach(b => b.onclick = () => { const f = S.files.find(x => x.id === b.dataset.rmf); if (f) act(() => api.removeFile(f), 'Anexo removido'); });
}
async function saveText() {
  const t = cur(); if (!t) return;
  const title = $('#dTitle').value.trim(); if (!title) { toast('O título não pode ficar vazio.'); return; }
  const description = $('#dDesc').value;
  if (await act(() => api.updateTask(t.id, { title, description }), 'Salvo')) { base = { title: $('#dTitle').value, desc: description }; $('#dSave').hidden = true; }
}
function setDod(items) { const t = cur(); if (t) return act(() => api.updateTask(t.id, { dod: items })); }
async function addDod() {
  const v = $('#dodNew').value.trim(); if (!v) return;
  if (await setDod([...dod(cur()), { id: uuid(), text: v, done: false }])) { $('#dodNew').value = ''; $('#dodNew').focus(); }
}
async function toggleTimer() {
  const t = cur(); if (!t || !canMove(t)) return;
  const start = !t.timer_started_at;
  const ok = await act(() => api.timer(t.id, start), start ? 'Cronômetro iniciado' : 'Cronômetro pausado');
  if (ok && start) { S.lane = 'doing'; renderBoard(); }
}
async function upload(files) {
  const t = cur(); if (!t) return;
  for (const f of files) {
    if (f.size > 50 * 1024 * 1024) { toast(`${f.name} passa de 50 MB.`); continue; }
    $('#dUpMsg').textContent = `Enviando ${f.name}…`;
    await act(() => api.upload(t.id, f, S.me));
  }
  $('#dUpMsg').textContent = '';
}
async function addLink() {
  let u = $('#dUrl').value.trim(); if (!u) return;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  let name; try { const x = new URL(u); name = x.hostname.replace(/^www\./, '') + (x.pathname.length > 1 ? x.pathname.slice(0, 48) : ''); } catch (_) { toast('Link inválido.'); return; }
  if (await act(() => api.addLink(S.openId, name, u, S.me), 'Link adicionado')) { $('#dUrl').value = ''; $('#dLinkRow').hidden = true; }
}
async function sendComment() {
  const el = $('#dCText'), body = el.value.trim(); if (!body) return;
  if (await act(() => api.addComment({ task_id: S.openId, author_id: S.me, kind: 'comment', body }))) el.value = '';
}
async function approve() {
  const t = cur(); const note = ($('#rNote') && $('#rNote').value.trim()) || '';
  await act(async () => {
    const r = await api.approve(t.id, S.me, note);
    const row = Array.isArray(r) ? r[0] : r;
    setTimeout(() => toast(row && row.status === 'done' ? 'Aprovada por todos. Movida para Feito.' : 'Aprovação registrada.'), 50);
  });
}
async function requestChanges() {
  const t = cur(); const note = ($('#rNote') && $('#rNote').value.trim()) || '';
  if (!note) { toast('Escreva o que precisa ser ajustado.'); $('#rNote').focus(); return; }
  await act(async () => {
    await api.updateTask(t.id, { status: 'doing', approvals: {} });
    await api.addComment({ task_id: t.id, author_id: S.me, kind: 'changes', body: note });
  }, 'Ajustes pedidos. A tarefa voltou para Fazendo.');
}

boot();
