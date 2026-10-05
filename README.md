# Atelier Desk

Espaço visual para organizar projetos criativos com cartões, colunas, conexões e colaboração. Interface e documentação em português brasileiro.

Implementação original inspirada na experiência de organização espacial do Milanote, sem copiar sua marca, seus recursos proprietários ou código.

## Especificação e acompanhamento

- [Prompt original completo](docs/PROMPT.md)
- [Diretrizes de implementação em pt-BR](docs/IMPLEMENTACAO.md)
- [Plano de entregas](docs/PLANO.md)
- [Matriz de funcionalidades](docs/feature-matrix.md)
- [Decisões e premissas](docs/assumptions.md)

Cada entrega testável tem [validação registrada](docs/VALIDACAO.md), commit e push para `main`.

## Executar o projeto

Requer Node.js 24 e pnpm.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm dev
```

Abra `http://localhost:5174` e crie uma conta. A API roda na porta 3001.

Sem `DATABASE_URL`, o projeto usa PostgreSQL embarcado persistente em `.data/postgres`. Assets privados ficam em `.data/objects`; e-mails locais ficam em `.data/mail`. Esses arquivos não são publicados no GitHub.

Para confirmar um e-mail em desenvolvimento, abra o link no arquivo da caixa de saída local. Não há credenciais demonstrativas fixas.

O projeto oferece cartões, rich text, tarefas com prazo/responsável, desenho, uploads, recorte de imagem, colunas, conexões, quadros aninhados, templates, busca, comentários, links compartilháveis e exportações reais. Histórico causal e cópia local protegem a recuperação do trabalho. [A matriz](docs/feature-matrix.md) registra as evidências e as pendências concretas da especificação avançada; esta versão não declara conformidade integral com o prompt.

## Verificar

```sh
pnpm check
```

O comando executa lint, TypeScript, 59 testes de domínio/integração e build. As integrações criam bancos e contas temporárias, verificam autorização e geram arquivos PNG/PDF/Markdown/ZIP reais. A suíte de navegador tem 16 cenários, incluindo duas sessões, recarga offline, clipboard, comentários, recorte, tarefas, acessibilidade e limpeza ao sair. O [benchmark](docs/DESEMPENHO.md) registra 1.007 cartões com p95 de 16,8ms no cenário medido.

## Operação e verificação

O [guia de operação](docs/OPERACAO.md) descreve Docker/Podman, PostgreSQL externo, worker, SMTP, assets, TLS e recuperação. A pipeline em `.github/workflows/ci.yml` executa os checks, PostgreSQL e E2E sobre o build de produção. O service worker permite reabrir quadros previamente visitados sem conexão e preserva a fila de uploads no IndexedDB.

```bash
pnpm check
pnpm test:e2e
TEST_DATABASE_URL=postgresql://usuario:senha@localhost:5432/banco_de_teste pnpm test:postgres
```
