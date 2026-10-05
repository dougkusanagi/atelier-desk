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

## Executar a interface

Requer Node.js 24 e pnpm.

```sh
pnpm install --frozen-lockfile
pnpm dev:web
```

Abra `http://localhost:5174`. Nesta primeira entrega, o quadro é uma demonstração local; persistência e colaboração remota serão adicionadas nos próximos marcos.

## Verificar

```sh
pnpm check
```
