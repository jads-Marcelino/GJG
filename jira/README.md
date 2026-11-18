# Meridiano · Quadro

Kanban leve da equipe: **Backlog → A fazer → Fazendo → Revisão → Feito**.

**Abrir:** https://jads-marcelino.github.io/GJG/jira/

## Como funciona

- **Entrar:** escolha seu nome na tela inicial. O quadro lembra de você neste aparelho. Para trocar, toque no seu nome no canto superior direito.
- **Responsável:** só quem é responsável pela tarefa a move entre as raias. Os demais comentam, anexam e editam o texto.
- **Definição de pronto:** cada tarefa tem uma lista de critérios. Sem a lista, e sem todos os itens marcados, a tarefa não vai para Revisão nem para Feito. A regra também vale no banco de dados.
- **Revisão:** o responsável escolhe quem valida. Quem revisa pode **aprovar** ou **pedir ajustes**. Pedir ajustes exige comentário e devolve a tarefa para Fazendo. Quando todos aprovam, a tarefa vai sozinha para Feito.
- **Prioridade:** Alta, Média ou Baixa. As tarefas de prioridade Alta ficam no topo de cada raia.
- **Cronômetro:** iniciar coloca a tarefa em Fazendo. O cronômetro pausa sozinho quando a tarefa sai de Fazendo.
- **Anexos:** arquivos de até 50 MB, guardados em bucket privado com links temporários, além de links (Drive, Figma, Notion).
- Tema claro e escuro, busca, filtros ("Minhas", "Para eu revisar", "Prioridade alta") e atualização em tempo real.

`?demo` no fim do link abre uma versão de teste com dados em memória, que não grava nada.

## Conectar no Claude ou no ChatGPT (MCP)

URL do servidor MCP:

```
https://oqokqkrczmdnhfwiwwdv.supabase.co/functions/v1/jira-mcp
```

- **Claude:** Configurações → Conectores → Adicionar conector personalizado → cole a URL (sem autenticação).
- **ChatGPT:** Configurações → Apps e conectores → Avançado → Modo desenvolvedor → Criar → cole a URL, autenticação "Nenhuma".

Depois é só pedir, por exemplo: *"Sou a Jeny Ventura. Crie uma tarefa de prioridade alta para revisar o contrato, com definição de pronto: cláusulas revisadas; versão final anexada."*

Ferramentas: `list_members`, `list_tasks`, `get_task`, `create_task`, `update_task`, `move_task`, `set_definition_of_done`, `check_done_item`, `send_to_review`, `review_task`, `add_comment`, `timer`, `add_link`. Toda escrita informa quem está agindo (`person`) e segue as mesmas regras do app.

## Técnico

- `index.html` + `app.js`: app estático, sem build.
- Dados no Supabase (projeto `oqokqkrczmdnhfwiwwdv`): tabelas `jira_members`, `jira_tasks`, `jira_comments`, `jira_files`, bucket privado `jira-files`, funções `jira_approve` e `jira_timer` e o gatilho `jira_guard_status`. O esquema está em `supabase.sql`.
- `mcp/index.ts`: servidor MCP (Supabase Edge Function `jira-mcp`, Streamable HTTP).
- **Segurança:** o login é só por nome, por decisão da equipe. Qualquer pessoa com o link (ou com a URL do MCP) consegue ler e alterar o quadro. Não guarde aqui informação sensível.
