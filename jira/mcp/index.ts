// Meridiano · Quadro — servidor MCP (Streamable HTTP, respostas JSON).
// Publicado como Supabase Edge Function "jira-mcp". Conecte no Claude (conector personalizado)
// ou no ChatGPT (modo desenvolvedor) com a URL:
//   https://oqokqkrczmdnhfwiwwdv.supabase.co/functions/v1/jira-mcp
// Mesmas regras do app: só o responsável move a tarefa; Revisão e Feito exigem definição de pronto completa;
// a revisão é opcional, mas uma tarefa em Revisão só vai para Feito com a aprovação de todos os revisores.
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
  { auth: { persistSession: false } },
);

const APP_URL = "https://jads-marcelino.github.io/GJG/jira/";
const LANES: Record<string, string> = { backlog: "Backlog", todo: "A fazer", doing: "Fazendo", review: "Revisão", done: "Feito" };
const PRI: Record<string, string> = { high: "Alta", medium: "Média", low: "Baixa" };
const LANE_ALIASES: Record<string, string> = {
  backlog: "backlog", todo: "todo", "to do": "todo", "a fazer": "todo", fazer: "todo",
  doing: "doing", fazendo: "doing", "em andamento": "doing", andamento: "doing", "in progress": "doing",
  review: "review", revisao: "review", "em revisao": "review", done: "done", feito: "done", concluido: "done",
};
const PRI_ALIASES: Record<string, string> = { high: "high", alta: "high", medium: "medium", media: "medium", low: "low", baixa: "low" };

class UserError extends Error {}
const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const check = <T>(r: { data: T; error: unknown }): T => {
  if (r.error) throw new UserError((r.error as { message?: string }).message ?? String(r.error));
  return r.data;
};

type Member = { id: string; name: string };
type Task = Record<string, any>;

async function members(): Promise<Member[]> {
  return check(await sb.from("jira_members").select("id,name").order("name")) as Member[];
}
async function person(name: unknown, ms?: Member[]): Promise<Member> {
  ms = ms ?? await members();
  const q = norm(name);
  if (!q) throw new UserError(`Informe quem está agindo no campo "person". Pessoas da equipe: ${ms.map((m) => m.name).join(", ")}.`);
  let hit = ms.filter((m) => norm(m.name) === q);
  if (!hit.length) hit = ms.filter((m) => norm(m.name).includes(q));
  if (!hit.length) hit = ms.filter((m) => q.split(/\s+/).every((w) => norm(m.name).includes(w)));
  if (hit.length === 1) return hit[0];
  if (hit.length > 1) throw new UserError(`"${name}" é ambíguo: ${hit.map((m) => m.name).join(", ")}. Use o nome completo.`);
  throw new UserError(`Não encontrei "${name}" na equipe. Pessoas: ${ms.map((m) => m.name).join(", ")}.`);
}
async function task(ref: unknown): Promise<Task> {
  const r = String(ref ?? "").trim();
  if (!r) throw new UserError('Informe a tarefa em "task" (ex.: MER-12).');
  const n = r.match(/^(?:mer-?)?(\d+)$/i);
  const q = sb.from("jira_tasks").select("*");
  const rows = check(n ? await q.eq("number", Number(n[1])) : await q.eq("id", r)) as Task[];
  if (!rows.length) throw new UserError(`Tarefa ${r} não encontrada.`);
  return rows[0];
}
const code = (t: Task) => `MER-${t.number}`;
const dodOk = (t: Task) => Array.isArray(t.dod) && t.dod.length > 0 && t.dod.every((i: any) => i.done);
const lane = (v: unknown) => {
  const k = LANE_ALIASES[norm(v)];
  if (!k) throw new UserError(`Raia inválida: ${v}. Use backlog, todo, doing, review ou done.`);
  return k;
};
const priority = (v: unknown) => {
  const k = PRI_ALIASES[norm(v)];
  if (!k) throw new UserError(`Prioridade inválida: ${v}. Use high, medium ou low.`);
  return k;
};
function spent(t: Task) {
  const ms = Number(t.time_spent_ms || 0) + (t.timer_started_at ? Date.now() - Date.parse(t.timer_started_at) : 0);
  const m = Math.floor(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}
function summary(t: Task, ms: Member[]) {
  const nm = (id: string) => ms.find((m) => m.id === id)?.name ?? "—";
  const d = Array.isArray(t.dod) ? t.dod : [];
  return {
    task: code(t), title: t.title, status: LANES[t.status], priority: PRI[t.priority],
    owner: t.owner_id ? nm(t.owner_id) : null,
    definition_of_done: d.map((i: any, ix: number) => `${ix + 1}. [${i.done ? "x" : " "}] ${i.text}`),
    reviewers: (t.reviewers || []).map((r: string) => ({ name: nm(r), approved: !!(t.approvals || {})[r] })),
    time_spent: spent(t), timer_running: !!t.timer_started_at, updated_at: t.updated_at,
  };
}
function mustOwn(t: Task, who: Member) {
  if (t.owner_id && t.owner_id !== who.id) throw new UserError(`Só o responsável pela tarefa ${code(t)} pode movê-la.`);
}

/* ---------------- tools ---------------- */
const P = { type: "string", description: "Nome da pessoa da equipe que está fazendo a ação (ex.: Jeny Ventura)." };
const T = { type: "string", description: "Código da tarefa, ex.: MER-12." };
const tools = [
  { name: "list_members", description: "Lista as pessoas da equipe.", inputSchema: { type: "object", properties: {} } ,
    annotations: { readOnlyHint: true } },
  { name: "list_tasks", description: "Lista tarefas do quadro, com filtros opcionais.", annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: {
      status: { type: "string", enum: ["backlog", "todo", "doing", "review", "done"] },
      owner: { type: "string", description: "Nome do responsável" },
      priority: { type: "string", enum: ["high", "medium", "low"] },
      search: { type: "string", description: "Texto no título ou descrição" },
      pending_review_for: { type: "string", description: "Nome de quem precisa revisar" } } } },
  { name: "get_task", description: "Detalhes de uma tarefa: descrição, definição de pronto, revisores, anexos e comentários.", annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: { task: T }, required: ["task"] } },
  { name: "create_task", description: "Cria uma tarefa. A definição de pronto (lista de critérios) é obrigatória para a tarefa chegar a Revisão e Feito.",
    inputSchema: { type: "object", required: ["person", "title"], properties: {
      person: P, title: { type: "string" }, description: { type: "string" },
      definition_of_done: { type: "array", items: { type: "string" }, description: "Critérios de pronto, um por item" },
      priority: { type: "string", enum: ["high", "medium", "low"] },
      status: { type: "string", enum: ["backlog", "todo", "doing"] },
      owner: { type: "string", description: "Responsável (padrão: person)" } } } },
  { name: "update_task", description: "Altera título, descrição, prioridade ou responsável.",
    inputSchema: { type: "object", required: ["person", "task"], properties: {
      person: P, task: T, title: { type: "string" }, description: { type: "string" },
      priority: { type: "string", enum: ["high", "medium", "low"] }, owner: { type: "string" } } } },
  { name: "move_task", description: "Move a tarefa (só o responsável) para backlog, todo, doing ou done. Ir para done sem revisão exige definição de pronto completa; para pedir validação use send_to_review.",
    inputSchema: { type: "object", required: ["person", "task", "to"], properties: {
      person: P, task: T, to: { type: "string", enum: ["backlog", "todo", "doing", "done"] } } } },
  { name: "set_definition_of_done", description: "Substitui a lista de critérios de pronto da tarefa (todos desmarcados, a não ser que done=true).",
    inputSchema: { type: "object", required: ["person", "task", "items"], properties: {
      person: P, task: T, items: { type: "array", items: { type: "string" } } } } },
  { name: "check_done_item", description: "Marca ou desmarca um critério da definição de pronto (pelo número, começando em 1, ou pelo texto).",
    inputSchema: { type: "object", required: ["person", "task", "item"], properties: {
      person: P, task: T, item: { type: "string", description: "Número ou texto do critério" }, done: { type: "boolean", default: true } } } },
  { name: "send_to_review", description: "Envia para Revisão. Exige definição de pronto completa e ao menos um revisor diferente do responsável.",
    inputSchema: { type: "object", required: ["person", "task", "reviewers"], properties: {
      person: P, task: T, reviewers: { type: "array", items: { type: "string" } }, note: { type: "string" } } } },
  { name: "review_task", description: "Revisor aprova ou pede ajustes. Quando todos aprovam, a tarefa vai para Feito. Pedir ajustes exige nota e devolve para Fazendo.",
    inputSchema: { type: "object", required: ["person", "task", "decision"], properties: {
      person: P, task: T, decision: { type: "string", enum: ["approve", "request_changes"] }, note: { type: "string" } } } },
  { name: "add_comment", description: "Adiciona um comentário à tarefa.",
    inputSchema: { type: "object", required: ["person", "task", "text"], properties: { person: P, task: T, text: { type: "string" } } } },
  { name: "timer", description: "Inicia ou pausa o cronômetro da tarefa (só o responsável). Iniciar move para Fazendo.",
    inputSchema: { type: "object", required: ["person", "task", "action"], properties: {
      person: P, task: T, action: { type: "string", enum: ["start", "stop"] } } } },
  { name: "add_link", description: "Anexa um link (Drive, Figma, documento) à tarefa.",
    inputSchema: { type: "object", required: ["person", "task", "url"], properties: {
      person: P, task: T, url: { type: "string" }, name: { type: "string" } } } },
];

async function call(name: string, a: Record<string, any>): Promise<unknown> {
  const ms = await members();
  switch (name) {
    case "list_members":
      return { members: ms.map((m) => m.name), app: APP_URL };

    case "list_tasks": {
      let q = sb.from("jira_tasks").select("*").order("number", { ascending: false }).limit(200);
      if (a.status) q = q.eq("status", lane(a.status));
      if (a.priority) q = q.eq("priority", priority(a.priority));
      if (a.owner) q = q.eq("owner_id", (await person(a.owner, ms)).id);
      let rows = check(await q) as Task[];
      if (a.search) { const s = norm(a.search); rows = rows.filter((t) => norm(`${t.title} ${t.description}`).includes(s)); }
      if (a.pending_review_for) { const p = await person(a.pending_review_for, ms); rows = rows.filter((t) => t.status === "review" && t.reviewers.includes(p.id) && !t.approvals?.[p.id]); }
      return { count: rows.length, tasks: rows.map((t) => summary(t, ms)), app: APP_URL };
    }

    case "get_task": {
      const t = await task(a.task);
      const nm = (id: string) => ms.find((m) => m.id === id)?.name ?? "—";
      const cms = check(await sb.from("jira_comments").select("*").eq("task_id", t.id).order("created_at")) as Task[];
      const fls = check(await sb.from("jira_files").select("*").eq("task_id", t.id).order("created_at")) as Task[];
      return { ...summary(t, ms), description: t.description, created_by: nm(t.created_by), created_at: t.created_at,
        attachments: fls.map((f) => ({ name: f.name, type: f.kind, url: f.kind === "link" ? f.url : undefined })),
        activity: cms.map((c) => ({ by: nm(c.author_id), kind: c.kind, text: c.body, at: c.created_at })), app: APP_URL };
    }

    case "create_task": {
      const who = await person(a.person, ms);
      const owner = a.owner ? await person(a.owner, ms) : who;
      const status = a.status ? lane(a.status) : "todo";
      if (!["backlog", "todo", "doing"].includes(status)) throw new UserError("Tarefas novas começam em backlog, todo ou doing.");
      const title = String(a.title ?? "").trim();
      if (!title) throw new UserError("Informe o título.");
      const t = check(await sb.from("jira_tasks").insert({
        title, description: String(a.description ?? ""), status, priority: a.priority ? priority(a.priority) : "medium",
        owner_id: owner.id, created_by: who.id,
        dod: (a.definition_of_done ?? []).map((s: string) => String(s).trim()).filter(Boolean).map((text: string) => ({ id: crypto.randomUUID(), text, done: false })),
      }).select().single()) as Task;
      return { created: summary(t, ms), note: (t.dod.length ? undefined : "Sem definição de pronto: adicione com set_definition_of_done antes da revisão."), app: APP_URL };
    }

    case "update_task": {
      await person(a.person, ms);
      const t = await task(a.task);
      const patch: Record<string, unknown> = {};
      if (a.title !== undefined) patch.title = String(a.title).trim();
      if (a.description !== undefined) patch.description = String(a.description);
      if (a.priority !== undefined) patch.priority = priority(a.priority);
      if (a.owner !== undefined) {
        if (["review", "done"].includes(t.status)) throw new UserError("Não dá para trocar o responsável durante a revisão ou depois de concluída.");
        patch.owner_id = (await person(a.owner, ms)).id;
      }
      if (!Object.keys(patch).length) throw new UserError("Nada para alterar.");
      const u = check(await sb.from("jira_tasks").update(patch).eq("id", t.id).select().single()) as Task;
      return { updated: summary(u, ms) };
    }

    case "move_task": {
      const who = await person(a.person, ms);
      const t = await task(a.task);
      const to = lane(a.to);
      if (to === "review") throw new UserError("Para Revisão use send_to_review, escolhendo os revisores.");
      mustOwn(t, who);
      if (to === "done" && t.status === "review") throw new UserError(`${code(t)} está em revisão: vai para Feito quando todos aprovarem. Para concluir sem revisão, mova antes para doing.`);
      if (to === "done" && !dodOk(t)) throw new UserError("Complete a definição de pronto (todos os critérios marcados) antes de concluir.");
      if (t.timer_started_at && to !== "doing") check(await sb.rpc("jira_timer", { p_task: t.id, p_start: false }));
      const patch: Record<string, unknown> = { status: to };
      if (t.status === "review") patch.approvals = {};
      if (to === "done") { patch.reviewers = []; patch.approvals = {}; }
      if (!t.owner_id) patch.owner_id = who.id;
      const u = check(await sb.from("jira_tasks").update(patch).eq("id", t.id).select().single()) as Task;
      return { moved: summary(u, ms) };
    }

    case "set_definition_of_done": {
      await person(a.person, ms);
      const t = await task(a.task);
      if (["review", "done"].includes(t.status)) throw new UserError("A definição de pronto fica travada em Revisão e Feito.");
      const items = (a.items ?? []).map((s: string) => String(s).trim()).filter(Boolean).map((text: string) => ({ id: crypto.randomUUID(), text, done: false }));
      const u = check(await sb.from("jira_tasks").update({ dod: items }).eq("id", t.id).select().single()) as Task;
      return { updated: summary(u, ms) };
    }

    case "check_done_item": {
      await person(a.person, ms);
      const t = await task(a.task);
      if (["review", "done"].includes(t.status)) throw new UserError("A definição de pronto fica travada em Revisão e Feito.");
      const d = [...(t.dod || [])];
      const ref = String(a.item ?? "").trim();
      let ix = /^\d+$/.test(ref) ? Number(ref) - 1 : d.findIndex((i: any) => norm(i.text) === norm(ref));
      if (ix < 0 && ref) ix = d.findIndex((i: any) => norm(i.text).includes(norm(ref)));
      if (ix < 0 || ix >= d.length) throw new UserError(`Critério "${ref}" não encontrado em ${code(t)}.`);
      d[ix] = { ...d[ix], done: a.done !== false };
      const u = check(await sb.from("jira_tasks").update({ dod: d }).eq("id", t.id).select().single()) as Task;
      return { updated: summary(u, ms) };
    }

    case "send_to_review": {
      const who = await person(a.person, ms);
      const t = await task(a.task);
      mustOwn(t, who);
      if (!["backlog", "todo", "doing"].includes(t.status)) throw new UserError(`${code(t)} já está em ${LANES[t.status]}.`);
      if (!dodOk(t)) throw new UserError("Complete a definição de pronto (todos os critérios marcados) antes da revisão.");
      const revs: string[] = [];
      for (const r of a.reviewers ?? []) { const m = await person(r, ms); if (m.id === (t.owner_id ?? who.id)) throw new UserError("O responsável não pode revisar a própria tarefa."); if (!revs.includes(m.id)) revs.push(m.id); }
      if (!revs.length) throw new UserError("Escolha ao menos um revisor.");
      if (t.timer_started_at) check(await sb.rpc("jira_timer", { p_task: t.id, p_start: false }));
      const u = check(await sb.from("jira_tasks").update({ status: "review", reviewers: revs, approvals: {}, owner_id: t.owner_id ?? who.id }).eq("id", t.id).select().single()) as Task;
      check(await sb.from("jira_comments").insert({ task_id: t.id, author_id: who.id, kind: "review", body: String(a.note ?? ""), meta: { to: revs } }));
      return { in_review: summary(u, ms) };
    }

    case "review_task": {
      const who = await person(a.person, ms);
      const t = await task(a.task);
      if (t.status !== "review") throw new UserError(`${code(t)} não está em revisão.`);
      if (!t.reviewers.includes(who.id)) throw new UserError(`${who.name} não é revisor(a) de ${code(t)}.`);
      if (a.decision === "approve") {
        const r = check(await sb.rpc("jira_approve", { p_task: t.id, p_member: who.id, p_note: String(a.note ?? "") })) as Task;
        const row = Array.isArray(r) ? r[0] : r;
        return { result: row.status === "done" ? "Aprovada por todos: movida para Feito." : "Aprovação registrada; aguardando os demais revisores.", task: summary(row, ms) };
      }
      if (a.decision === "request_changes") {
        const note = String(a.note ?? "").trim();
        if (!note) throw new UserError("Explique em note o que precisa ser ajustado.");
        const u = check(await sb.from("jira_tasks").update({ status: "doing", approvals: {} }).eq("id", t.id).select().single()) as Task;
        check(await sb.from("jira_comments").insert({ task_id: t.id, author_id: who.id, kind: "changes", body: note }));
        return { result: "Ajustes pedidos: tarefa voltou para Fazendo.", task: summary(u, ms) };
      }
      throw new UserError("decision deve ser approve ou request_changes.");
    }

    case "add_comment": {
      const who = await person(a.person, ms);
      const t = await task(a.task);
      const text = String(a.text ?? "").trim();
      if (!text) throw new UserError("Comentário vazio.");
      check(await sb.from("jira_comments").insert({ task_id: t.id, author_id: who.id, kind: "comment", body: text }));
      return { ok: true, task: code(t) };
    }

    case "timer": {
      const who = await person(a.person, ms);
      const t = await task(a.task);
      mustOwn(t, who);
      const start = a.action === "start";
      if (start && !["backlog", "todo", "doing"].includes(t.status)) throw new UserError(`Não dá para cronometrar uma tarefa em ${LANES[t.status]}.`);
      const r = check(await sb.rpc("jira_timer", { p_task: t.id, p_start: start })) as Task;
      return { task: summary(Array.isArray(r) ? r[0] : r, ms) };
    }

    case "add_link": {
      const who = await person(a.person, ms);
      const t = await task(a.task);
      let url = String(a.url ?? "").trim();
      if (!/^https?:\/\//i.test(url)) url = "https://" + url;
      try { new URL(url); } catch { throw new UserError("Link inválido."); }
      check(await sb.from("jira_files").insert({ task_id: t.id, kind: "link", name: String(a.name || new URL(url).hostname), url, uploaded_by: who.id }));
      return { ok: true, task: code(t) };
    }
  }
  throw new UserError(`Ferramenta desconhecida: ${name}`);
}

/* ---------------- JSON-RPC / MCP ---------------- */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, mcp-session-id, mcp-protocol-version",
  "Access-Control-Expose-Headers": "mcp-session-id",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const INSTRUCTIONS = `Quadro de tarefas da equipe Meridiano (raias: Backlog, A fazer, Fazendo, Revisão, Feito). Toda ação de escrita exige "person": o nome de quem está agindo — pergunte ao usuário quem ele é se não souber (use list_members). Regras: só o responsável move a tarefa; Revisão e Feito exigem a definição de pronto completa; a revisão é opcional (send_to_review escolhe revisores), e uma tarefa em Revisão só vai para Feito quando todos aprovam. Tarefas são referenciadas como MER-<número>. App: ${APP_URL}`;

async function handle(msg: any) {
  const { id, method, params } = msg ?? {};
  if (id === undefined || id === null) return null; // notification
  try {
    switch (method) {
      case "initialize":
        return { jsonrpc: "2.0", id, result: {
          protocolVersion: params?.protocolVersion ?? "2025-06-18",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "meridiano-quadro", title: "Meridiano · Quadro", version: "1.0.0" },
          instructions: INSTRUCTIONS } };
      case "ping": return { jsonrpc: "2.0", id, result: {} };
      case "tools/list": return { jsonrpc: "2.0", id, result: { tools } };
      case "resources/list": return { jsonrpc: "2.0", id, result: { resources: [] } };
      case "prompts/list": return { jsonrpc: "2.0", id, result: { prompts: [] } };
      case "tools/call": {
        try {
          const out = await call(params?.name, params?.arguments ?? {});
          return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], structuredContent: out } };
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e);
          return { jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: m }] } };
        }
      }
      default: return { jsonrpc: "2.0", id, error: { code: -32601, message: `Método não suportado: ${method}` } };
    }
  } catch (e) {
    return { jsonrpc: "2.0", id, error: { code: -32603, message: e instanceof Error ? e.message : String(e) } };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method === "GET" && (req.headers.get("accept") ?? "").includes("text/event-stream")) return new Response(null, { status: 405, headers: { ...CORS, Allow: "POST" } });
  if (req.method === "GET") return json({ name: "Meridiano · Quadro (MCP)", transport: "streamable-http", endpoint: "POST este mesmo URL", app: APP_URL }, 200);
  if (req.method === "DELETE") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(handle))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
  }
  const out = await handle(body);
  return out ? json(out) : new Response(null, { status: 202, headers: CORS });
});
