# Matriz de funcionalidades

Os estados abaixo descrevem evidência real. “Funcional” indica uma entrega utilizável, sem declarar concluídos todos os critérios avançados do prompt.

| Área                            | Implementação                                     | Evidência                                 | Estado                                        |
| ------------------------------- | ------------------------------------------------- | ----------------------------------------- | --------------------------------------------- |
| Prompt, plano e repositório     | `docs/PROMPT.md`, `docs/PLANO.md`                 | Prompt integral e push                    | Concluído                                     |
| Canvas e gestos                 | `Canvas.tsx`, `geometry.ts`                       | Geometria, zoom e navegador               | Funcional; benchmark pendente                 |
| Cartões e rich text             | `CardView.tsx`, `RichNote.tsx`, `DrawingCard.tsx` | Edição rica persistida no navegador       | Funcional; E2E por tipo em andamento          |
| Colunas, conexões e hierarquia  | `document.ts`, `geometry.ts`, `boards.ts`         | Layout, duplicação e ciclos               | Funcional; curvas/âncoras avançadas pendentes |
| Histórico e clipboard           | `document.ts`, `Canvas.tsx`, `board_commands`     | Undo local e remapeamento                 | Histórico durável reversível em andamento     |
| Autenticação e permissões       | `auth.ts`, `security.ts`                          | Cadastro, CSRF e isolamento entre contas  | Verificado                                    |
| Persistência, assets e jobs     | `db.ts`, `assets.ts`, `exports.ts`                | Reinício, MIME, download e formatos reais | Verificado em infraestrutura local            |
| Offline e recuperação           | `sync.ts`, `cache.ts`, `uploads.ts`               | Implementado com IndexedDB                | E2E e recuperação de filas em andamento       |
| Colaboração e presença          | `realtime.ts`, `sync.ts`                          | CRDT e WebSocket no navegador             | Funcional; teste multi-instância pendente     |
| Comentários e notificações      | `comments.ts`, `BoardPanels.tsx`                  | Menções, deduplicação e acesso            | Verificado por integração                     |
| Compartilhamento e publicação   | `sharing.ts`, `PublicPage.tsx`                    | Leitor bloqueado, revogação e senha       | Funcional; escopo aninhado em andamento       |
| Templates, busca e dashboard    | `templates.ts`, `Dashboard.tsx`, `boards.ts`      | Busca isolada, templates e dashboard      | Funcional; índices avançados pendentes        |
| PDF, PNG e Markdown             | `exports.ts`, `export.ts`                         | Quatro formatos reais em testes           | Funcional; paginação/tiles/recursão pendentes |
| Responsividade e acessibilidade | CSS, Radix, visão linear                          | Desktop funcional                         | Auditoria mobile/teclado/axe pendente         |
| Desempenho com 1.000 cartões    | RBush, culling                                    | Motor implementado                        | Medição pendente                              |
| Infraestrutura e CI             | Monorepo, builds                                  | `pnpm check` passou                       | Compose/CI/operação em andamento              |
