# Registro de validação

## Entrega 1 — motor do canvas

- `pnpm check`: lint, TypeScript, 11 testes de domínio e build passaram.
- Navegador colaborativo em `http://localhost:5174`: quadro renderizado; criar nota e aumentar zoom verificados.
- Testes cobrem transformações em 10/100/400%, snapping em pixels de tela, posicionamento de colunas, undo/redo agrupado, adições e tarefas concorrentes, remapeamento de conectores.
- Esta entrega usa dados locais de demonstração e não declara persistência remota. API e autenticação são parte dos próximos marcos.
- O benchmark completo e os testes touch/E2E continuam pendentes.

## Entrega 2 — API e persistência

- `pnpm test`: 17 testes passaram, incluindo seis integrações com PostgreSQL via PGlite.
- Integrações: cadastro, CSRF, acesso entre contas, atualização durável, URL insegura, busca, prevenção de ciclos, lixeira/restauração e reabertura do banco.
- Migrations SQL, API Fastify, Argon2id, cookies HttpOnly, autenticação e WebSocket autenticado implementados.
- PGlite é a alternativa local sem Docker; `DATABASE_URL` seleciona PostgreSQL convencional.
- E-mails de desenvolvimento são gravados em `.data/mail`; produção usa SMTP. Nenhum e-mail real foi enviado.
