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

## Etapa 5 — build de produção e infraestrutura

- O build divide editor (404,67KB), React (350,22KB), colaboração (110,22KB), Motion (128,44KB) e páginas. Não há chunk acima de 500KB. Os valores são antes de gzip e podem mudar em commits posteriores.
- E2E sobre `vite preview`: reabertura completamente offline após recarga, recuperação de arquivo pendente e envio ao reconectar passaram. O teste encontrou e corrigiu um conflito `Vary: Origin` no cache do shell.
- `pnpm test:postgres` passou contra PostgreSQL 17 executado em Podman rootless: duas APIs, sessão compartilhada e duas escritas concorrentes preservadas.
- `podman build --target web --tag atelier-web:validation .` passou. API e worker têm entradas compiladas separadas.
- Docker Compose, pipeline GitHub Actions e guia de backup/operação foram adicionados. Configuração real de SMTP, TLS, S3 e assinaturas ClamAV continua específica da implantação.
- `pnpm test:e2e`: 7 cenários passaram sobre o build de produção. Fixture de 1.007 cartões renderizou 27 elementos; mediana 16,7ms e p95 16,7–16,8ms na navegação medida. Consulte `DESEMPENHO.md` para método e limites.
- Imagens `web` e `api` construídas com Podman; API containerizada respondeu readiness sobre PostgreSQL externo e `nginx -t` passou. O smoke test local usa `NODE_ENV=development` por não ter TLS/SMTP real configurado.

## Etapa 6 — organização, conexões e histórico do editor

- `pnpm check`: 38 testes passaram, TypeScript/lint/builds sem erros.
- `pnpm test:e2e`: 8 cenários passaram, incluindo criação e edição de conexão com rótulo persistido após recarga.
- Alinhamento em seis direções e distribuição em dois eixos funcionam como uma transação; alças editam curvas e pontos das conexões. A API valida formato, dimensões e cores de conexões.
- O UndoManager do quadro agora sobrevive à desmontagem de uma nota. Cada editor libera somente seus próprios listeners; o teste verifica a continuidade de undo.
- O documento conserva referências dos cartões que não mudaram e só serializa os afetados. O cenário de mil cartões caiu de aproximadamente 11s para 4,1s no E2E local completo; a medição de navegação manteve p95 16,8ms.
- A primeira execução remota do CI passou 6/7 E2E e encontrou timeout no bootstrap grande. A otimização e um prazo específico de 30s para essa fixture foram enviados; o resultado remoto atualizado será registrado após a nova execução.

## Etapa 7 — histórico causal durável

- `pnpm check`: 41 testes passaram; `pnpm test:e2e`: 9 cenários passaram.
- Histórico paginado de 30 dias permite desfazer/refazer as próprias alterações após recarga e reinício da API. StackItems causais do Yjs são persistidos; alterações de outros participantes são preservadas.
- Integrações verificam undo/redo de texto concorrente após reinício, proteção de um cartão criado localmente e posteriormente editado por outra pessoa e bloqueio de undo de outro autor.
- A segunda execução remota de CI confirmou os fluxos funcionais, mas mediu p95 66,6ms no benchmark. O canvas foi ajustado para evitar consultas DOM por cartão e renders do editor a cada frame de câmera. O resultado local continua p95 16,8ms; a execução remota seguinte será registrada separadamente.

## Etapa 8 — modelos de leitura e CI remoto

- `pnpm check`: 42 testes passaram. Leitores e comentaristas recebem snapshots visíveis no bootstrap e WebSocket; somente editores recebem o documento causal.
- Integração WebSocket verifica que texto de um cartão excluído não aparece no bootstrap nem nas atualizações do leitor.
- GitHub Actions `37336616924` passou integralmente no commit `931c56f`: checks estáticos, PostgreSQL externo e nove cenários Chromium, incluindo o benchmark.

## Etapa 9 — organização e templates pessoais

- `pnpm check`: 45 testes passaram. `pnpm test:e2e`: dez cenários passaram.
- Duplicação de quadros copia descendentes acessíveis e remapeia cartões, colunas, conexões e referências de subquadros em uma transação. As cópias mantêm referências autorizadas aos arquivos.
- Templates salvos podem ser selecionados no dashboard; a busca enquadra e seleciona o cartão encontrado. Recentes usam visitas e favoritos são individuais.
- Configuração de descrição, ícone e capa a partir de imagens do quadro; compartilhamento permite configurar senha, validade e exportação.
- E2E verifica template pessoal e duplicação pelo dashboard; integrações verificam hierarquia e isolamento de favoritos.

- Exportações respeitam a opção do link aceito também no job e no download; uma integração verifica a recusa quando a exportação está desativada.

## Etapa 10 — interações do canvas

- 47 testes de domínio/integração e 11 E2E passaram. Benchmark local: p95 16,7ms com 1.007 cartões e 27 elementos de cartão.
- Zoom por botões anima em 180ms; pan com ponteiro tem decaimento exponencial de 180ms, para abaixo de 10px/s ou após 700ms e respeita movimento reduzido. Wheel mantém a inércia nativa.
- Autopan inicia na margem de 32px e limita a velocidade a 600px/s. Inserção em coluna aguarda 120ms de permanência, abre espaço e mostra placeholder antes de confirmar no drop.
- A abertura de subquadros usa uma cópia visual não interativa por 280ms. Guias têm fade e o drop retorna escala/rotação com spring.
- Filhos de colunas recolhidas usam a coluna como proxy visual das conexões. A remoção padrão desagrupa filhos e pode ser desfeita; a opção explícita exclui coluna e cartões.
- E2E verifica placeholder, inserção, recolhimento, remoção e undo.
