# Meridiano · Board

Lightweight team kanban: **Backlog → To do → Doing → Review → Done**. Available in **English, Español and Português**. It opens in your device's language, and you can switch with the EN · ES · PT selector.

**Open:** https://jads-marcelino.github.io/GJG/jira/

## How it works

The full **usage guide** (EN · ES · PT) is inside the app: the **?** button at the top, or *How it works* on the sign-in screen. It opens automatically the first time someone signs in.


- **Sign in:** pick your name on the first screen. The board remembers you on that device.
- **Owner:** only the task owner moves it between lanes. Everyone else can comment, attach and edit text.
- **Definition of done:** a checklist on each task. It's only required when moving to **Review** or **Done**, and then every item must be checked. The database enforces this too.
- **Review (optional):** if the task needs validation, send it to Review and choose the reviewers. They can **approve** or **request changes** (a comment is required, and the task goes back to Doing). When everyone approves, the task moves to Done on its own. If it doesn't need validation, the owner moves it straight to Done.
- **Priority:** High, Medium or Low. High-priority tasks sit at the top of each lane.
- **Timer:** starting it moves the task to Doing. It pauses on its own when the task leaves Doing.
- **Attachments:** files up to 50 MB (private storage, temporary links) and links (Drive, Figma, Notion).
- **Notifications:**
  - The bell shows what concerns you: tasks created for you or handed to you, review requests, approvals and change requests, comments on tasks you're involved in, files, and finished tasks.
  - `@Full Name` in a comment notifies that person.
  - Optional device notifications (while the board is open).
  - The **Notify the group** button opens WhatsApp with a ready-made message in your language.
  - `…/jira/#MER-12` opens a task directly.

Add `?demo` to the link to try the board with in-memory test data. Nothing is saved.

## Connect Claude or ChatGPT (MCP)

```
https://oqokqkrczmdnhfwiwwdv.supabase.co/functions/v1/jira-mcp
```

- **Claude:** Settings → Connectors → Add custom connector → paste the URL (no authentication).
- **ChatGPT:** Settings → Apps & Connectors → Advanced → Developer mode → Create → paste the URL, authentication "None".

Then just ask, in any language, for example: *"I'm Jeny Ventura. Create a high-priority task to review the contract, with definition of done: clauses reviewed; final version attached."*

Tools: `list_members`, `list_tasks`, `get_task`, `create_task`, `update_task`, `move_task`, `set_definition_of_done`, `check_done_item`, `send_to_review`, `review_task`, `add_comment`, `timer`, `add_link`.

## Resumen en español

Tablero de tareas del equipo en inglés, español y portugués. Para entrar, eliges tu nombre. Solo el responsable mueve sus tareas. Para pasar a **Revisión** o a **Hecho**, la *definición de terminado* tiene que estar completa. La revisión es opcional; si la tarea está en revisión, pasa a Hecho cuando todos los revisores aprueban. El servidor MCP (URL de arriba) permite crear y mover tareas desde Claude o ChatGPT.

## Technical

- `index.html` + `app.js`: static app, no build step. The translations live in `I18N` inside `app.js`.
- Data lives in Supabase (project `oqokqkrczmdnhfwiwwdv`): tables `jira_*`, the private bucket `jira-files`, the functions `jira_approve` and `jira_timer`, and the trigger `jira_guard_status`. See `supabase.sql`.
- `mcp/index.ts`: the MCP server (Supabase Edge Function `jira-mcp`, Streamable HTTP).
- **Security:** sign-in is by name only, as the team decided. Anyone with the link or the MCP URL can read and change the board. Don't store sensitive information here.
