# Execução e operação

## Desenvolvimento reproduzível

Node 24, pnpm 10.30.1. Execute `pnpm install --frozen-lockfile`, `pnpm exec playwright install chromium` e `pnpm dev`. A interface fica em http://localhost:5174; a API em http://localhost:3001. Os processos da API carregam `.env` da raiz. O banco local PGlite usa PostgreSQL real embarcado, em `.data/postgres`; não substitui a validação de PostgreSQL externo.

`pnpm check` executa lint, TypeScript, testes e builds. `pnpm test:e2e` inicia uma API isolada e serve o build de produção na porta 5187. Os dados ficam em `.data/e2e`; não utiliza sua conta ou seus quadros locais. `pnpm test:postgres` exige `TEST_DATABASE_URL` apontando para um banco **exclusivamente de teste**.

## Serviços de produção

`compose.yaml` define PostgreSQL 17, ClamAV, API, worker de exportações e Nginx. O worker usa a mesma imagem da API e executa `dist/worker.js`. A API recebe `WORKER_ENABLED=false`; o worker recebe `true`. No desenvolvimento, o worker fica incorporado para evitar passos extras.

Configure `.env` com `APP_ORIGIN` em HTTPS, `COOKIE_SECRET` aleatório de pelo menos 32 caracteres, `POSTGRES_PASSWORD`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` e `MAIL_FROM`. Não versione `.env`. Se a senha PostgreSQL contiver caracteres reservados de URL, use uma senha alfanumérica longa ou adapte `DATABASE_URL` com codificação apropriada.

Execute `docker compose build` e `docker compose up -d`. O Nginx publica apenas em `127.0.0.1:8080`. Coloque seu terminador TLS na frente dele e use o domínio exato configurado em `APP_ORIGIN`. Cookies de sessão são `Secure` em produção, portanto não funcionarão em HTTP comum. O ClamAV pode levar minutos para baixar assinaturas; até estar disponível, uploads são recusados com erro recuperável.

Assets ficam no volume privado `assets`; o navegador só recebe conteúdo após autorização. Para S3/MinIO, configure `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY` e `S3_SECRET_KEY` em **API e worker**, crie o bucket privado e ajuste o Compose. Não há bucket público nem URLs de download permanentes.

API e worker executam como usuário `node`; Nginx escuta em porta não privilegiada. Exportações bloqueiam pedidos externos, não executam JavaScript e reutilizam um Chromium isolado por contextos. Limite CPU/memória conforme volume e tamanho dos arquivos; o upload máximo é 500MB. A imagem de referência inclui ferramentas de build para reprodutibilidade e pode ser reduzida em uma etapa de empacotamento posterior.

## Consistência, recuperação e observabilidade

As escritas bloqueiam `board_documents` com `FOR UPDATE`; todos os processos recompõem o documento a partir do snapshot durável antes de aplicar o CRDT. Isso conserva mudanças concorrentes. As instâncias verificam mudanças no banco a cada 500ms. Presença é efêmera e limitada a conexões da mesma instância; afinidade por quadro é necessária enquanto não houver um barramento de presença distribuída.

Jobs usam `FOR UPDATE SKIP LOCKED`. Um job interrompido pode voltar à fila após 10 minutos de inatividade. Downloads verificam novamente a permissão. O estado “Salvo” só aparece após ACK de persistência. Dados offline são separados por usuário e quadro no IndexedDB; o service worker armazena somente código, fontes e shell HTML. Nunca armazena respostas privadas da API. A versão nova do shell espera a próxima navegação, preservando uma edição em andamento.

`/api/v1/health` testa o processo, `/api/v1/ready` testa o banco. Logs JSON incluem ID de requisição e omitem cookies, CSRF, senha de compartilhamento e tokens em caminhos sensíveis. Não habilite logs de URL completos no proxy para rotas privadas. Erros enviados ao cliente não incluem stack traces.

## Backup e restauração

1. Faça `pg_dump --format=custom` do banco e copie objetos/volumes privados na mesma janela de manutenção. O banco contém referências aos assets; restaurar apenas o banco não recupera os arquivos.
2. Armazene backups criptografados fora do host, com retenção e teste periódico. Nunca publique dumps ou diretórios `.data` no GitHub.
3. Restaure em um ambiente isolado com `pg_restore`, restaure os objetos e a configuração de bucket, suba os serviços e confira um quadro com nota, imagem, comentário e exportação.
4. Antes de aceitar tráfego, valide login, permissões, abertura de quadros e exports. Não remova versões, comandos ou objetos sem uma política de retenção validada.

## Evidência e limites

O container PostgreSQL externo foi executado com Podman rootless e o teste de duas APIs/escritas concorrentes passou. O build da imagem web também passou. As suítes local/E2E usam SMTP em outbox; entregabilidade SMTP, bucket S3, ClamAV e TLS exigem validação com os serviços configurados para a implantação. Consulte `VALIDACAO.md` e `feature-matrix.md` para distinguir recursos testados e critérios avançados ainda em implementação.

Referências de implementação: [Plugin API do Vite](https://vite.dev/guide/api-plugin.html), [browsers do Playwright](https://playwright.dev/docs/browsers) e [CI do Playwright](https://playwright.dev/docs/ci).

## Saída da conta e cópia local

Antes de sair, a aplicação força a persistência das mudanças locais e verifica a fila. Se houver trabalho pendente, mantém a conta aberta e oferece um ZIP com quadros, documentos causais e originais dos uploads ainda não enviados. Para restaurar cartões, copie o JSON de `quadros/` no clipboard e cole em um quadro novo; seleções têm limite de 1.000 cartões. Reenvie separadamente os arquivos pendentes. Assets já remotos não fazem parte dessa cópia.

Depois de salvar e sair online, a aplicação encerra os documentos abertos, remove os bancos/cache daquele usuário e limpa sua identidade local. Feche outras abas do mesmo usuário para permitir a exclusão dos bancos IndexedDB. A saída da conta não substitui o backup do servidor.
