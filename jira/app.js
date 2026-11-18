/* Meridiano · Board — lightweight team kanban (EN · ES · PT).
   Data in Supabase (jira_* tables, private jira-files bucket). ?demo runs with in-memory data. */
'use strict';
const CFG = { url: 'https://oqokqkrczmdnhfwiwwdv.supabase.co', key: 'sb_publishable_JNIa1DnBITfMvGDDAkYBaA_7A22onL6' };
const DEMO = new URLSearchParams(location.search).has('demo');
const PRANK = { high: 0, medium: 1, low: 2 };
const COLORS = ['#C9A94E', '#8DB4D6', '#7FC8A2', '#C7A2E0', '#F0A38A', '#9FC3B8'];
const IC = {
  clip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 11.5l-8.6 8.6a5 5 0 01-7.1-7.1l8.6-8.6a3.3 3.3 0 014.7 4.7l-8.6 8.6a1.7 1.7 0 01-2.4-2.4l7.9-7.9"/></svg>',
  msg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 12.3l2.7 2.7L16 9.6"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 004 0"/></svg>',
  wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.2A9.7 9.7 0 003.6 16.8L2.3 21.7l5-1.3A9.7 9.7 0 1012 2.2zm0 17.7a8 8 0 01-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1112 19.9zm4.4-6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8 1c-.1.2-.3.2-.5.1a6.6 6.6 0 01-3.3-2.9c-.2-.4.3-.4.8-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 00-.7.3 2.8 2.8 0 00-.9 2.1 4.9 4.9 0 001 2.6 11.2 11.2 0 004.3 3.8c1.6.7 2.2.7 3 .6a2.6 2.6 0 001.7-1.2 2.1 2.1 0 00.1-1.2c0-.1-.2-.2-.4-.3z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
};

/* ---------------- state & helpers ---------------- */
const S = { members: [], tasks: [], comments: [], files: [], me: null, filter: 'all', q: '', lane: 'todo', openId: null, loaded: false, urls: {} };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function hlMentions(body) {
  let h = esc(body);
  [...S.members].sort((a, b) => b.name.length - a.name.length).forEach(m => {
    const re = new RegExp('@' + esc(m.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    h = h.replace(re, x => `<b class="mention">${x}</b>`);
  });
  return h;
}
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Math.random().toString(16).slice(2) + Date.now().toString(16));
const ts = v => (v ? Date.parse(v) : 0);
const store = { get(k) { try { return localStorage.getItem(k) } catch (_) { return null } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch (_) {} } };
const member = id => S.members.find(m => m.id === id);
const nm = id => (member(id) || {}).name || T().noOwner;
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
/* ---------------- i18n (EN · ES · PT) ---------------- */
const I18N = {
  en: {
    locale: 'en-US', lanes: { backlog: 'Backlog', todo: 'To do', doing: 'Doing', review: 'Review', done: 'Done' },
    pri: { high: 'High', medium: 'Medium', low: 'Low' }, noOwner: 'Unassigned', you: 'you', now: 'now',
    genericErr: 'Something went wrong. Please try again.', offline: 'No connection to the server. The board will retry on its own.',
    loginEb: 'Team', loginH: 'Who’s working<br>today?', loginLead: 'Pick your name to sign in. The board remembers you on this device.',
    enter: 'Sign in', notListed: 'I’m not on the list', addMyName: 'Add my name', yourName: 'Your full name', loadingTeam: 'Loading the team…',
    hello: n => `Hi, ${n}.`, title: 'Team tasks', newTask: '+ New task', search: 'Search', searchAria: 'Search tasks',
    statDoing: 'in progress', statReview: 'in review', statDone: 'done in 7 days',
    fAll: 'All', fMine: 'Mine', fRev: 'For me to review', fHigh: 'High priority',
    newIn: l => `New task in ${l}`, emptyFirst: 'No tasks yet.<br>Start with <b>+ New task</b>.', emptyRev: 'Nothing waiting for your review.',
    empty: { backlog: 'Ideas and requests', todo: 'Nothing planned', doing: 'No one working', review: 'Nothing in review', done: 'Nothing finished' },
    dodShort: 'Definition of done', signedAs: 'Signed in as', switchPerson: 'Switch person', toggleTheme: 'Toggle light/dark theme', lang: 'Language',
    onlyOwnerMoves: n => `Only ${n}, the task owner, can move it.`,
    reviewToDone: 'In review, the task goes to Done when everyone approves. To finish without review, take it out of review first.',
    dodMissing: to => `Write the definition of done before ${to === 'done' ? 'finishing' : 'sending to review'}.`,
    dodOpen: to => `Check every item of the definition of done before ${to === 'done' ? 'finishing' : 'sending to review'}.`,
    finished: c => `${c} done`, outOfReview: 'Task taken out of review',
    nNewEb: 'New task', nNewH: 'What needs to be done?', fTitle: 'Title', fTitlePh: 'E.g. Review the client proposal', fDesc: 'Description', fDescPh: 'Context, links, details',
    fDod: 'Definition of done', fDodPh: 'One criterion per line. E.g.:&#10;Client approved the scope&#10;Final file attached', fDodHint: 'Only required when moving to Review or Done. You can write it later.',
    fLane: 'Lane', fOwner: 'Owner', fPri: 'Priority', fFiles: 'Attachments', cancel: 'Cancel', create: 'Create task', needTitle: 'Give the task a title.',
    uploadFail: (n, e) => `Couldn’t upload ${n}: ${e}`, created: c => `${c} created`,
    revEb: c => `Review · ${c}`, revH: 'Who validates?', revLead: 'The task goes to Done only when everyone selected approves.', revNote: 'Note (optional)', revNotePh: 'What should they look at?',
    sendReview: 'Send to review', pickOne: 'Choose at least one person.', sentReview: ns => `Sent for review to ${ns}`, and: ' and ',
    owner: 'Owner', priority: 'Priority', createdL: 'Created', by: (n, a) => `by ${n} · ${a}`,
    dodAddPh: 'Add a done criterion', add: 'Add', timeSpent: 'Time spent', descL: 'Description', save: 'Save', discard: 'Discard',
    attachments: 'Attachments', addFile: '+ File', addLink: '+ Link', linkPh: 'https://… (Drive, Figma, Notion)', activity: 'Activity', commentPh: 'Write a comment', send: 'Send', close: 'Close',
    unsaved: 'You have unsaved changes. Save or discard them.',
    hintNotOwner: n => `Only ${n}, the owner, moves this task.`, hintReview: 'In review. Goes to Done when all reviewers approve.',
    hintDone: 'Done. You can reopen it by moving it to another lane.', hintOpen: 'With the definition of done complete: send to Review or, if no validation is needed, move straight to Done.',
    dodOf: (a, b) => `${a} of ${b}`, removeCrit: 'Remove criterion', dodEmpty: 'No definition of done yet. Write the criteria that say when this task is finished.',
    dodLockedReview: 'Locked during review. Take it out of review to change it.', dodLockedDone: 'Criteria met.',
    pause: 'Pause', resume: 'Resume', start: 'Start', countingSince: tm => `Running since ${tm}. Pauses on its own when the task leaves Doing.`, timerHint: 'Starting the timer moves the task to Doing.',
    validated: 'Validated', awaiting: 'Waiting for validation', approved: a => `✓ Approved · ${a}`, pending: 'Pending',
    rNotePh: 'Comment (required to request changes)', approve: 'Approve', requestChanges: 'Request changes', takeOut: 'Take out of review',
    kinds: { review: 'requested review', approve: 'approved', changes: 'requested changes', assign: 'reassigned' }, noComments: 'No comments yet.',
    updated: a => `Updated ${a}`, del: 'Delete', delConfirm: c => `Delete ${c} for good?`, deleted: c => `${c} deleted`,
    link: 'Link', removeAtt: 'Remove attachment', noAtt: 'No attachments.', attRemoved: 'Attachment removed',
    titleEmpty: 'The title can’t be empty.', saved: 'Saved', timerStarted: 'Timer started', timerPaused: 'Timer paused',
    tooBig: n => `${n} is larger than 50 MB.`, uploading: n => `Uploading ${n}…`, badLink: 'Invalid link.', linkAdded: 'Link added',
    allApproved: 'Approved by everyone. Moved to Done.', approvalSaved: 'Approval recorded.', writeChanges: 'Write what needs to change.', changesAsked: 'Changes requested. The task went back to Doing.',
    shareNew: (c, p, ti, by, ow, l) => `🆕 *New task ${c}*${p ? ' · ' + p + ' priority' : ''}\n${ti}\nCreated by ${by} · owner: ${ow}\n${l}`,
    shareReview: (c, ti, rv, by, l) => `🔍 *${c} is waiting for review*\n${ti}\nReviewers: ${rv} · sent by ${by}\n${l}`,
    shareChanges: (c, ti, by, note, l) => `↩️ *Changes requested on ${c}*\n${ti}\n${by}: ${note}\n${l}`,
    shareDone: (c, ti, ow, rv, l) => `✅ *${c} done*\n${ti}\nOwner: ${ow}${rv ? ' · approved by ' + rv : ' · no review'}\n${l}`,
    shareQ: { new: 'Tell the team about the new task?', review: 'Let the reviewers know in the group?', changes: 'Let the owner know in the group?', done: 'Tell the group it’s done?' },
    shareBtn: 'Notify the group', copy: 'Copy', copied: 'Message copied.', copyFail: 'Couldn’t copy.',
    news: 'What’s new', nothingNew: 'Nothing new here.',
    evCreated: (c, forYou) => `created ${c}${forYou ? ' for you' : ''}`, evReview: c => `asked for your review on ${c}`, evChanges: c => `requested changes on ${c}`,
    evApprove: c => `approved ${c}`, evComment: c => `commented on ${c}`, evMention: c => `mentioned you on ${c}`, evAssign: c => `assigned ${c} to you`,
    evFile: c => `attached a file to ${c}`, evDone: c => `finished ${c}`, assignedTo: n => `assigned to ${n}`,
    notifOn: 'Device notifications on', notifEnable: 'Turn on device notifications', notifBlocked: 'Notifications are blocked in this browser’s settings.',
    notifHint: 'Shown while the board is open, even in the background.', mentionHint: 'Type @ to mention someone — they’ll be notified.', notifTitle: 'Meridiano · Board',
    err: { dod: 'Complete the definition of done first.', reviewAll: 'In review, the task only goes to Done when all reviewers approve.', notInReview: 'The task is not in review.', notReviewer: 'You are not a reviewer of this task.', exists: 'That name already exists.' },
  },
  es: {
    locale: 'es', lanes: { backlog: 'Backlog', todo: 'Por hacer', doing: 'En curso', review: 'Revisión', done: 'Hecho' },
    pri: { high: 'Alta', medium: 'Media', low: 'Baja' }, noOwner: 'Sin responsable', you: 'tú', now: 'ahora',
    genericErr: 'Algo salió mal. Inténtalo de nuevo.', offline: 'Sin conexión con el servidor. El tablero lo intentará de nuevo solo.',
    loginEb: 'Equipo', loginH: '¿Quién trabaja<br>hoy?', loginLead: 'Elige tu nombre para entrar. El tablero te recuerda en este dispositivo.',
    enter: 'Entrar', notListed: 'No estoy en la lista', addMyName: 'Agregar mi nombre', yourName: 'Tu nombre completo', loadingTeam: 'Cargando el equipo…',
    hello: n => `Hola, ${n}.`, title: 'Tareas del equipo', newTask: '+ Nueva tarea', search: 'Buscar', searchAria: 'Buscar tareas',
    statDoing: 'en curso', statReview: 'en revisión', statDone: 'hechas en 7 días',
    fAll: 'Todas', fMine: 'Mías', fRev: 'Para revisar', fHigh: 'Prioridad alta',
    newIn: l => `Nueva tarea en ${l}`, emptyFirst: 'Aún no hay tareas.<br>Empieza con <b>+ Nueva tarea</b>.', emptyRev: 'Nada esperando tu revisión.',
    empty: { backlog: 'Ideas y pedidos', todo: 'Nada planificado', doing: 'Nadie trabajando', review: 'Nada en revisión', done: 'Nada terminado' },
    dodShort: 'Definición de terminado', signedAs: 'Conectado como', switchPerson: 'Cambiar de persona', toggleTheme: 'Cambiar tema claro/oscuro', lang: 'Idioma',
    onlyOwnerMoves: n => `Solo ${n}, responsable de la tarea, puede moverla.`,
    reviewToDone: 'En revisión, la tarea pasa a Hecho cuando todos aprueban. Para terminar sin revisión, sácala de revisión primero.',
    dodMissing: to => `Escribe la definición de terminado antes de ${to === 'done' ? 'terminar' : 'enviar a revisión'}.`,
    dodOpen: to => `Marca todos los ítems de la definición de terminado antes de ${to === 'done' ? 'terminar' : 'enviar a revisión'}.`,
    finished: c => `${c} terminada`, outOfReview: 'Tarea retirada de revisión',
    nNewEb: 'Nueva tarea', nNewH: '¿Qué hay que hacer?', fTitle: 'Título', fTitlePh: 'Ej.: Revisar la propuesta del cliente', fDesc: 'Descripción', fDescPh: 'Contexto, enlaces, detalles',
    fDod: 'Definición de terminado', fDodPh: 'Un criterio por línea. Ej.:&#10;El cliente aprobó el alcance&#10;Archivo final adjunto', fDodHint: 'Solo se exige al mover a Revisión o Hecho. Puedes escribirla después.',
    fLane: 'Columna', fOwner: 'Responsable', fPri: 'Prioridad', fFiles: 'Adjuntos', cancel: 'Cancelar', create: 'Crear tarea', needTitle: 'Ponle un título a la tarea.',
    uploadFail: (n, e) => `No pude subir ${n}: ${e}`, created: c => `${c} creada`,
    revEb: c => `Revisión · ${c}`, revH: '¿Quién valida?', revLead: 'La tarea pasa a Hecho solo cuando todos los elegidos aprueban.', revNote: 'Nota (opcional)', revNotePh: '¿Qué deben mirar con atención?',
    sendReview: 'Enviar a revisión', pickOne: 'Elige al menos una persona.', sentReview: ns => `Enviada a revisión de ${ns}`, and: ' y ',
    owner: 'Responsable', priority: 'Prioridad', createdL: 'Creada', by: (n, a) => `por ${n} · ${a}`,
    dodAddPh: 'Agregar criterio de terminado', add: 'Agregar', timeSpent: 'Tiempo dedicado', descL: 'Descripción', save: 'Guardar', discard: 'Descartar',
    attachments: 'Adjuntos', addFile: '+ Archivo', addLink: '+ Enlace', linkPh: 'https://… (Drive, Figma, Notion)', activity: 'Actividad', commentPh: 'Escribe un comentario', send: 'Enviar', close: 'Cerrar',
    unsaved: 'Tienes cambios sin guardar. Guarda o descarta.',
    hintNotOwner: n => `Solo ${n}, responsable, mueve esta tarea.`, hintReview: 'En revisión. Pasa a Hecho cuando todos los revisores aprueban.',
    hintDone: 'Terminada. Puedes reabrirla moviéndola a otra columna.', hintOpen: 'Con la definición de terminado completa: envía a Revisión o, si no necesita validación, mueve directo a Hecho.',
    dodOf: (a, b) => `${a} de ${b}`, removeCrit: 'Quitar criterio', dodEmpty: 'Sin definición de terminado. Escribe los criterios que indican cuándo la tarea está terminada.',
    dodLockedReview: 'Bloqueada durante la revisión. Sácala de revisión para cambiarla.', dodLockedDone: 'Criterios cumplidos.',
    pause: 'Pausar', resume: 'Reanudar', start: 'Iniciar', countingSince: tm => `Contando desde las ${tm}. Se pausa solo al salir de En curso.`, timerHint: 'Iniciar el cronómetro mueve la tarea a En curso.',
    validated: 'Validada', awaiting: 'Esperando validación', approved: a => `✓ Aprobó · ${a}`, pending: 'Pendiente',
    rNotePh: 'Comentario (obligatorio para pedir cambios)', approve: 'Aprobar', requestChanges: 'Pedir cambios', takeOut: 'Sacar de revisión',
    kinds: { review: 'pidió revisión', approve: 'aprobó', changes: 'pidió cambios', assign: 'reasignó' }, noComments: 'Sin comentarios.',
    updated: a => `Actualizada ${a}`, del: 'Eliminar', delConfirm: c => `¿Eliminar ${c} definitivamente?`, deleted: c => `${c} eliminada`,
    link: 'Enlace', removeAtt: 'Quitar adjunto', noAtt: 'Sin adjuntos.', attRemoved: 'Adjunto quitado',
    titleEmpty: 'El título no puede quedar vacío.', saved: 'Guardado', timerStarted: 'Cronómetro iniciado', timerPaused: 'Cronómetro pausado',
    tooBig: n => `${n} supera los 50 MB.`, uploading: n => `Subiendo ${n}…`, badLink: 'Enlace inválido.', linkAdded: 'Enlace agregado',
    allApproved: 'Aprobada por todos. Pasó a Hecho.', approvalSaved: 'Aprobación registrada.', writeChanges: 'Escribe qué hay que cambiar.', changesAsked: 'Cambios pedidos. La tarea volvió a En curso.',
    shareNew: (c, p, ti, by, ow, l) => `🆕 *Nueva tarea ${c}*${p ? ' · prioridad ' + p.toLowerCase() : ''}\n${ti}\nCreada por ${by} · responsable: ${ow}\n${l}`,
    shareReview: (c, ti, rv, by, l) => `🔍 *${c} espera revisión*\n${ti}\nRevisores: ${rv} · enviada por ${by}\n${l}`,
    shareChanges: (c, ti, by, note, l) => `↩️ *Cambios pedidos en ${c}*\n${ti}\n${by}: ${note}\n${l}`,
    shareDone: (c, ti, ow, rv, l) => `✅ *${c} terminada*\n${ti}\nResponsable: ${ow}${rv ? ' · aprobada por ' + rv : ' · sin revisión'}\n${l}`,
    shareQ: { new: '¿Avisar al equipo de la nueva tarea?', review: '¿Avisar a los revisores en el grupo?', changes: '¿Avisar al responsable en el grupo?', done: '¿Contar en el grupo que está terminada?' },
    shareBtn: 'Avisar al grupo', copy: 'Copiar', copied: 'Mensaje copiado.', copyFail: 'No pude copiar.',
    news: 'Novedades', nothingNew: 'Nada nuevo por aquí.',
    evCreated: (c, forYou) => `creó ${c}${forYou ? ' para ti' : ''}`, evReview: c => `pidió tu revisión en ${c}`, evChanges: c => `pidió cambios en ${c}`,
    evApprove: c => `aprobó ${c}`, evComment: c => `comentó en ${c}`, evMention: c => `te mencionó en ${c}`, evAssign: c => `te asignó ${c}`,
    evFile: c => `adjuntó un archivo en ${c}`, evDone: c => `terminó ${c}`, assignedTo: n => `asignó a ${n}`,
    notifOn: 'Notificaciones del dispositivo activadas', notifEnable: 'Activar notificaciones del dispositivo', notifBlocked: 'Las notificaciones están bloqueadas en la configuración del navegador.',
    notifHint: 'Aparecen mientras el tablero está abierto, incluso en segundo plano.', mentionHint: 'Escribe @ para mencionar a alguien: recibirá un aviso.', notifTitle: 'Meridiano · Tablero',
    err: { dod: 'Completa primero la definición de terminado.', reviewAll: 'En revisión, la tarea solo pasa a Hecho cuando todos los revisores aprueban.', notInReview: 'La tarea no está en revisión.', notReviewer: 'No eres revisor de esta tarea.', exists: 'Ese nombre ya existe.' },
  },
  pt: {
    locale: 'pt-BR', lanes: { backlog: 'Backlog', todo: 'A fazer', doing: 'Fazendo', review: 'Revisão', done: 'Feito' },
    pri: { high: 'Alta', medium: 'Média', low: 'Baixa' }, noOwner: 'Sem responsável', you: 'você', now: 'agora',
    genericErr: 'Algo deu errado. Tente de novo.', offline: 'Sem conexão com o servidor. O quadro tenta de novo sozinho.',
    loginEb: 'Equipe', loginH: 'Quem está<br>trabalhando hoje?', loginLead: 'Escolha seu nome para entrar. O quadro lembra de você neste aparelho.',
    enter: 'Entrar', notListed: 'Não estou na lista', addMyName: 'Adicionar meu nome', yourName: 'Seu nome completo', loadingTeam: 'Carregando a equipe…',
    hello: n => `Olá, ${n}.`, title: 'Tarefas da equipe', newTask: '+ Nova tarefa', search: 'Buscar', searchAria: 'Buscar tarefas',
    statDoing: 'em andamento', statReview: 'em revisão', statDone: 'feitas em 7 dias',
    fAll: 'Todas', fMine: 'Minhas', fRev: 'Para eu revisar', fHigh: 'Prioridade alta',
    newIn: l => `Nova tarefa em ${l}`, emptyFirst: 'Nenhuma tarefa ainda.<br>Comece com <b>+ Nova tarefa</b>.', emptyRev: 'Nada esperando sua revisão.',
    empty: { backlog: 'Ideias e pedidos', todo: 'Nada planejado', doing: 'Ninguém trabalhando', review: 'Nada em revisão', done: 'Nada concluído' },
    dodShort: 'Definição de pronto', signedAs: 'Conectado como', switchPerson: 'Trocar de pessoa', toggleTheme: 'Alternar tema claro/escuro', lang: 'Idioma',
    onlyOwnerMoves: n => `Só ${n}, responsável pela tarefa, pode movê-la.`,
    reviewToDone: 'Em revisão, a tarefa vai para Feito quando todos aprovarem. Para concluir sem revisão, retire da revisão antes.',
    dodMissing: to => `Escreva a definição de pronto antes de ${to === 'done' ? 'concluir' : 'enviar para revisão'}.`,
    dodOpen: to => `Marque todos os itens da definição de pronto antes de ${to === 'done' ? 'concluir' : 'enviar para revisão'}.`,
    finished: c => `${c} concluída`, outOfReview: 'Tarefa retirada da revisão',
    nNewEb: 'Nova tarefa', nNewH: 'O que precisa ser feito?', fTitle: 'Título', fTitlePh: 'Ex.: Revisar proposta do cliente', fDesc: 'Descrição', fDescPh: 'Contexto, links, detalhes',
    fDod: 'Definição de pronto', fDodPh: 'Um critério por linha. Ex.:&#10;Cliente aprovou o escopo&#10;Arquivo final anexado', fDodHint: 'Só é cobrada ao mover para Revisão ou Feito. Dá para escrever depois.',
    fLane: 'Raia', fOwner: 'Responsável', fPri: 'Prioridade', fFiles: 'Anexos', cancel: 'Cancelar', create: 'Criar tarefa', needTitle: 'Dê um título à tarefa.',
    uploadFail: (n, e) => `Não consegui enviar ${n}: ${e}`, created: c => `${c} criada`,
    revEb: c => `Revisão · ${c}`, revH: 'Quem valida?', revLead: 'A tarefa só vai para Feito quando todos os escolhidos aprovarem.', revNote: 'Recado (opcional)', revNotePh: 'O que olhar com atenção?',
    sendReview: 'Enviar para revisão', pickOne: 'Escolha pelo menos uma pessoa.', sentReview: ns => `Enviada para revisão de ${ns}`, and: ' e ',
    owner: 'Responsável', priority: 'Prioridade', createdL: 'Criada', by: (n, a) => `por ${n} · ${a}`,
    dodAddPh: 'Adicionar critério de pronto', add: 'Adicionar', timeSpent: 'Tempo dedicado', descL: 'Descrição', save: 'Salvar', discard: 'Descartar',
    attachments: 'Anexos', addFile: '+ Arquivo', addLink: '+ Link', linkPh: 'https://… (Drive, Figma, Notion)', activity: 'Atividade', commentPh: 'Escreva um comentário', send: 'Enviar', close: 'Fechar',
    unsaved: 'Há alterações não salvas. Salve ou descarte.',
    hintNotOwner: n => `Só ${n}, responsável, move esta tarefa.`, hintReview: 'Em revisão. Vai para Feito quando todos os revisores aprovarem.',
    hintDone: 'Concluída. Você pode reabrir movendo para outra raia.', hintOpen: 'Com a definição de pronto completa: envie para Revisão ou, se não precisar de validação, mova direto para Feito.',
    dodOf: (a, b) => `${a} de ${b}`, removeCrit: 'Remover critério', dodEmpty: 'Sem definição de pronto. Escreva os critérios que dizem quando esta tarefa está concluída.',
    dodLockedReview: 'Travada durante a revisão. Retire da revisão para alterar.', dodLockedDone: 'Critérios cumpridos.',
    pause: 'Pausar', resume: 'Retomar', start: 'Iniciar', countingSince: tm => `Contando desde ${tm}. Pausa sozinho ao sair de Fazendo.`, timerHint: 'Iniciar o cronômetro move a tarefa para Fazendo.',
    validated: 'Validada', awaiting: 'Aguardando validação', approved: a => `✓ Aprovou · ${a}`, pending: 'Pendente',
    rNotePh: 'Comentário (obrigatório para pedir ajustes)', approve: 'Aprovar', requestChanges: 'Pedir ajustes', takeOut: 'Retirar da revisão',
    kinds: { review: 'pediu revisão', approve: 'aprovou', changes: 'pediu ajustes', assign: 'trocou o responsável' }, noComments: 'Sem comentários.',
    updated: a => `Atualizada ${a}`, del: 'Excluir', delConfirm: c => `Excluir ${c} de vez?`, deleted: c => `${c} excluída`,
    link: 'Link', removeAtt: 'Remover anexo', noAtt: 'Nenhum anexo.', attRemoved: 'Anexo removido',
    titleEmpty: 'O título não pode ficar vazio.', saved: 'Salvo', timerStarted: 'Cronômetro iniciado', timerPaused: 'Cronômetro pausado',
    tooBig: n => `${n} passa de 50 MB.`, uploading: n => `Enviando ${n}…`, badLink: 'Link inválido.', linkAdded: 'Link adicionado',
    allApproved: 'Aprovada por todos. Movida para Feito.', approvalSaved: 'Aprovação registrada.', writeChanges: 'Escreva o que precisa ser ajustado.', changesAsked: 'Ajustes pedidos. A tarefa voltou para Fazendo.',
    shareNew: (c, p, ti, by, ow, l) => `🆕 *Nova tarefa ${c}*${p ? ' · prioridade ' + p.toLowerCase() : ''}\n${ti}\nCriada por ${by} · responsável: ${ow}\n${l}`,
    shareReview: (c, ti, rv, by, l) => `🔍 *${c} aguarda revisão*\n${ti}\nRevisores: ${rv} · enviada por ${by}\n${l}`,
    shareChanges: (c, ti, by, note, l) => `↩️ *Ajustes pedidos em ${c}*\n${ti}\n${by}: ${note}\n${l}`,
    shareDone: (c, ti, ow, rv, l) => `✅ *${c} concluída*\n${ti}\nResponsável: ${ow}${rv ? ' · aprovada por ' + rv : ' · sem revisão'}\n${l}`,
    shareQ: { new: 'Avisar a equipe sobre a nova tarefa?', review: 'Avisar os revisores no grupo?', changes: 'Avisar o responsável no grupo?', done: 'Contar no grupo que foi concluída?' },
    shareBtn: 'Avisar no grupo', copy: 'Copiar', copied: 'Mensagem copiada.', copyFail: 'Não consegui copiar.',
    news: 'Novidades', nothingNew: 'Nada novo por aqui.',
    evCreated: (c, forYou) => `criou ${c}${forYou ? ' para você' : ''}`, evReview: c => `pediu sua revisão em ${c}`, evChanges: c => `pediu ajustes em ${c}`,
    evApprove: c => `aprovou ${c}`, evComment: c => `comentou em ${c}`, evMention: c => `mencionou você em ${c}`, evAssign: c => `passou ${c} para você`,
    evFile: c => `anexou um arquivo em ${c}`, evDone: c => `concluiu ${c}`, assignedTo: n => `passou para ${n}`,
    notifOn: 'Notificações do aparelho ativadas', notifEnable: 'Ativar notificações do aparelho', notifBlocked: 'As notificações estão bloqueadas nas configurações do navegador.',
    notifHint: 'Aparecem enquanto o quadro está aberto, mesmo em segundo plano.', mentionHint: 'Digite @ para mencionar alguém: a pessoa recebe um aviso.', notifTitle: 'Meridiano · Quadro',
    err: { dod: 'Complete antes a definição de pronto.', reviewAll: 'Em revisão, a tarefa só vai para Feito quando todos os revisores aprovarem.', notInReview: 'A tarefa não está em revisão.', notReviewer: 'Você não é revisor desta tarefa.', exists: 'Esse nome já existe.' },
  },
};
const LANG_KEYS = ['en', 'es', 'pt'];
function detectLang() {
  const saved = store.get('jira.lang'); if (LANG_KEYS.includes(saved)) return saved;
  const nav = (navigator.languages || [navigator.language || 'en']).map(x => String(x).toLowerCase());
  for (const l of nav) { if (l.startsWith('es')) return 'es'; if (l.startsWith('pt')) return 'pt'; if (l.startsWith('en')) return 'en'; }
  return 'en';
}
let LANG = 'en';
const T = () => I18N[LANG];
const LN = new Proxy({}, { get: (_, k) => T().lanes[k] });
const PRI = new Proxy({}, { get: (_, k) => T().pri[k] });
const LANES = ['backlog', 'todo', 'doing', 'review', 'done'];
function setLang(l) {
  LANG = LANG_KEYS.includes(l) ? l : 'en'; store.set('jira.lang', LANG);
  document.documentElement.lang = LANG === 'pt' ? 'pt-BR' : LANG;
  $$('[data-i18n]').forEach(el => { el.innerHTML = T()[el.dataset.i18n]; });
  $$('[data-i18n-ph]').forEach(el => { el.placeholder = T()[el.dataset.i18nPh]; });
  $$('.langsw').forEach(sw => { sw.innerHTML = LANG_KEYS.map(k => `<button type="button" class="${k === LANG ? 'on' : ''}" data-lang="${k}">${k.toUpperCase()}</button>`).join(''); });
  const tb = $('#toolbar'); if (tb) delete tb.dataset.built;
  $('#menu').hidden = true;
  if ($('#guideLink')) $('#guideLink').textContent = GUIDE[LANG].open + ' →';
  if ($('#modal').classList.contains('on') && $('#mbox').classList.contains('wide')) openGuide();
  if (S.loaded || $('#login').hidden === false) route();
  if (S.openId && !dirty()) openDrawer(S.openId);
}
document.addEventListener('click', e => { const b = e.target.closest('[data-lang]'); if (b) { e.stopPropagation(); setLang(b.dataset.lang); } }, true);
function localizeErr(m) {
  const s = String(m || ''); const E = T().err;
  if (/defini(ç|c)(ã|a)o de pronto|definition of done/i.test(s)) return E.dod;
  if (/todos os revisores|all reviewers/i.test(s)) return E.reviewAll;
  if (/n(ã|a)o est(á|a) em revis(ã|a)o|not in review/i.test(s)) return E.notInReview;
  if (/n(ã|a)o (é|e) revisor|not a reviewer/i.test(s)) return E.notReviewer;
  if (/duplicate key|j(á|a) existe/i.test(s)) return E.exists;
  return s;
}

function ago(v) { const t = ts(v); if (!t) return ''; const s = (Date.now() - t) / 1000; if (s < 60) return T().now; if (s < 3600) return Math.floor(s / 60) + ' min'; if (s < 86400) return Math.floor(s / 3600) + ' h'; if (s < 604800) return Math.floor(s / 86400) + ' d'; return new Date(t).toLocaleDateString(T().locale, { day: '2-digit', month: 'short' }); }
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
const errMsg = e => localizeErr((e && (e.message || e.error_description)) || '') || T().genericErr;
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
      throw new Error('Defina e conclua a definição de pronto antes de mover para ' + (nw.status === 'done' ? 'Feito' : 'Revisão'));
    if (nw.status === 'done' && old && old.status === 'review' && !(nw.reviewers || []).every(r => (nw.approvals || {})[r])) throw new Error('Em revisão, a tarefa só vai para Feito quando todos os revisores aprovarem');
    if (nw.status === 'done' && (!old || old.status !== 'done')) { nw.done_at = now(); if (nw.timer_started_at) { nw.time_spent_ms += Date.now() - ts(nw.timer_started_at); nw.timer_started_at = null; } }
  };
  return {
    async loadAll() { return clone(db); },
    async addMember(name) { if (db.members.some(m => m.name === name)) throw new Error('duplicate key'); const m = { id: uuid(), name, created_at: now() }; db.members.push(m); return m; },
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
function netFail(e) { console.error(e); const b = $('#banner'); b.textContent = T().offline; b.hidden = false; }

function route() {
  if (S.me && !member(S.me)) { S.me = null; store.set('jira.me', null); }
  $('#login').hidden = !!S.me; $('#app').hidden = !S.me;
  if (!S.me) renderLogin(); else renderApp();
}

async function boot() {
  applyTheme(store.get('jira.theme') || 'dark');
  setLang(detectLang());
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

/* ---------------- avisos: WhatsApp + novidades ---------------- */
const APP_URL = location.origin + location.pathname;
const linkTo = t => `${APP_URL}#${code(t)}`;
function shareText(kind, t, extra) {
  const L = T();
  if (kind === 'new') return L.shareNew(code(t), PRI[t.priority], t.title, nm(S.me), nm(t.owner_id), linkTo(t));
  if (kind === 'review') return L.shareReview(code(t), t.title, extra.map(nm).join(', '), nm(S.me), linkTo(t));
  if (kind === 'changes') return L.shareChanges(code(t), t.title, nm(S.me), extra, linkTo(t));
  if (kind === 'done') return L.shareDone(code(t), t.title, nm(t.owner_id), (t.reviewers || []).map(nm).join(', '), linkTo(t));
  return '';
}
function offerShare(kind, t, extra) {
  const text = shareText(kind, t, extra); if (!text) return;
  const box = $('#share');
  const title = T().shareQ[kind];
  box.innerHTML = `<div class="sh-t"><b>${esc(title)}</b><span>${esc(code(t))} · ${esc(t.title)}</span></div>
    <a class="btn wa" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">${IC.wa}${T().shareBtn}</a>
    <button class="btn ghost sm" id="shareCopy">${T().copy}</button><button class="icon-btn" id="shareX" aria-label="${T().close}">${IC.close}</button>`;
  box.hidden = false; requestAnimationFrame(() => box.classList.add('on'));
  const hide = () => { box.classList.remove('on'); setTimeout(() => { box.hidden = true; }, 200); };
  $('#shareX').onclick = hide; $('a.wa', box).onclick = () => setTimeout(hide, 300);
  $('#shareCopy').onclick = async () => { try { await navigator.clipboard.writeText(text); toast(T().copied); } catch (_) { toast(T().copyFail); } };
  clearTimeout(offerShare.t); offerShare.t = setTimeout(hide, 20000);
}
const seenKey = () => 'jira.seen.' + S.me;
function lastSeen() { const v = Number(store.get(seenKey())); if (v) return v; const d = Date.now() - 864e5; store.set(seenKey(), d); return d; }
const normTxt = x => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function mentions(body) {
  const b = normTxt(body), out = new Set();
  if (!b.includes('@')) return out;
  S.members.forEach(m => {
    const full = normTxt(m.name), f = full.split(' ')[0];
    const uniqueFirst = !S.members.some(o => o.id !== m.id && normTxt(o.name).split(' ')[0] === f);
    if (b.includes('@' + full) || (uniqueFirst && new RegExp('@' + f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![a-z])').test(b))) out.add(m.id);
  });
  return out;
}
function involved(t) {
  const s2 = new Set([t.owner_id, t.created_by, ...(t.reviewers || [])]);
  commentsOf(t.id).forEach(c => s2.add(c.author_id));
  s2.delete(null); s2.delete(undefined); return s2;
}
function events() {
  const ev = [], me = S.me, since = Date.now() - 14 * 864e5, L = T();
  const tk = id => S.tasks.find(t => t.id === id);
  const push = (at, t, who, text) => { if (at > since && who !== me) ev.push({ at, t, who, text }); };
  S.tasks.forEach(t => {
    if (t.created_by) push(ts(t.created_at), t, t.created_by, L.evCreated(code(t), t.owner_id === me));
    if (t.status === 'done' && t.done_at && t.owner_id && t.owner_id !== me && (t.created_by === me || (t.reviewers || []).includes(me)))
      push(ts(t.done_at), t, t.owner_id, L.evDone(code(t)));
  });
  S.comments.forEach(c => {
    const t = tk(c.task_id); if (!t) return;
    const at = ts(c.created_at), mine = t.owner_id === me || t.created_by === me;
    if (c.kind === 'review' && c.meta && (c.meta.to || []).includes(me)) push(at, t, c.author_id, L.evReview(code(t)));
    else if (c.kind === 'assign' && c.meta && c.meta.to === me) push(at, t, c.author_id, L.evAssign(code(t)));
    else if (c.kind === 'changes' && mine) push(at, t, c.author_id, L.evChanges(code(t)));
    else if (c.kind === 'approve' && mine) push(at, t, c.author_id, L.evApprove(code(t)));
    else if (c.kind === 'comment') {
      if (mentions(c.body).has(me)) push(at, t, c.author_id, L.evMention(code(t)));
      else if (involved(t).has(me)) push(at, t, c.author_id, L.evComment(code(t)));
    }
  });
  S.files.forEach(f => { const t = tk(f.task_id); if (t && (t.owner_id === me || t.created_by === me)) push(ts(f.created_at), t, f.uploaded_by, L.evFile(code(t))); });
  return ev.sort((a, b) => b.at - a.at).slice(0, 50);
}
/* device notifications (opt-in) */
const notifKey = () => 'jira.notified.' + S.me;
function notifyDevice() {
  const ev = events(), n = ev.filter(e => e.at > lastSeen()).length;
  document.title = (n ? `(${n}) ` : '') + 'Meridiano';
  if (!('Notification' in window) || Notification.permission !== 'granted' || store.get('jira.notif') !== '1') return;
  let last = Number(store.get(notifKey()));
  if (!last) { store.set(notifKey(), Date.now()); return; }
  const fresh = ev.filter(e => e.at > last).reverse().slice(-4);
  fresh.forEach(e => {
    try {
      const nt = new Notification(`${first(e.who)} ${e.text}`, { body: e.t.title, tag: 'jira-' + e.t.id + '-' + e.at });
      nt.onclick = () => { window.focus(); openDrawer(e.t.id); nt.close(); };
    } catch (_) {}
  });
  if (ev.length) store.set(notifKey(), Math.max(last, ev[0].at));
}
async function enableNotif() {
  if (!('Notification' in window)) { toast(T().notifBlocked); return; }
  const p = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (p === 'granted') { store.set('jira.notif', '1'); store.set(notifKey(), Date.now()); toast(T().notifOn); }
  else toast(T().notifBlocked);
  openBell();
}
function renderBell() {
  const n = events().filter(e => e.at > lastSeen()).length;
  $('#bellBtn').innerHTML = IC.bell + (n ? `<span class="dot">${n > 9 ? '9+' : n}</span>` : '');
  notifyDevice();
}
function openBell() {
  const ev = events(), seen = lastSeen(), m = $('#menu');
  const nOn = 'Notification' in window && Notification.permission === 'granted' && store.get('jira.notif') === '1';
  m.innerHTML = `<div style="padding:10px 12px 6px"><div class="eb" style="color:var(--mut2)">${T().news}</div></div>` +
    (ev.length ? ev.map((e, i) => `<button class="nt ${e.at > seen ? 'new' : ''}" data-ev="${i}">${av(e.who)}<span><b>${esc(first(e.who))}</b> ${esc(e.text)}<small>${esc(e.t.title)} · ${ago(new Date(e.at).toISOString())}</small></span></button>`).join('')
      : `<div class="mut2 sm" style="padding:6px 12px 14px">${T().nothingNew}</div>`) +
    `<hr>${nOn ? `<div class="mut2 sm" style="padding:8px 12px">✓ ${T().notifOn}</div>` : `<button id="notifBtn">${IC.bell}<span>${T().notifEnable}<small>${T().notifHint}</small></span></button>`}`;
  m.classList.add('bell'); m.hidden = false;
  $$('[data-ev]', m).forEach(b => b.onclick = () => { m.hidden = true; openDrawer(ev[b.dataset.ev].t.id); });
  if ($('#notifBtn')) $('#notifBtn').onclick = e => { e.stopPropagation(); enableNotif(); };
  store.set(seenKey(), Date.now()); renderBell();
}
function openFromHash() {
  const h = decodeURIComponent(location.hash.slice(1)); const n = h.match(/^MER-(\d+)$/i);
  if (!n || !S.me) return;
  const t = S.tasks.find(x => String(x.number) === n[1]);
  if (t && S.openId !== t.id) { S.lane = t.status; renderBoard(); openDrawer(t.id); }
}
window.addEventListener('hashchange', openFromHash);

/* ---------------- usage guide (EN · ES · PT) ---------------- */
const GUIDE = {
  en: { eb: 'Guide', h: 'How we use the board', lead: 'The same rules apply in the app, in the database and for Claude/ChatGPT. When in doubt, check here.', ok: 'Got it', open: 'How it works', s: [
    ['1. Sign in', 'Pick your name on the first screen. The board remembers you on this device. To switch person or language, tap your name at the top right.'],
    ['2. Create a task', 'Use <b>+ New task</b>. Only the <b>title</b> is required. Add a description, priority (High, Medium, Low), owner and attachments. The definition of done can come later. Every task gets a code (MER-12) and a direct link.'],
    ['3. Lanes', '<b>Backlog</b>: ideas and requests not planned yet.<br><b>To do</b>: planned, nobody working on it.<br><b>Doing</b>: someone is working on it now.<br><b>Review</b>: waiting for validation.<br><b>Done</b>: finished.'],
    ['4. Who moves a task', 'Only the <b>owner</b> moves their task between lanes. Everyone else can comment, attach and edit the text. A task with no owner can be taken by anyone. When you hand a task to someone, they are notified.'],
    ['5. Definition of done', 'A checklist of objective criteria that say when the task is finished (e.g. “client approved the scope”, “final file attached”). It is <b>only required</b> to move to <b>Review</b> or <b>Done</b>, and then <b>every item must be checked</b>. During review it is locked.'],
    ['6. Review (optional)', 'If the task needs validation, the owner sends it to <b>Review</b> and picks one or more reviewers (never themselves). Each reviewer <b>approves</b> or <b>requests changes</b> (a comment is required, and the task goes back to Doing). When <b>everyone approves</b>, the task moves to Done on its own. While in review, the owner can only take it back out.'],
    ['7. Finish without review', 'If no validation is needed, the owner moves the task straight to <b>Done</b>, as long as the definition of done is complete.'],
    ['8. Timer', '<b>Start</b> on the task to count time. Starting moves the task to Doing. It pauses on its own when the task leaves Doing. The total shows on the card.'],
    ['9. Notifications', 'The <b>bell</b> shows what concerns you:<br>• tasks created for you or handed to you<br>• review requests<br>• approvals and change requests on your tasks<br>• comments on tasks you own, created, review or commented on<br>• files attached to your tasks<br>• tasks you created or reviewed that were finished<br>Type <b>@name</b> in a comment to notify anyone. Turn on <b>device notifications</b> in the bell. After creating, sending to review, requesting changes or finishing, the <b>Notify the group</b> button sends the message to WhatsApp.'],
    ['10. Good practices', '• One owner per task.<br>• A definition of done that anyone can check.<br>• Use High priority sparingly.<br>• Discuss the task in its comments, not only on WhatsApp, so the history stays in one place.<br>• Close what is finished. Move what is stuck back to To do.'],
    ['11. Claude and ChatGPT', 'Connect the MCP server <code>https://oqokqkrczmdnhfwiwwdv.supabase.co/functions/v1/jira-mcp</code> as a custom connector. Then ask in any language, saying who you are: “I’m Jeny, create a high-priority task…”. The same rules apply.'],
  ] },
  es: { eb: 'Guía', h: 'Cómo usamos el tablero', lead: 'Las mismas reglas valen en la app, en la base de datos y para Claude/ChatGPT. Ante cualquier duda, consulta aquí.', ok: 'Entendido', open: 'Cómo funciona', s: [
    ['1. Entrar', 'Elige tu nombre en la primera pantalla. El tablero te recuerda en este dispositivo. Para cambiar de persona o de idioma, toca tu nombre arriba a la derecha.'],
    ['2. Crear una tarea', 'Usa <b>+ Nueva tarea</b>. Solo el <b>título</b> es obligatorio. Agrega descripción, prioridad (Alta, Media, Baja), responsable y adjuntos. La definición de terminado puede venir después. Cada tarea recibe un código (MER-12) y un enlace directo.'],
    ['3. Columnas', '<b>Backlog</b>: ideas y pedidos aún no planificados.<br><b>Por hacer</b>: planificada, nadie trabajando.<br><b>En curso</b>: alguien está trabajando en ella.<br><b>Revisión</b>: esperando validación.<br><b>Hecho</b>: terminada.'],
    ['4. Quién mueve una tarea', 'Solo el <b>responsable</b> mueve su tarea entre columnas. Los demás pueden comentar, adjuntar y editar el texto. Una tarea sin responsable la puede tomar cualquiera. Al pasarle una tarea a alguien, esa persona recibe un aviso.'],
    ['5. Definición de terminado', 'Lista de criterios objetivos que indican cuándo la tarea está terminada (ej.: “el cliente aprobó el alcance”, “archivo final adjunto”). <b>Solo se exige</b> para mover a <b>Revisión</b> o <b>Hecho</b>, y entonces <b>todos los ítems deben estar marcados</b>. Durante la revisión queda bloqueada.'],
    ['6. Revisión (opcional)', 'Si la tarea necesita validación, el responsable la envía a <b>Revisión</b> y elige uno o más revisores (nunca a sí mismo). Cada revisor <b>aprueba</b> o <b>pide cambios</b> (con comentario obligatorio; la tarea vuelve a En curso). Cuando <b>todos aprueban</b>, la tarea pasa sola a Hecho. En revisión, el responsable solo puede sacarla de revisión.'],
    ['7. Terminar sin revisión', 'Si no necesita validación, el responsable mueve la tarea directo a <b>Hecho</b>, siempre que la definición de terminado esté completa.'],
    ['8. Cronómetro', '<b>Iniciar</b> en la tarea cuenta el tiempo. Iniciar mueve la tarea a En curso. Se pausa solo cuando la tarea sale de En curso. El total aparece en la tarjeta.'],
    ['9. Avisos', 'La <b>campana</b> muestra lo que te concierne:<br>• tareas creadas o pasadas a ti<br>• pedidos de revisión<br>• aprobaciones y pedidos de cambios en tus tareas<br>• comentarios en tareas de las que eres responsable, que creaste, revisas o comentaste<br>• archivos adjuntos en tus tareas<br>• tareas que creaste o revisaste y se terminaron<br>Escribe <b>@nombre</b> en un comentario para avisar a cualquiera. Activa las <b>notificaciones del dispositivo</b> en la campana. Después de crear, enviar a revisión, pedir cambios o terminar, el botón <b>Avisar al grupo</b> envía el mensaje a WhatsApp.'],
    ['10. Buenas prácticas', '• Un responsable por tarea.<br>• Una definición de terminado que cualquiera pueda verificar.<br>• Usa la prioridad Alta con moderación.<br>• Conversa en los comentarios de la tarea, no solo en WhatsApp, para mantener el historial en un solo lugar.<br>• Cierra lo que terminó. Lo que está trabado vuelve a Por hacer.'],
    ['11. Claude y ChatGPT', 'Conecta el servidor MCP <code>https://oqokqkrczmdnhfwiwwdv.supabase.co/functions/v1/jira-mcp</code> como conector personalizado. Luego pide en cualquier idioma, diciendo quién eres: “Soy Jeny, crea una tarea de prioridad alta…”. Valen las mismas reglas.'],
  ] },
  pt: { eb: 'Guia', h: 'Como usamos o quadro', lead: 'As mesmas regras valem no app, no banco de dados e para o Claude/ChatGPT. Na dúvida, consulte aqui.', ok: 'Entendi', open: 'Como funciona', s: [
    ['1. Entrar', 'Escolha seu nome na primeira tela. O quadro lembra de você neste aparelho. Para trocar de pessoa ou de idioma, toque no seu nome no canto superior direito.'],
    ['2. Criar uma tarefa', 'Use <b>+ Nova tarefa</b>. Só o <b>título</b> é obrigatório. Adicione descrição, prioridade (Alta, Média, Baixa), responsável e anexos. A definição de pronto pode vir depois. Cada tarefa ganha um código (MER-12) e um link direto.'],
    ['3. Raias', '<b>Backlog</b>: ideias e pedidos ainda não planejados.<br><b>A fazer</b>: planejada, ninguém trabalhando.<br><b>Fazendo</b>: alguém está trabalhando nela agora.<br><b>Revisão</b>: aguardando validação.<br><b>Feito</b>: concluída.'],
    ['4. Quem move a tarefa', 'Só o <b>responsável</b> move a própria tarefa entre as raias. Os demais podem comentar, anexar e editar o texto. Tarefa sem responsável pode ser assumida por qualquer um. Ao passar uma tarefa para alguém, a pessoa é avisada.'],
    ['5. Definição de pronto', 'Lista de critérios objetivos que dizem quando a tarefa está concluída (ex.: “cliente aprovou o escopo”, “arquivo final anexado”). <b>Só é cobrada</b> para mover para <b>Revisão</b> ou <b>Feito</b>, e aí <b>todos os itens precisam estar marcados</b>. Durante a revisão fica travada.'],
    ['6. Revisão (opcional)', 'Se a tarefa precisa de validação, o responsável envia para <b>Revisão</b> e escolhe um ou mais revisores (nunca ele mesmo). Cada revisor <b>aprova</b> ou <b>pede ajustes</b> (com comentário obrigatório; a tarefa volta para Fazendo). Quando <b>todos aprovam</b>, a tarefa vai sozinha para Feito. Em revisão, o responsável só pode retirá-la da revisão.'],
    ['7. Concluir sem revisão', 'Se não precisa de validação, o responsável move a tarefa direto para <b>Feito</b>, desde que a definição de pronto esteja completa.'],
    ['8. Cronômetro', '<b>Iniciar</b>, na tarefa, conta o tempo. Iniciar move a tarefa para Fazendo. Pausa sozinho quando a tarefa sai de Fazendo. O total aparece no cartão.'],
    ['9. Avisos', 'O <b>sininho</b> mostra o que é com você:<br>• tarefas criadas ou passadas para você<br>• pedidos de revisão<br>• aprovações e pedidos de ajuste nas suas tarefas<br>• comentários em tarefas que você é responsável, criou, revisa ou comentou<br>• arquivos anexados às suas tarefas<br>• tarefas que você criou ou revisou e foram concluídas<br>Escreva <b>@nome</b> num comentário para avisar qualquer pessoa. Ative as <b>notificações do aparelho</b> no sininho. Depois de criar, enviar para revisão, pedir ajustes ou concluir, o botão <b>Avisar no grupo</b> manda a mensagem pelo WhatsApp.'],
    ['10. Boas práticas', '• Um responsável por tarefa.<br>• Uma definição de pronto que qualquer um consiga conferir.<br>• Use a prioridade Alta com moderação.<br>• Converse nos comentários da tarefa, não só no WhatsApp, para o histórico ficar num lugar só.<br>• Feche o que terminou. O que travou volta para A fazer.'],
    ['11. Claude e ChatGPT', 'Conecte o servidor MCP <code>https://oqokqkrczmdnhfwiwwdv.supabase.co/functions/v1/jira-mcp</code> como conector personalizado. Depois é só pedir em qualquer idioma, dizendo quem você é: “Sou a Jeny, crie uma tarefa de prioridade alta…”. Valem as mesmas regras.'],
  ] },
};
function openGuide() {
  const g = GUIDE[LANG];
  openModal(`<div class="eb">${g.eb}</div><h2 style="margin-top:6px">${g.h}</h2><p class="mut">${g.lead}</p>
    <div class="guide">${g.s.map(([h, b]) => `<section><h3>${h}</h3><p>${b}</p></section>`).join('')}</div>
    <div class="mfoot"><button class="btn pri" id="gOk">${g.ok}</button></div>`);
  $('#mbox').classList.add('wide'); $('#mbox').scrollTop = 0;
  $('#gOk').onclick = closeModal;
  store.set('jira.guideSeen', '1');
}

/* ---------------- login ---------------- */
function renderLogin() {
  const box = $('#people');
  box.innerHTML = S.members.map(m => `<button class="person" data-login="${esc(m.id)}">${av(m.id)}<span><b>${esc(m.name)}</b><small>${T().enter}</small></span></button>`).join('')
    + `<button class="person add" id="addPerson"><span class="plus">+</span><span><b>${T().notListed}</b><small>${T().addMyName}</small></span></button>`;
  $$('[data-login]', box).forEach(b => b.onclick = () => login(b.dataset.login));
  $('#addPerson').onclick = () => { $('#addForm').hidden = false; $('#addName').focus(); };
  if (!S.loaded) box.innerHTML = `<div class="mut">${T().loadingTeam}</div>`;
}
$('#addForm').onsubmit = async e => {
  e.preventDefault();
  const name = $('#addName').value.trim().replace(/\s+/g, ' ');
  if (!name) return;
  const ex = S.members.find(m => m.name.toLowerCase() === name.toLowerCase());
  if (ex) { login(ex.id); return; }
  try { const m = await api.addMember(name); await reload(); login(m.id); } catch (err) { toast(errMsg(err)); }
};
function login(id) { S.me = id; store.set('jira.me', id); S.filter = 'all'; route(); toast(T().hello(first(id))); if (!store.get('jira.guideSeen')) setTimeout(openGuide, 400); }
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
  renderBell();
  if (!renderApp.hashDone && S.loaded) { renderApp.hashDone = true; setTimeout(openFromHash, 0); }
  $('#today').textContent = new Date().toLocaleDateString(T().locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const week = Date.now() - 7 * 864e5;
  $('#stats').innerHTML = [
    [S.tasks.filter(t => t.status === 'doing').length, T().statDoing],
    [S.tasks.filter(t => t.status === 'review').length, T().statReview],
    [S.tasks.filter(t => t.status === 'done' && ts(t.done_at) > week).length, T().statDone],
  ].map(([n, l]) => `<div><b>${n}</b>${l}</div>`).join('');
  const nRev = S.tasks.filter(toReview).length;
  const tb = $('#toolbar');
  if (!tb.dataset.built) {
    tb.dataset.built = '1';
    tb.innerHTML = `<span id="chips" style="display:contents"></span><label class="search">${IC.search}<input id="q" type="search" placeholder="${T().search}" aria-label="${T().searchAria}"></label>`;
    $('#q').value = S.q;
    $('#q').oninput = e => { S.q = e.target.value.trim(); renderBoard(); };
  }
  $('#chips').innerHTML = [['all', T().fAll], ['mine', T().fMine], ['rev', T().fRev], ['high', T().fHigh]]
    .map(([k, l]) => `<button class="chip ${S.filter === k ? 'on' : ''}" data-f="${k}">${l}${k === 'rev' && nRev ? `<span class="n">${nRev}</span>` : ''}</button>`).join('');
  renderBoard();
  if (S.openId) fillDrawer();
}
function renderBoard() {
  const by = {}; LANES.forEach(k => by[k] = []);
  S.tasks.filter(visible).forEach(t => (by[t.status] || by.backlog).push(t));
  for (const k in by) by[k].sort((a, b) => (PRANK[a.priority] - PRANK[b.priority]) || (ts(b.updated_at) - ts(a.updated_at)));
  $('#tabs').innerHTML = LANES.map(k => [k, LN[k]]).map(([k, l]) => `<button class="tab ${S.lane === k ? 'on' : ''}" style="--lc:var(--l-${k})" data-lane="${k}">${l}<span>${by[k].length}</span></button>`).join('');
  $('#board').innerHTML = LANES.map(k => [k, LN[k]]).map(([k, l]) => `
    <section class="col ${S.lane === k ? 'on' : ''}" data-col="${k}" style="--lc:var(--l-${k})">
      <div class="colh"><i></i><span class="eb">${l}</span><span class="cnt">${by[k].length}</span>${['backlog', 'todo', 'doing'].includes(k) ? `<button class="add" data-new="${k}" title="${T().newIn(l)}">+</button>` : ''}</div>
      <div class="cards">${by[k].length ? by[k].map(card).join('') : `<div class="empty">${emptyMsg(k)}</div>`}</div>
    </section>`).join('');
}
function emptyMsg(k) {
  if (!S.tasks.length && (k === 'todo')) return T().emptyFirst;
  if (S.filter === 'rev' && k === 'review') return T().emptyRev;
  return T().empty[k];
}
function card(t) {
  const fl = filesOf(t.id).length, cm = commentsOf(t.id).filter(c => c.kind === 'comment').length;
  const d = dod(t), dn = d.filter(i => i.done).length, ap = t.approvals || {};
  const run = !!t.timer_started_at, sp = spent(t);
  const rv = (t.status === 'review' || t.status === 'done') && (t.reviewers || []).length
    ? `<div class="rv">${t.reviewers.map(r => `<span class="rchip ${ap[r] ? 'ok' : ''}">${av(r, 'xs')}${esc(first(r))} ${ap[r] ? '✓' : '…'}</span>`).join('')}</div>` : '';
  return `<article class="card" data-id="${esc(t.id)}" draggable="${canMove(t) && t.status !== 'review'}">
    <div class="k"><span>${esc(code(t))}</span><span class="prio ${esc(t.priority)}">${PRI[t.priority] || ''}</span><span class="sp"></span>
      ${sp > 0 || run ? `<span class="tm ${run ? 'run' : ''}" data-tid="${esc(t.id)}">${dur(sp)}</span>` : ''}</div>
    <h3>${esc(t.title)}</h3>
    ${t.description ? `<p>${esc(t.description)}</p>` : ''}
    <div class="f">${av(t.owner_id, 'xs')}<span>${esc(t.owner_id ? first(t.owner_id) : T().noOwner)}</span><span class="sp"></span>
      ${d.length ? `<span class="meta" title="${T().dodShort}" style="${dn === d.length ? 'color:var(--ok)' : ''}">${IC.check}${dn}/${d.length}</span>` : ''}
      ${fl ? `<span class="meta">${IC.clip}${fl}</span>` : ''}${cm ? `<span class="meta">${IC.msg}${cm}</span>` : ''}</div>${rv}</article>`;
}

/* ---------------- global events ---------------- */
document.addEventListener('click', e => {
  const f = e.target.closest('[data-f]'); if (f) { S.filter = f.dataset.f; if (S.filter === 'rev') S.lane = 'review'; renderApp(); return; }
  const tb = e.target.closest('.tab[data-lane]'); if (tb) { S.lane = tb.dataset.lane; renderBoard(); return; }
  const nw = e.target.closest('[data-new]'); if (nw) { openNew(nw.dataset.new); return; }
  const c = e.target.closest('.card[data-id]'); if (c) { openDrawer(c.dataset.id); return; }
  if (!e.target.closest('#menu') && !e.target.closest('#meBtn') && !e.target.closest('#bellBtn')) $('#menu').hidden = true;
});
$('#newTop').onclick = () => openNew();
$('#fab').onclick = () => openNew();
$('#bellBtn').onclick = e => { e.stopPropagation(); const m = $('#menu'); if (!m.hidden && m.classList.contains('bell')) { m.hidden = true; return; } openBell(); };
$('#guideBtn').onclick = () => openGuide();
$('#guideLink').onclick = e => { e.preventDefault(); openGuide(); };
$('#themeBtn').onclick = () => applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
$('#meBtn').onclick = () => {
  const m = $('#menu'); m.classList.remove('bell');
  m.innerHTML = `<div style="padding:10px 12px 8px"><div class="eb" style="color:var(--mut2)">${T().signedAs}</div><div class="serif" style="font-size:20px;margin-top:4px">${esc(nm(S.me))}</div></div><hr>
    <button id="mGuide">${GUIDE[LANG].open}</button><button id="mSwitch">${T().switchPerson}</button><button id="mTheme">${T().toggleTheme}</button><hr><div style="display:flex;align-items:center;gap:10px;padding:6px 12px 8px"><span class="mut2 sm" style="flex:1">${T().lang}</span><span class="segs langsw sm"></span></div>`;
  $$('.langsw', m).forEach(sw => { sw.innerHTML = LANG_KEYS.map(k => `<button type="button" class="${k === LANG ? 'on' : ''}" data-lang="${k}">${k.toUpperCase()}</button>`).join(''); });
  m.hidden = !m.hidden;
  $('#mSwitch').onclick = () => { m.hidden = true; logout(); };
  $('#mGuide').onclick = () => { m.hidden = true; openGuide(); };
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
  if (!canMove(t)) { toast(T().onlyOwnerMoves(first(t.owner_id))); return; }
  if (to === 'done' && t.status === 'review') { toast(T().reviewToDone); return; }
  if (to === 'review' || to === 'done') {
    if (!dodOk(t)) { toast(dod(t).length ? T().dodOpen(to) : T().dodMissing(to)); openDrawer(t.id); setTimeout(() => { const el = $('#dodSec'); el && el.scrollIntoView({ behavior: 'smooth', block: 'center' }); $('#dodNew') && $('#dodNew').focus(); }, 280); return; }
    if (to === 'review') { openReviewChooser(t); return; }
  }
  const ok = await act(async () => {
    if (t.timer_started_at && to !== 'doing') await api.timer(t.id, false);
    const patch = { status: to }; if (t.status === 'review') patch.approvals = {}; if (!t.owner_id) patch.owner_id = S.me;
    if (to === 'done') { patch.reviewers = []; patch.approvals = {}; }
    await api.updateTask(t.id, patch);
  }, to === 'done' ? T().finished(code(t)) : t.status === 'review' ? T().outOfReview : null);
  if (ok) { S.lane = to; renderBoard(); if (to === 'done') offerShare('done', S.tasks.find(x => x.id === t.id) || t); }
}

/* ---------------- modal ---------------- */
function openModal(html) { $('#mbox').classList.remove('wide'); $('#mbox').innerHTML = html; $('#modal').classList.add('on'); }
function closeModal() { $('#modal').classList.remove('on'); }
const memberOpts = sel => `<option value="">${T().noOwner}</option>` + S.members.map(m => `<option value="${esc(m.id)}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)}${m.id === S.me ? ` (${T().you})` : ''}</option>`).join('');

function openNew(lane) {
  const start = ['backlog', 'todo', 'doing'].includes(lane) ? lane : (['backlog', 'todo', 'doing'].includes(S.lane) ? S.lane : 'todo');
  const L = T();
  openModal(`<div class="eb">${L.nNewEb}</div><h2 style="margin-top:6px">${L.nNewH}</h2>
    <label class="lb" for="nTitle">${L.fTitle}</label><input class="in" id="nTitle" maxlength="200" placeholder="${L.fTitlePh}">
    <label class="lb" for="nDesc">${L.fDesc}</label><textarea class="in" id="nDesc" rows="3" placeholder="${L.fDescPh}"></textarea>
    <label class="lb" for="nDod">${L.fDod}</label><textarea class="in" id="nDod" rows="3" style="min-height:80px" placeholder="${L.fDodPh}"></textarea>
    <div class="hint">${L.fDodHint}</div>
    <div class="grid2"><div><label class="lb" for="nLane">${L.fLane}</label><select class="sel" id="nLane">${['backlog', 'todo', 'doing'].map(k => `<option value="${k}" ${k === start ? 'selected' : ''}>${LN[k]}</option>`).join('')}</select></div>
      <div><label class="lb" for="nOwner">${L.fOwner}</label><select class="sel" id="nOwner">${memberOpts(S.me)}</select></div></div>
    <label class="lb">${L.fPri}</label><div class="segs" id="nPri">${['high', 'medium', 'low'].map(k => `<button type="button" class="${k} ${k === 'medium' ? 'on' : ''}" data-p="${k}">${PRI[k]}</button>`).join('')}</div>
    <label class="lb" for="nFiles">${L.fFiles}</label><input type="file" id="nFiles" multiple class="in" style="padding:8px">
    <div class="mfoot"><button class="btn ghost" id="nCancel">${L.cancel}</button><button class="btn pri" id="nGo">${L.create}</button></div>`);
  setTimeout(() => $('#nTitle').focus(), 50);
  $('#nPri').onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; $$('#nPri button').forEach(x => x.classList.toggle('on', x === b)); };
  $('#nCancel').onclick = closeModal;
  $('#nGo').onclick = async () => {
    const title = $('#nTitle').value.trim(); if (!title) { toast(T().needTitle); $('#nTitle').focus(); return; }
    const items = $('#nDod').value.split('\n').map(s => s.trim()).filter(Boolean).map(text => ({ id: uuid(), text, done: false }));
    const files = [...$('#nFiles').files];
    $('#nGo').disabled = true;
    try {
      const t = await api.createTask({ title, description: $('#nDesc').value.trim(), dod: items, status: $('#nLane').value, owner_id: $('#nOwner').value || null, priority: ($('#nPri .on') || {}).dataset.p || 'medium', created_by: S.me });
      for (const f of files) { try { await api.upload(t.id, f, S.me); } catch (e) { toast(T().uploadFail(f.name, errMsg(e))); } }
      closeModal(); S.lane = t.status; await reload(); toast(T().created(code(t))); openDrawer(t.id); offerShare('new', S.tasks.find(x => x.id === t.id) || t);
    } catch (e) { toast(errMsg(e)); $('#nGo').disabled = false; }
  };
}

function openReviewChooser(t) {
  const others = S.members.filter(m => m.id !== t.owner_id);
  const L = T();
  openModal(`<div class="eb">${L.revEb(esc(code(t)))}</div><h2 style="margin-top:6px">${L.revH}</h2>
    <p class="mut">${L.revLead}</p>
    ${others.map(m => `<label class="chk"><input type="checkbox" value="${esc(m.id)}">${av(m.id)}<span>${esc(m.name)}</span></label>`).join('')}
    <label class="lb" for="rqNote">${L.revNote}</label><textarea class="in" id="rqNote" rows="2" style="min-height:60px" placeholder="${L.revNotePh}"></textarea>
    <div class="mfoot"><button class="btn ghost" id="rqCancel">${L.cancel}</button><button class="btn pri" id="rqGo">${L.sendReview}</button></div>`);
  $('#rqCancel').onclick = closeModal;
  $('#rqGo').onclick = async () => {
    const ids = $$('#mbox .chk input:checked').map(i => i.value);
    if (!ids.length) { toast(T().pickOne); return; }
    const note = $('#rqNote').value.trim();
    $('#rqGo').disabled = true;
    const ok = await act(async () => {
      if (t.timer_started_at) await api.timer(t.id, false);
      await api.updateTask(t.id, { status: 'review', reviewers: ids, approvals: {} });
      await api.addComment({ task_id: t.id, author_id: S.me, kind: 'review', body: note, meta: { to: ids } });
    }, T().sentReview(ids.map(first).join(T().and)));
    if (ok) { closeModal(); S.lane = 'review'; renderBoard(); offerShare('review', S.tasks.find(x => x.id === t.id) || t, ids); } else $('#rqGo').disabled = false;
  };
}

/* ---------------- drawer ---------------- */
let base = null;
const dirty = () => { const a = $('#dTitle'), b = $('#dDesc'); return !!(a && b && base && (a.value !== base.title || b.value !== base.desc)); };
function openDrawer(id) {
  if (!S.tasks.find(t => t.id === id)) return;
  S.openId = id; base = null;
  const tt = S.tasks.find(t => t.id === id); try { history.replaceState(null, '', '#' + code(tt)); } catch (_) {}
  const d = $('#drawer'), L = T();
  d.innerHTML = `<div class="dr-head"><span class="lane-tag" id="dLane"></span><span class="mut2 sm" id="dCode" style="font-weight:700;letter-spacing:.06em"></span><span class="grow"></span><button class="icon-btn" id="dClose" aria-label="${L.close}">${IC.close}</button></div>
  <div class="dr-body">
    <textarea class="ttl" id="dTitle" rows="1" maxlength="200"></textarea>
    <div class="lanes" id="dLanes" style="margin-top:12px"></div><div class="hint" id="dHint"></div>
    <dl class="props">
      <dt>${L.owner}</dt><dd><select class="sel" id="dOwner"></select></dd>
      <dt>${L.priority}</dt><dd><div class="segs" id="dPri"></div></dd>
      <dt>${L.createdL}</dt><dd class="mut sm" id="dCreated"></dd>
    </dl>
    <div class="sec" id="dodSec"><div class="lb">${IC.check.replace('<svg', '<svg width="14" height="14"')}${L.dodShort} <span id="dodProg" style="margin-left:auto;letter-spacing:.05em"></span></div>
      <div id="dodList"></div>
      <div class="linkrow" id="dodAdd"><input class="in" id="dodNew" maxlength="200" placeholder="${L.dodAddPh}"><button class="btn sm" id="dodAddBtn">${L.add}</button></div>
      <div class="hint" id="dodHint"></div></div>
    <div class="sec"><div class="lb">${L.timeSpent}</div><div class="timer"><span class="big" id="dTime" data-long="1"></span><button class="btn" id="dTimerBtn"></button></div><div class="hint" id="dTimeHint"></div></div>
    <div class="sec" id="dRev"></div>
    <div class="sec"><div class="lb">${L.descL}</div><textarea class="in" id="dDesc" rows="5" placeholder="${L.fDescPh}"></textarea>
      <div class="savebar" id="dSave" hidden><button class="btn pri sm" id="dSaveBtn">${L.save}</button><button class="btn ghost sm" id="dDiscard">${L.discard}</button></div></div>
    <div class="sec"><div class="lb">${L.attachments}</div><div id="dFiles"></div>
      <div class="upl"><label class="btn sm">${L.addFile}<input type="file" id="dFile" multiple hidden></label><button class="btn sm" id="dLinkBtn">${L.addLink}</button></div>
      <div class="linkrow" id="dLinkRow" hidden><input class="in" id="dUrl" type="url" placeholder="${L.linkPh}"><button class="btn pri sm" id="dLinkAdd">${L.add}</button></div>
      <div class="hint" id="dUpMsg"></div></div>
    <div class="sec"><div class="lb">${L.activity}</div><div id="dComments"></div>
      <div class="mention-pick" id="dMention" hidden></div>
      <div class="cbox"><textarea class="in" id="dCText" rows="2" placeholder="${L.commentPh}"></textarea><button class="btn pri" id="dCSend">${L.send}</button></div><div class="hint">${L.mentionHint}</div></div>
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
  $('#dOwner').onchange = e => { const to = e.target.value || null, id = S.openId; act(async () => {
    await api.updateTask(id, { owner_id: to });
    if (to && to !== S.me) await api.addComment({ task_id: id, author_id: S.me, kind: 'assign', body: '', meta: { to } });
  }); };
  $('#dPri').onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; const t = cur(); if (t.priority !== b.dataset.p) act(() => api.updateTask(t.id, { priority: b.dataset.p })); };
  $('#dTimerBtn').onclick = toggleTimer;
  $('#dodAddBtn').onclick = addDod;
  $('#dodNew').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addDod(); } };
  $('#dFile').onchange = e => { const fs = [...e.target.files]; e.target.value = ''; upload(fs); };
  $('#dLinkBtn').onclick = () => { $('#dLinkRow').hidden = !$('#dLinkRow').hidden; if (!$('#dLinkRow').hidden) $('#dUrl').focus(); };
  $('#dLinkAdd').onclick = addLink;
  $('#dUrl').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } };
  $('#dCSend').onclick = sendComment;
  const ct = $('#dCText');
  ct.oninput = () => {
    const v = ct.value.slice(0, ct.selectionStart), mm = v.match(/@([^\s@]*)$/), box = $('#dMention');
    if (!mm) { box.hidden = true; return; }
    const q = normTxt(mm[1]);
    const list = S.members.filter(x => normTxt(x.name).includes(q)).slice(0, 6);
    box.innerHTML = list.map(x => `<button type="button" data-mention="${esc(x.id)}">${av(x.id, 'xs')}${esc(x.name)}</button>`).join('');
    box.hidden = !list.length;
    $$('[data-mention]', box).forEach(b => b.onclick = () => {
      const x = member(b.dataset.mention), pos = ct.selectionStart, before = ct.value.slice(0, pos).replace(/@([^\s@]*)$/, '@' + x.name + ' ');
      ct.value = before + ct.value.slice(pos); ct.focus(); ct.selectionStart = ct.selectionEnd = before.length; box.hidden = true;
    });
  };
  fillDrawer(); fit();
}
const cur = () => S.tasks.find(t => t.id === S.openId);
function closeDrawer(force) {
  if (!force && S.openId && dirty()) { toast(T().unsaved); return; }
  $('#drawer').classList.remove('on'); $('#scrim').classList.remove('on'); S.openId = null;
  try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
}
function fillDrawer() {
  const t = cur();
  if (!t) { closeDrawer(true); return; }
  const mov = canMove(t), locked = t.status === 'review' || t.status === 'done', L = T();
  const tag = $('#dLane'); tag.textContent = LN[t.status]; tag.style.setProperty('--lc', `var(--l-${t.status})`);
  $('#dCode').textContent = code(t);
  const ti = $('#dTitle'), de = $('#dDesc');
  if (!dirty() && document.activeElement !== ti && document.activeElement !== de) { ti.value = t.title; de.value = t.description || ''; base = { title: ti.value, desc: de.value }; ti.style.height = 'auto'; ti.style.height = ti.scrollHeight + 'px'; }
  // lanes
  $('#dLanes').innerHTML = LANES.map(k => [k, LN[k]]).map(([k, l]) => `<button class="${t.status === k ? 'on' : ''}" style="--lc:var(--l-${k})" data-mv="${k}" ${(!mov || (k === 'done' && t.status === 'review') || (t.status === 'done' && k === 'review')) && t.status !== k ? 'disabled' : ''}><i></i>${l}</button>`).join('');
  $$('#dLanes [data-mv]').forEach(b => b.onclick = () => moveTask(cur(), b.dataset.mv));
  $('#dHint').textContent = !mov ? L.hintNotOwner(first(t.owner_id)) : t.status === 'review' ? L.hintReview : t.status === 'done' ? L.hintDone : L.hintOpen;
  const os = $('#dOwner'); os.innerHTML = memberOpts(t.owner_id); os.disabled = !mov || locked;
  $('#dPri').innerHTML = ['high', 'medium', 'low'].map(k => `<button type="button" class="${k} ${t.priority === k ? 'on' : ''}" data-p="${k}">${PRI[k]}</button>`).join('');
  $('#dCreated').textContent = L.by(first(t.created_by), ago(t.created_at));
  // definition of done
  const items = dod(t), dn = items.filter(i => i.done).length;
  $('#dodProg').textContent = items.length ? L.dodOf(dn, items.length) : '';
  $('#dodProg').style.color = items.length && dn === items.length ? 'var(--ok)' : '';
  $('#dodList').innerHTML = items.length ? items.map(i => `<label class="chk" style="margin-top:6px"><input type="checkbox" data-dod="${esc(i.id)}" ${i.done ? 'checked' : ''} ${locked ? 'disabled' : ''}><span style="flex:1;${i.done ? 'text-decoration:line-through;color:var(--mut2)' : ''}">${esc(i.text)}</span>${locked ? '' : `<button class="icon-btn" style="width:28px;height:28px" data-dodrm="${esc(i.id)}" aria-label="${L.removeCrit}">${IC.close}</button>`}</label>`).join('')
    : `<div class="empty" style="text-align:left;padding:14px">${L.dodEmpty}</div>`;
  $$('[data-dod]').forEach(c => c.onchange = () => setDod(dod(cur()).map(i => i.id === c.dataset.dod ? Object.assign({}, i, { done: c.checked }) : i)));
  $$('[data-dodrm]').forEach(b => b.onclick = e => { e.preventDefault(); setDod(dod(cur()).filter(i => i.id !== b.dataset.dodrm)); });
  $('#dodAdd').hidden = locked;
  $('#dodHint').textContent = locked ? (t.status === 'review' ? L.dodLockedReview : L.dodLockedDone) : '';
  // timer
  const run = !!t.timer_started_at, tEl = $('#dTime');
  tEl.dataset.tid = t.id; tEl.textContent = dur(spent(t), true); tEl.classList.toggle('run', run);
  const tb = $('#dTimerBtn'), open = ['backlog', 'todo', 'doing'].includes(t.status);
  tb.textContent = run ? L.pause : (spent(t) ? L.resume : L.start); tb.className = 'btn ' + (run ? 'warn' : 'pri');
  tb.hidden = !(mov && (open || run));
  $('#dTimeHint').textContent = run ? L.countingSince(new Date(ts(t.timer_started_at)).toLocaleTimeString(L.locale, { hour: '2-digit', minute: '2-digit' }))
    : (mov && open ? L.timerHint : '');
  // review
  const rv = $('#dRev'), keep = $('#rNote') ? $('#rNote').value : '', hadFocus = document.activeElement && document.activeElement.id === 'rNote';
  const revs = t.reviewers || [], ap = t.approvals || {};
  if ((t.status === 'review' || t.status === 'done') && revs.length) {
    const amRev = t.status === 'review' && revs.includes(S.me) && !ap[S.me];
    rv.innerHTML = `<div class="revbox ${t.status === 'done' ? 'done' : ''}"><h4>${t.status === 'done' ? L.validated : L.awaiting}</h4>
      ${revs.map(r => `<div class="revrow">${av(r)}<span>${esc(nm(r))}${r === S.me ? ` <span class="mut2">(${L.you})</span>` : ''}</span><span class="st ${ap[r] ? 'ok' : 'pend'}">${ap[r] ? L.approved(ago(ap[r])) : L.pending}</span></div>`).join('')}
      ${amRev ? `<textarea class="in" id="rNote" rows="2" style="min-height:60px;margin-top:10px" placeholder="${L.rNotePh}"></textarea>
        <div class="revact"><button class="btn ok" id="rOk">${L.approve}</button><button class="btn warn" id="rNo">${L.requestChanges}</button></div>` : ''}
      ${t.status === 'review' && t.owner_id === S.me ? `<div class="revact"><button class="btn ghost sm" id="rCancel">${L.takeOut}</button></div>` : ''}</div>`;
    if (amRev) { $('#rNote').value = keep; if (hadFocus) $('#rNote').focus(); $('#rOk').onclick = approve; $('#rNo').onclick = requestChanges; }
    if ($('#rCancel')) $('#rCancel').onclick = () => moveTask(cur(), 'doing');
  } else rv.innerHTML = '';
  // files
  const fl = filesOf(t.id);
  const need = fl.filter(f => f.path && !S.urls[f.path]).map(f => f.path);
  if (need.length) api.signed(need).then(o => { Object.assign(S.urls, o); if (S.openId === t.id) fillFiles(t); }).catch(() => {});
  fillFiles(t);
  // comments
  const kinds = L.kinds;
  const cms = commentsOf(t.id);
  $('#dComments').innerHTML = cms.length ? cms.map(c => `<div class="cm">${av(c.author_id)}<div class="b"><div class="h"><b>${esc(first(c.author_id))}</b>${kinds[c.kind] ? `<span class="kind ${c.kind}">${kinds[c.kind]}${c.kind === 'review' && c.meta && c.meta.to ? ' · ' + esc(c.meta.to.map(first).join(', ')) : ''}${c.kind === 'assign' && c.meta && c.meta.to ? ' · ' + esc(first(c.meta.to)) : ''}</span>` : ''} · ${ago(c.created_at)}</div>${c.body ? `<div class="t">${hlMentions(c.body)}</div>` : ''}</div></div>`).join('')
    : `<div class="mut2 sm">${L.noComments}</div>`;
  // footer
  const ft = $('#dFoot');
  if (!ft.dataset.confirm) {
    ft.innerHTML = `<span class="mut2 sm" style="flex:1">${L.updated(ago(t.updated_at))}</span>` + ((t.owner_id === S.me || t.created_by === S.me || !t.owner_id) ? `<button class="btn warn sm" id="dDel">${L.del}</button>` : '');
    if ($('#dDel')) $('#dDel').onclick = () => {
      ft.dataset.confirm = '1';
      ft.innerHTML = `<span style="flex:1;font-weight:600">${L.delConfirm(esc(code(t)))}</span><button class="btn ghost sm" id="dDelNo">${L.cancel}</button><button class="btn warn sm" id="dDelYes">${L.del}</button>`;
      $('#dDelNo').onclick = () => { delete ft.dataset.confirm; fillDrawer(); };
      $('#dDelYes').onclick = async () => { base = null; const tt = cur(); closeDrawer(true); await act(() => api.deleteTask(tt), T().deleted(code(tt))); };
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
      <div class="mut2 sm">${f.kind === 'link' ? T().link : esc(size(f.size))} · ${esc(first(f.uploaded_by))} · ${ago(f.created_at)}</div></div>
      <button class="icon-btn" style="width:30px;height:30px" data-rmf="${esc(f.id)}" aria-label="${T().removeAtt}">${IC.close}</button></div>`;
  }).join('') : `<div class="mut2 sm" style="margin-bottom:10px">${T().noAtt}</div>`;
  $$('[data-rmf]').forEach(b => b.onclick = () => { const f = S.files.find(x => x.id === b.dataset.rmf); if (f) act(() => api.removeFile(f), T().attRemoved); });
}
async function saveText() {
  const t = cur(); if (!t) return;
  const title = $('#dTitle').value.trim(); if (!title) { toast(T().titleEmpty); return; }
  const description = $('#dDesc').value;
  if (await act(() => api.updateTask(t.id, { title, description }), T().saved)) { base = { title: $('#dTitle').value, desc: description }; $('#dSave').hidden = true; }
}
function setDod(items) { const t = cur(); if (t) return act(() => api.updateTask(t.id, { dod: items })); }
async function addDod() {
  const v = $('#dodNew').value.trim(); if (!v) return;
  if (await setDod([...dod(cur()), { id: uuid(), text: v, done: false }])) { $('#dodNew').value = ''; $('#dodNew').focus(); }
}
async function toggleTimer() {
  const t = cur(); if (!t || !canMove(t)) return;
  const start = !t.timer_started_at;
  const ok = await act(() => api.timer(t.id, start), start ? T().timerStarted : T().timerPaused);
  if (ok && start) { S.lane = 'doing'; renderBoard(); }
}
async function upload(files) {
  const t = cur(); if (!t) return;
  for (const f of files) {
    if (f.size > 50 * 1024 * 1024) { toast(T().tooBig(f.name)); continue; }
    $('#dUpMsg').textContent = T().uploading(f.name);
    await act(() => api.upload(t.id, f, S.me));
  }
  $('#dUpMsg').textContent = '';
}
async function addLink() {
  let u = $('#dUrl').value.trim(); if (!u) return;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  let name; try { const x = new URL(u); name = x.hostname.replace(/^www\./, '') + (x.pathname.length > 1 ? x.pathname.slice(0, 48) : ''); } catch (_) { toast(T().badLink); return; }
  if (await act(() => api.addLink(S.openId, name, u, S.me), T().linkAdded)) { $('#dUrl').value = ''; $('#dLinkRow').hidden = true; }
}
async function sendComment() {
  const el = $('#dCText'), body = el.value.trim(); if (!body) return;
  if (await act(() => api.addComment({ task_id: S.openId, author_id: S.me, kind: 'comment', body }))) { el.value = ''; $('#dMention').hidden = true; }
}
async function approve() {
  const t = cur(); const note = ($('#rNote') && $('#rNote').value.trim()) || '';
  await act(async () => {
    const r = await api.approve(t.id, S.me, note);
    const row = Array.isArray(r) ? r[0] : r;
    setTimeout(() => { toast(row && row.status === 'done' ? T().allApproved : T().approvalSaved); if (row && row.status === 'done') offerShare('done', S.tasks.find(x => x.id === t.id) || row); }, 50);
  });
}
async function requestChanges() {
  const t = cur(); const note = ($('#rNote') && $('#rNote').value.trim()) || '';
  if (!note) { toast(T().writeChanges); $('#rNote').focus(); return; }
  await act(async () => {
    await api.updateTask(t.id, { status: 'doing', approvals: {} });
    await api.addComment({ task_id: t.id, author_id: S.me, kind: 'changes', body: note });
  }, T().changesAsked);
  offerShare('changes', S.tasks.find(x => x.id === t.id) || t, note);
}

boot();
