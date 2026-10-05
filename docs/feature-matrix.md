# Matriz de funcionalidades

Os estados abaixo descrevem evidência real. “Funcional” indica uma entrega utilizável, sem declarar concluídos todos os critérios avançados do prompt.

| Área                            | Implementação                                     | Evidência                                 | Estado                                                  |
| ------------------------------- | ------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------- |
| Prompt, plano e repositório     | `docs/PROMPT.md`, `docs/PLANO.md`                 | Prompt integral e push                    | Concluído                                               |
| Canvas e gestos                 | `Canvas.tsx`, `geometry.ts`                       | Geometria, zoom e navegador               | Verificado; medição documentada                         |
| Cartões e rich text             | `CardView.tsx`, `RichNote.tsx`, `DrawingCard.tsx` | Edição rica persistida no navegador       | Funcional; E2E por tipo em andamento                    |
| Colunas, conexões e hierarquia  | `document.ts`, `geometry.ts`, `boards.ts`         | Layout, duplicação e ciclos               | Funcional; curvas/âncoras avançadas pendentes           |
| Histórico e clipboard           | `document.ts`, `Canvas.tsx`, `board_commands`     | Undo local e remapeamento                 | Histórico durável reversível em andamento               |
| Autenticação e permissões       | `auth.ts`, `security.ts`                          | Cadastro, CSRF e isolamento entre contas  | Verificado                                              |
| Persistência, assets e jobs     | `db.ts`, `assets.ts`, `exports.ts`                | Reinício, MIME, download e formatos reais | Verificado em infraestrutura local                      |
| Offline e recuperação           | `sync.ts`, `cache.ts`, `uploads.ts`               | Implementado com IndexedDB                | Reconexão e recarga E2E verificadas; fila recuperável   |
| Colaboração e presença          | `realtime.ts`, `sync.ts`                          | CRDT e WebSocket no navegador             | Verificado em duas sessões e dois serviços Documents    |
| Comentários e notificações      | `comments.ts`, `BoardPanels.tsx`                  | Menções, deduplicação e acesso            | Verificado por integração                               |
| Compartilhamento e publicação   | `sharing.ts`, `PublicPage.tsx`                    | Leitor bloqueado, revogação e senha       | Senha, expiração, revogação e escopo verificados        |
| Templates, busca e dashboard    | `templates.ts`, `Dashboard.tsx`, `boards.ts`      | Busca isolada, templates e dashboard      | Funcional; índices avançados pendentes                  |
| PDF, PNG e Markdown             | `exports.ts`, `export.ts`                         | Quatro formatos reais em testes           | Funcional; paginação/tiles/recursão pendentes           |
| Responsividade e acessibilidade | CSS, Radix, visão linear                          | Desktop funcional                         | Mobile/reduced motion e axe na entrada verificados      |
| Desempenho com 1.000 cartões    | RBush, culling                                    | Motor implementado                        | 1.007 cartões, 27 DOM, p95 16,8ms no cenário medido     |
| Infraestrutura e CI             | Monorepo, builds                                  | `pnpm check` passou                       | Compose, CI, builds containers e PostgreSQL verificados |
