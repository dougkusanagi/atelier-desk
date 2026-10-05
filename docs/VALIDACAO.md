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

## Entrega 3 — aplicação conectada e recursos de projeto

- `pnpm check`: lint, tipos, 31 testes e builds passaram.
- Navegador: cadastro real, abertura do quadro, criação de nota, edição rica, confirmação de salvamento e persistência após recarregar verificados.
- Integração: snapshots públicos sem histórico/dados privados, mutação de leitor bloqueada, comentários/menções, notificações deduplicadas, revogação, senha de link, MIME por conteúdo, download privado e SSRF.
- Exportações: arquivos Markdown e ZIP, PNG decodificado com Sharp e PDF com assinatura válida gerados pelos jobs.
- Não foi executada implantação externa; a configuração operacional e os testes E2E completos continuam em andamento.

## Etapa 4 — recuperação, permissões e fluxos completos

- `pnpm test`: 35 testes passaram. Inclui expiração de links aceitos, preservação de permissão direta, escopo público de descendentes e escritores independentes.
- `pnpm test:e2e`: 5 cenários Chromium passaram: texto e posição após recarga, duas sessões com reconexão offline, senha de link público, visão móvel/reduced motion/axe na entrada e verificação de e-mail local.
- Escritas de documentos agora bloqueiam a linha PostgreSQL e recompõem o snapshot dentro da transação; uma atualização de outra instância não é sobrescrita. Instâncias recebem mudanças pelo banco em até 500ms. O teste usa dois serviços Documents independentes sobre o adaptador local; a implantação com PostgreSQL externo ainda exige sua validação operacional.
- Uploads pendentes são recuperados do IndexedDB ao reabrir o quadro. O estado “salvo neste dispositivo” aguarda persistência local.
