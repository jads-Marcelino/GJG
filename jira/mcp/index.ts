// Meridiano · Board — MCP server (Streamable HTTP, JSON responses).
// Deployed as Supabase Edge Function "jira-mcp". Connect from Claude (custom connector)
// or ChatGPT (developer mode) with:
//   https://oqokqkrczmdnhfwiwwdv.supabase.co/functions/v1/jira-mcp
// Same rules as the app: only the owner moves a task; Review and Done require a complete definition of done;
// review is optional, but a task in Review only reaches Done when every reviewer approves.
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
  { auth: { persistSession: false } },
);

const APP_URL = "https://jads-marcelino.github.io/GJG/jira/";
const LANES: Record<string, string> = { backlog: "Backlog", todo: "To do", doing: "Doing", review: "Review", done: "Done" };
const PRI: Record<string, string> = { high: "High", medium: "Medium", low: "Low" };
const LANE_ALIASES: Record<string, string> = {
  backlog: "backlog", todo: "todo", "to do": "todo", "a fazer": "todo", "por hacer": "todo", pendiente: "todo",
  doing: "doing", "in progress": "doing", fazendo: "doing", "em andamento": "doing", "en curso": "doing", haciendo: "doing",
  review: "review", "in review": "review", revisao: "review", "em revisao": "review", revision: "review", "en revision": "review",
  done: "done", feito: "done", concluido: "done", hecho: "done", terminado: "done", finished: "done",
};
const PRI_ALIASES: Record<string, string> = { high: "high", alta: "high", medium: "medium", media: "medium", low: "low", baixa: "low", baja: "low" };

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
  if (!q) throw new UserError(`Say who is acting in the "person" field. Team: ${ms.map((m) => m.name).join(", ")}.`);
  let hit = ms.filter((m) => norm(m.name) === q);
  if (!hit.length) hit = ms.filter((m) => norm(m.name).includes(q));
  if (!hit.length) hit = ms.filter((m) => q.split(/\s+/).every((w) => norm(m.name).includes(w)));
  if (hit.length === 1) return hit[0];
  if (hit.length > 1) throw new UserError(`"${name}" is ambiguous: ${hit.map((m) => m.name).join(", ")}. Use the full name.`);
  throw new UserError(`"${name}" is not on the team. Team: ${ms.map((m) => m.name).join(", ")}.`);
}
async function task(ref: unknown): Promise<Task> {
  const r = String(ref ?? "").trim();
  if (!r) throw new UserError('Give the task in "task" (e.g. MER-12).');
  const n = r.match(/^(?:mer-?)?(\d+)$/i);
  const q = sb.from("jira_tasks").select("*");
  const rows = check(n ? await q.eq("number", Number(n[1])) : await q.eq("id", r)) as Task[];
  if (!rows.length) throw new UserError(`Task ${r} not found.`);
  return rows[0];
}
const code = (t: Task) => `MER-${t.number}`;
const dodOk = (t: Task) => Array.isArray(t.dod) && t.dod.length > 0 && t.dod.every((i: any) => i.done);
const lane = (v: unknown) => {
  const k = LANE_ALIASES[norm(v)];
  if (!k) throw new UserError(`Invalid lane: ${v}. Use backlog, todo, doing, review or done.`);
  return k;
};
const priority = (v: unknown) => {
  const k = PRI_ALIASES[norm(v)];
  if (!k) throw new UserError(`Invalid priority: ${v}. Use high, medium or low.`);
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
    time_spent: spent(t), timer_running: !!t.timer_started_at, updated_at: t.updated_at, link: `${APP_URL}#${code(t)}`,
  };
}
function mustOwn(t: Task, who: Member) {
  if (t.owner_id && t.owner_id !== who.id) throw new UserError(`Only the owner of ${code(t)} can move it.`);
}

/* ---------------- tools ---------------- */
const P = { type: "string", description: "Name of the team member doing the action (e.g. Jeny Ventura)." };
const T = { type: "string", description: "Task code, e.g. MER-12." };
const tools = [
  { name: "list_members", description: "List the team members.", inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true } },
  { name: "list_tasks", description: "List board tasks, with optional filters.", annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: {
      status: { type: "string", enum: ["backlog", "todo", "doing", "review", "done"] },
      owner: { type: "string", description: "Owner's name" },
      priority: { type: "string", enum: ["high", "medium", "low"] },
      search: { type: "string", description: "Text in title or description" },
      pending_review_for: { type: "string", description: "Name of a person who still has to review" } } } },
  { name: "get_task", description: "Task details: description, definition of done, reviewers, attachments and activity.", annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: { task: T }, required: ["task"] } },
  { name: "create_task", description: "Create a task. The definition of done (list of criteria) is only required later, to move the task to Review or Done.",
    inputSchema: { type: "object", required: ["person", "title"], properties: {
      person: P, title: { type: "string" }, description: { type: "string" },
      definition_of_done: { type: "array", items: { type: "string" }, description: "Done criteria, one per item" },
      priority: { type: "string", enum: ["high", "medium", "low"] },
      status: { type: "string", enum: ["backlog", "todo", "doing"] },
      owner: { type: "string", description: "Owner (default: person)" } } } },
  { name: "update_task", description: "Change title, description, priority or owner.",
    inputSchema: { type: "object", required: ["person", "task"], properties: {
      person: P, task: T, title: { type: "string" }, description: { type: "string" },
      priority: { type: "string", enum: ["high", "medium", "low"] }, owner: { type: "string" } } } },
  { name: "move_task", description: "Move a task (owner only) to backlog, todo, doing or done. Done without review requires a complete definition of done; to ask for validation use send_to_review.",
    inputSchema: { type: "object", required: ["person", "task", "to"], properties: {
      person: P, task: T, to: { type: "string", enum: ["backlog", "todo", "doing", "done"] } } } },
  { name: "set_definition_of_done", description: "Replace the task's definition of done (all items unchecked).",
    inputSchema: { type: "object", required: ["person", "task", "items"], properties: {
      person: P, task: T, items: { type: "array", items: { type: "string" } } } } },
  { name: "check_done_item", description: "Check or uncheck a definition-of-done item (by number starting at 1, or by text).",
    inputSchema: { type: "object", required: ["person", "task", "item"], properties: {
      person: P, task: T, item: { type: "string", description: "Number or text of the item" }, done: { type: "boolean", default: true } } } },
  { name: "send_to_review", description: "Send to Review. Requires a complete definition of done and at least one reviewer other than the owner.",
    inputSchema: { type: "object", required: ["person", "task", "reviewers"], properties: {
      person: P, task: T, reviewers: { type: "array", items: { type: "string" } }, note: { type: "string" } } } },
  { name: "review_task", description: "A reviewer approves or requests changes. When all approve, the task goes to Done. Requesting changes needs a note and sends the task back to Doing.",
    inputSchema: { type: "object", required: ["person", "task", "decision"], properties: {
      person: P, task: T, decision: { type: "string", enum: ["approve", "request_changes"] }, note: { type: "string" } } } },
  { name: "add_comment", description: "Add a comment to a task.",
    inputSchema: { type: "object", required: ["person", "task", "text"], properties: { person: P, task: T, text: { type: "string" } } } },
  { name: "timer", description: "Start or pause the task timer (owner only). Starting moves the task to Doing.",
    inputSchema: { type: "object", required: ["person", "task", "action"], properties: {
      person: P, task: T, action: { type: "string", enum: ["start", "stop"] } } } },
  { name: "add_link", description: "Attach a link (Drive, Figma, document) to a task.",
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
        activity: cms.map((c) => ({ by: nm(c.author_id), kind: c.kind, text: c.body, at: c.created_at })) };
    }

    case "create_task": {
      const who = await person(a.person, ms);
      const owner = a.owner ? await person(a.owner, ms) : who;
      const status = a.status ? lane(a.status) : "todo";
      if (!["backlog", "todo", "doing"].includes(status)) throw new UserError("New tasks start in backlog, todo or doing.");
      const title = String(a.title ?? "").trim();
      if (!title) throw new UserError("A title is required.");
      const t = check(await sb.from("jira_tasks").insert({
        title, description: String(a.description ?? ""), status, priority: a.priority ? priority(a.priority) : "medium",
        owner_id: owner.id, created_by: who.id,
        dod: (a.definition_of_done ?? []).map((s: string) => String(s).trim()).filter(Boolean).map((text: string) => ({ id: crypto.randomUUID(), text, done: false })),
      }).select().single()) as Task;
      return { created: summary(t, ms), note: (t.dod.length ? undefined : "No definition of done yet: add one with set_definition_of_done before Review or Done.") };
    }

    case "update_task": {
      await person(a.person, ms);
      const t = await task(a.task);
      const patch: Record<string, unknown> = {};
      if (a.title !== undefined) patch.title = String(a.title).trim();
      if (a.description !== undefined) patch.description = String(a.description);
      if (a.priority !== undefined) patch.priority = priority(a.priority);
      if (a.owner !== undefined) {
        if (["review", "done"].includes(t.status)) throw new UserError("The owner can't change while in review or after the task is done.");
        patch.owner_id = (await person(a.owner, ms)).id;
      }
      if (!Object.keys(patch).length) throw new UserError("Nothing to change.");
      const u = check(await sb.from("jira_tasks").update(patch).eq("id", t.id).select().single()) as Task;
      return { updated: summary(u, ms) };
    }

    case "move_task": {
      const who = await person(a.person, ms);
      const t = await task(a.task);
      const to = lane(a.to);
      if (to === "review") throw new UserError("To move to Review use send_to_review and choose reviewers.");
      mustOwn(t, who);
      if (to === "done" && t.status === "review") throw new UserError(`${code(t)} is in review: it goes to Done when everyone approves. To finish without review, move it to doing first.`);
      if (to === "done" && !dodOk(t)) throw new UserError("Complete the definition of done (all items checked) before finishing.");
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
      if (["review", "done"].includes(t.status)) throw new UserError("The definition of done is locked in Review and Done.");
      const items = (a.items ?? []).map((s: string) => String(s).trim()).filter(Boolean).map((text: string) => ({ id: crypto.randomUUID(), text, done: false }));
      const u = check(await sb.from("jira_tasks").update({ dod: items }).eq("id", t.id).select().single()) as Task;
      return { updated: summary(u, ms) };
    }

    case "check_done_item": {
      await person(a.person, ms);
      const t = await task(a.task);
      if (["review", "done"].includes(t.status)) throw new UserError("The definition of done is locked in Review and Done.");
      const d = [...(t.dod || [])];
      const ref = String(a.item ?? "").trim();
      let ix = /^\d+$/.test(ref) ? Number(ref) - 1 : d.findIndex((i: any) => norm(i.text) === norm(ref));
      if (ix < 0 && ref) ix = d.findIndex((i: any) => norm(i.text).includes(norm(ref)));
      if (ix < 0 || ix >= d.length) throw new UserError(`Item "${ref}" not found in ${code(t)}.`);
      d[ix] = { ...d[ix], done: a.done !== false };
      const u = check(await sb.from("jira_tasks").update({ dod: d }).eq("id", t.id).select().single()) as Task;
      return { updated: summary(u, ms) };
    }

    case "send_to_review": {
      const who = await person(a.person, ms);
      const t = await task(a.task);
      mustOwn(t, who);
      if (!["backlog", "todo", "doing"].includes(t.status)) throw new UserError(`${code(t)} is already in ${LANES[t.status]}.`);
      if (!dodOk(t)) throw new UserError("Complete the definition of done (all items checked) before review.");
      const revs: string[] = [];
      for (const r of a.reviewers ?? []) { const m = await person(r, ms); if (m.id === (t.owner_id ?? who.id)) throw new UserError("The owner can't review their own task."); if (!revs.includes(m.id)) revs.push(m.id); }
      if (!revs.length) throw new UserError("Choose at least one reviewer.");
      if (t.timer_started_at) check(await sb.rpc("jira_timer", { p_task: t.id, p_start: false }));
      const u = check(await sb.from("jira_tasks").update({ status: "review", reviewers: revs, approvals: {}, owner_id: t.owner_id ?? who.id }).eq("id", t.id).select().single()) as Task;
      check(await sb.from("jira_comments").insert({ task_id: t.id, author_id: who.id, kind: "review", body: String(a.note ?? ""), meta: { to: revs } }));
      return { in_review: summary(u, ms) };
    }

    case "review_task": {
      const who = await person(a.person, ms);
      const t = await task(a.task);
      if (t.status !== "review") throw new UserError(`${code(t)} is not in review.`);
      if (!t.reviewers.includes(who.id)) throw new UserError(`${who.name} is not a reviewer of ${code(t)}.`);
      if (a.decision === "approve") {
        const r = check(await sb.rpc("jira_approve", { p_task: t.id, p_member: who.id, p_note: String(a.note ?? "") })) as Task;
        const row = Array.isArray(r) ? r[0] : r;
        return { result: row.status === "done" ? "Approved by everyone: moved to Done." : "Approval recorded; waiting for the other reviewers.", task: summary(row, ms) };
      }
      if (a.decision === "request_changes") {
        const note = String(a.note ?? "").trim();
        if (!note) throw new UserError("Explain in note what needs to change.");
        const u = check(await sb.from("jira_tasks").update({ status: "doing", approvals: {} }).eq("id", t.id).select().single()) as Task;
        check(await sb.from("jira_comments").insert({ task_id: t.id, author_id: who.id, kind: "changes", body: note }));
        return { result: "Changes requested: the task went back to Doing.", task: summary(u, ms) };
      }
      throw new UserError("decision must be approve or request_changes.");
    }

    case "add_comment": {
      const who = await person(a.person, ms);
      const t = await task(a.task);
      const text = String(a.text ?? "").trim();
      if (!text) throw new UserError("Empty comment.");
      check(await sb.from("jira_comments").insert({ task_id: t.id, author_id: who.id, kind: "comment", body: text }));
      return { ok: true, task: code(t) };
    }

    case "timer": {
      const who = await person(a.person, ms);
      const t = await task(a.task);
      mustOwn(t, who);
      const start = a.action === "start";
      if (start && !["backlog", "todo", "doing"].includes(t.status)) throw new UserError(`Can't time a task in ${LANES[t.status]}.`);
      const r = check(await sb.rpc("jira_timer", { p_task: t.id, p_start: start })) as Task;
      return { task: summary(Array.isArray(r) ? r[0] : r, ms) };
    }

    case "add_link": {
      const who = await person(a.person, ms);
      const t = await task(a.task);
      let url = String(a.url ?? "").trim();
      if (!/^https?:\/\//i.test(url)) url = "https://" + url;
      try { new URL(url); } catch { throw new UserError("Invalid link."); }
      check(await sb.from("jira_files").insert({ task_id: t.id, kind: "link", name: String(a.name || new URL(url).hostname), url, uploaded_by: who.id }));
      return { ok: true, task: code(t) };
    }
  }
  throw new UserError(`Unknown tool: ${name}`);
}

/* ---------------- JSON-RPC / MCP ---------------- */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, mcp-session-id, mcp-protocol-version",
  "Access-Control-Expose-Headers": "mcp-session-id",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const INSTRUCTIONS = `Meridiano team task board (lanes: Backlog, To do, Doing, Review, Done). The team works in English, Spanish and Portuguese: answer in the user's language. Every write needs "person": the name of who is acting — ask the user who they are if unknown (use list_members). Rules: only the task owner moves it; Review and Done require a complete definition of done; review is optional (send_to_review picks reviewers), and a task in Review only reaches Done when every reviewer approves. Tasks are referenced as MER-<number>. App: ${APP_URL}`;

async function handle(msg: any) {
  const { id, method, params } = msg ?? {};
  if (id === undefined || id === null) return null; // notification
  try {
    switch (method) {
      case "initialize":
        return { jsonrpc: "2.0", id, result: {
          protocolVersion: params?.protocolVersion ?? "2025-06-18",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "meridiano-board", title: "Meridiano · Board", version: "1.1.0" },
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
      default: return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not supported: ${method}` } };
    }
  } catch (e) {
    return { jsonrpc: "2.0", id, error: { code: -32603, message: e instanceof Error ? e.message : String(e) } };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method === "GET" && (req.headers.get("accept") ?? "").includes("text/event-stream")) return new Response(null, { status: 405, headers: { ...CORS, Allow: "POST" } });
  if (req.method === "GET") return json({ name: "Meridiano · Board (MCP)", transport: "streamable-http", endpoint: "POST to this URL", app: APP_URL }, 200);
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
