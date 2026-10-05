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

O projeto já oferece cartões, rich text, tarefas, desenho, uploads, colunas, conexões, quadros aninhados, templates, busca, comentários, links compartilháveis e exportações reais. [A matriz](docs/feature-matrix.md) diferencia implementações verificadas das exigências de produção ainda em andamento.

## Verificar

```sh
pnpm check
```

O comando executa lint, TypeScript, testes de domínio/integração e build. As integrações criam bancos e contas temporárias, verificam autorização e geram arquivos PNG/PDF/Markdown/ZIP reais.
