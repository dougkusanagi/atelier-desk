---
name: Atelier Desk
description: 'Mesa visual calma para organizar ideias, referências e tarefas.'
colors:
  primary: '#315bcb'
  primary-soft: '#eaf0ff'
  danger: '#b42332'
  canvas: '#f5f4f0'
  surface: '#ffffff'
  text: '#24272d'
  secondary: '#626872'
  border: '#d9dde3'
  card-ink: '#4e574c'
  card-title-ink: '#30372f'
  column: '#eceee8'
  column-border: '#d9dfd2'
  card-yellow: '#FFF4CC'
  card-peach: '#FFE4CF'
  card-pink: '#FBE0E5'
  card-lilac: '#ECE3FA'
  card-blue: '#DEEAFB'
  card-green: '#DEEFE6'
  card-gray: '#E8EAED'
  dark-primary: '#a3b9ff'
  dark-primary-soft: '#303b55'
  dark-danger: '#ff9ca7'
  dark-canvas: '#191b1f'
  dark-surface: '#23262b'
  dark-raised: '#2b2f35'
  dark-text: '#f1f3f5'
  dark-secondary: '#b4bbc5'
  dark-border: '#454b54'
  dark-column: '#242831'
typography:
  display:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: '48px'
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: '-1.6px'
  headline:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: '32px'
    fontWeight: 500
    letterSpacing: '-0.9px'
  board-title:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: '26px'
    fontWeight: 500
    letterSpacing: '-0.7px'
  dialog-title:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: '20px'
    fontWeight: 600
    letterSpacing: '-0.5px'
  card-title:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: '17px'
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: '-0.35px'
  body:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: '13px'
    fontWeight: 500
  metadata:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: '10px'
    fontWeight: 400
rounded:
  card: '6px'
  menu: '8px'
  dialog: '12px'
  control: '4px'
  control-small: '5px'
  zoom: '7px'
spacing:
  '4': '4px'
  '8': '8px'
  '12': '12px'
  '16': '16px'
  '24': '24px'
  '32': '32px'
  '48': '48px'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.surface}'
    rounded: '{rounded.card}'
    padding: '10px 16px'
    typography: '{typography.label}'
  button-primary-dark:
    backgroundColor: '{colors.dark-primary}'
    textColor: '{colors.dark-canvas}'
    rounded: '{rounded.card}'
    padding: '10px 16px'
    typography: '{typography.label}'
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '{rounded.card}'
    padding: '10px 16px'
    typography: '{typography.label}'
  input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '{rounded.card}'
    padding: '10px 12px'
  note-card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.card-ink}'
    rounded: '{rounded.card}'
    padding: '17px 18px'
    typography: '{typography.body}'
  note-card-dark:
    backgroundColor: '{colors.dark-raised}'
    textColor: '{colors.dark-text}'
    rounded: '{rounded.card}'
    padding: '17px 18px'
    typography: '{typography.body}'
  menu:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '{rounded.menu}'
    padding: '5px'
    width: '200px'
  dialog:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '{rounded.dialog}'
    padding: '28px'
    width: '540px'
  creation-tool:
    textColor: '{colors.secondary}'
    rounded: '{rounded.card}'
    width: '52px'
  nav-item:
    textColor: '{colors.secondary}'
    rounded: '{rounded.card}'
    padding: '0 12px'
    height: '40px'
---

# Design System: Atelier Desk

## Overview

**Creative North Star: "Mesa de cartões"**

Uma mesa de cartões, clara e calma, organiza a experiência do Atelier Desk. O canvas quente recebe superfícies de papel, conteúdo colorido e ferramentas discretas. A hierarquia vem da posição, do espaço e da tipografia; a marca e a interface em pt-BR acompanham o trabalho visual.

O claro é o estado inicial; o escuro mantém o mesmo desenho com superfícies de grafite e acento mais luminoso. A densidade serve ao trabalho: navegação e metadados compactos, títulos legíveis e conteúdo editável. No celular, a composição espacial tem uma alternativa linear com controles de toque ampliados.

Este registro reconcilia o DESIGN.md inicial com a implementação em apps/web/src/styles/global.css, componentes, fontes locais e movimento do canvas. A evidência visual informada pela revisão cobre o quadro a 1280 × 800 e 390 × 844, nos dois temas, com capturas em .impeccable/review e testes axe em tests/e2e/workspace.spec.ts. A documentação de movimento vem do código e dos testes; as capturas desativam animações. O registro não certifica todas as telas, todos os estados ou equivalência integral a docs/PROMPT.md.

**Key Characteristics:**

- Canvas neutro quente e cartões de papel.
- Inter autohospedada com pesos 400, 500 e 600.
- Seleção azul, foco explícito e superfícies por nível.
- Cartões, menus e diálogos com raios distintos.
- Quadro espacial no desktop e alternativa linear no celular.

## Colors

A paleta combina neutros quentes com um azul de ação; cores suaves pertencem ao conteúdo dos cartões. Os valores normativos estão no frontmatter, extraídos do código. As rampas tonais do sidecar são visualizações auxiliares sintetizadas em OKLCH; não são tokens entregues pelo produto.

### Primary

- **Azul de seleção** (`primary`): ações principais, foco, seleção, conectores e controles ativos.
- **Azul de apoio** (`primary-soft`): destaque tonal de menus e ferramentas.
- **Azul luminoso** (`dark-primary`, `dark-primary-soft`): os mesmos papéis no modo escuro; o texto do botão principal usa o canvas escuro.
- **Vermelho de erro** (`danger`, `dark-danger`): falhas e ações destrutivas com indicação textual.

### Secondary

- **Papéis coloridos** (`card-yellow`, `card-peach`, `card-pink`, `card-lilac`, `card-blue`, `card-green`, `card-gray`): opções persistidas de cor do cartão, junto do papel branco. Os cartões de amostra de cor preservam a cor escolhida pelo usuário e calculam tinta preta ou branca conforme luminância. São conteúdo, não cores de ação.

### Neutral

- **Mesa quente** (`canvas`): fundo do quadro e páginas de trabalho.
- **Papel branco** (`surface`): navegação, campos, menus e diálogos; a superfície elevada clara também é branca.
- **Grafite de texto** (`text`) e **cinza secundário** (`secondary`): hierarquia da interface, detalhes e legendas.
- **Borda discreta** (`border`): separação de campos, painéis e controles.
- **Tinta de cartão** (`card-ink`, `card-title-ink`): corpo e título sobre papel claro.
- **Coluna suave** (`column`, `column-border`): agrupamento estrutural do conteúdo.
- **Mesa de grafite** (`dark-canvas`), **painel escuro** (`dark-surface`) e **papel elevado escuro** (`dark-raised`): camadas do tema escuro. Cartões que não são amostras de cor usam a superfície elevada, mesmo quando têm uma cor persistida.
- **Texto, detalhes e bordas escuros** (`dark-text`, `dark-secondary`, `dark-border`): os papéis equivalentes do tema escuro; colunas usam `dark-column`.

**The Estado explícito Rule.** Use o acento para seleção, foco e ações. Preserve texto, ícone ou marca de estado junto da cor quando a informação depende do estado.

## Typography

**Display Font:** Inter, com fallback system-ui e sans-serif.
**Body Font:** Inter, com o mesmo fallback.
**Label/Mono Font:** Inter na interface; ui-monospace apenas nos blocos de código do conteúdo.

Inter é servida pelo próprio bundle por meio de @fontsource/inter, nos pesos 400, 500 e 600. A hierarquia é compacta e sem uma escala modular obrigatória. A base CSS é 14px; o corpo do editor rico é 14px com entrelinha 1,7, reconciliando o registro inicial de 16/24 com o código entregue.

### Hierarchy

- **Display** (`display`): chamada da área de entrada; o tamanho cai para 38px até 900px, e essa área ilustrativa se oculta até 767px.
- **Headline** (`headline`): títulos de dashboard e páginas utilitárias; no celular, 28px.
- **Título do quadro** (`board-title`): campo editável; no celular, 21px. O título público usa 26px.
- **Título de diálogo** (`dialog-title`): identificação clara de uma tarefa modal.
- **Título de cartão** (`card-title`): hierarquia interna sem uma faixa decorativa adicional.
- **Body** (`body`): texto rico. Tarefas usam 13px; descrições e legendas geralmente 12px, com entrelinha local de 1,6 a 1,8 quando definida.
- **Label** (`label`): ações principais e navegação compacta. Metadados recorrentes variam entre 10 e 11px; ferramentas têm legenda de 9px, sem promover isso a corpo de leitura.

**The Uma família Rule.** Use Inter nas superfícies da interface; diferencie papéis por tamanho, peso e espaço. Código no conteúdo pode usar ui-monospace.

## Layout

O shell ocupa 100dvh. No quadro desktop, a barra lateral tem 232px, o cabeçalho 56px e o trilho de criação 64px; a área central recebe título e canvas. O espaço do quadro é livre, com câmera independente das posições dos cartões. O cabeçalho tem padding horizontal de 24px; o título usa recuo de 48px no desktop. Notas e tarefas têm padding próprio de 17px por 18px, sem forçar todos os componentes a um único incremento.

O ritmo reutiliza os passos do frontmatter, sobretudo 4, 8, 12, 16, 24, 32 e 48px. Dimensões estruturais e pequenos ajustes podem ser específicos do componente. Não registrar 64px como passo universal apenas porque o trilho tem essa largura.

- **Até 1200px:** galeria passa a duas colunas; opções de template, a três; o dashboard usa recuo de 32px e o cabeçalho reduz detalhes.
- **Até 1100px:** barra lateral passa a 200px, título recua 32px e dica do canvas se oculta.
- **Até 900px:** barra lateral se oculta; cabeçalho usa recuo de 16px.
- **Até 767px:** trilho se oculta, dashboard passa a uma coluna e páginas usam recuo de 20px. A barra de criação fica inferior, com safe-area; o quadro inicia na visão linear quando aberto abaixo de 768px. A lista linear usa padding de 16px, gap de 20px e cartões com largura de 100% até 640px.
- **Até 767px ou ponteiro coarse:** botões de cabeçalho, alternância de visão, metadados, cartões e diálogos recebem mínimo de 44px por 44px. Campos de cartão e resumo de detalhes da tarefa têm altura mínima de 44px. Tarefas usam grid de 44px / conteúdo flexível / 44px, com ações na linha seguinte. Esse escopo deriva dos seletores reais; não implica que cada controle de todas as telas tenha sido medido.

## Elevation & Depth

A profundidade combina tons de superfície, bordas e sombras suaves. Papéis podem ter cor, e as pequenas composições ilustrativas de entrada e previews podem usar rotações: a linguagem física observada não precisa ser banida para manter a interface calma.

### Shadow Vocabulary

- **Cartão claro em repouso:** `0 1px 2px rgba(24, 28, 36, 0.08), 0 3px 10px rgba(24, 28, 36, 0.04)`.
- **Cartão escuro em repouso:** `0 1px 3px rgba(0, 0, 0, 0.3), 0 3px 10px rgba(0, 0, 0, 0.12)`.
- **Cartão no arrasto:** `0 10px 28px rgba(24, 28, 36, 0.18), 0 2px 6px rgba(24, 28, 36, 0.1)`.
- **Menu e diálogo:** `0 12px 36px rgba(24, 28, 36, 0.16)`.
- **Controle de zoom:** `0 2px 8px rgba(35, 42, 30, 0.04)`.

**The Elevação funcional Rule.** Cartões repousam com sombra discreta, ganham sombra no arrasto e voltam ao repouso ao soltar. Colunas usam superfície tonal e borda, sem sombra.

O arrasto move a posição diretamente. A aparência faz pickup de 100ms com scale 1,025 e rotação de 0,6 grau; a soltura e entrada usam spring de 260ms, bounce 0,12. A inserção na coluna pode mover y em 160ms; x e o y ordinário não interpolam. A câmera acionada por controle usa 180ms com saída cúbica; a navegação pelo cartão de quadro usa 280ms. A entrada do overlay é 120ms, e a do diálogo, 160ms. O sidecar registra essa gramática efetiva. prefers-reduced-motion elimina essas transformações/tempos ou resolve o destino imediatamente.

## Shapes

Cartões têm cantos discretos, menus suavizam o contorno e diálogos têm maior raio. Os raios de cartão (6px), menu (8px) e diálogo (12px) são overrides explícitos do usuário e permanecem vinculantes. Controles internos podem usar 4px ou 5px; zoom usa 7px. Bordas de 1px delimitam campos e agrupamentos sem converter o canvas em uma grade visível. Avatares de presença são circulares. Imagens recortam no contorno do cartão.

A seleção de cartão usa outline azul com offset de 3px; a espessura visual é compensada pelo zoom para permanecer 2px na tela. Foco de controles usa outline de 2px com offset de 2px. O puxador de resize também compensa a escala da câmera.

## Components

### Buttons

Ações contidas e legíveis. O primário usa o acento e tinta branca no claro; no escuro, tinta do canvas escuro. O secundário usa superfície e borda. Ambos seguem os tokens do frontmatter, altura mínima de 40px e peso 500; o compacto usa mínimo de 32px, padding de 7px por 11px e fonte de 12px, antes dos overrides de toque. Hover escurece o primário com brightness 0,94 e troca o secundário para canvas. Disabled reduz opacity para 0,5. O foco é explícito.

### Cards / Containers

Notas e tarefas usam papel branco ou a paleta persistida no claro e superfície elevada no escuro. Cabeçalho de cartão usa ícone SVG, nome do tipo e menu contextual; o menu aparece em hover, seleção e foco, ficando sempre visível no celular. Corpo de nota usa edição rica e toolbar contextual. Colunas agrupam com superfície tonal, borda e ausência de sombra. Estados de upload, arquivo, imagem e link seguem o mesmo contorno de cartão; a cor da amostra cromática permanece conteúdo em ambos os temas.

### Inputs / Fields

Campos de formulário têm superfície, borda, raio de cartão, padding de 10px por 12px, fonte de 14px e mínimo de 40px. Título do quadro, conteúdo de nota e texto de tarefa editam no próprio cartão, com fundo transparente. Placeholder e legendas usam tinta secundária; erros usam texto visível de perigo. Campos de toque em cartões recebem a altura maior descrita em Layout.

### Navigation

A navegação lateral usa linhas de 40px, texto de 13px e raio de cartão; o estado ativo combina tom de superfície e texto mais forte. O trilho usa ícones SVG com legendas compactas, largura de ferramenta de 52px e altura mínima efetiva de 43px. Ativo usa acento com apoio tonal; hover usa um neutro suave. Breadcrumb mantém o contexto e reduz ancestrais em telas menores. A barra lateral se oculta até 900px; o trilho, até 767px.

### Menus e diálogos

Menus têm largura mínima de 200px, padding de 5px, borda e sombra de overlay. Itens usam 12px e padding de 9px por 10px; hover ou destaque de teclado usa apoio tonal. Diálogos têm largura de 540px limitada ao viewport menos 32px, altura máxima de 85dvh e scroll interno. O overlay escurece o contexto; título, descrição, foco preso e fechamento pertencem ao padrão modal Radix. Em mobile, padding do diálogo passa a 24px por 20px.

### Tarefas

A conclusão combina checkbox, ícone e texto riscado. No desktop, as ações aparecem em hover ou foco. Em tela pequena ou ponteiro coarse, checkbox e controles ganham alvos de 44px, o texto continua flexível e as ações passam à linha seguinte. Preserve essa quebra para o conteúdo não disputar largura com as ações.

## Do's and Don'ts

### Do:

- **Do** usar os papéis semânticos de cada tema para texto, superfície, borda e seleção.
- **Do** manter cartões com raio de 6px, menus com 8px e diálogos com 12px; são decisões explícitas do usuário.
- **Do** preservar a alternativa linear e os controles ampliados em telas pequenas ou ponteiro coarse.
- **Do** distinguir posição direta do ponteiro de animação de aparência e interromper movimento com prefers-reduced-motion.
- **Do** registrar evidência visual e de acessibilidade por tela, tema, viewport e estado efetivamente revisados.

### Don't:

- **Don't** transformar a paleta de conteúdo dos cartões em cores fixas da navegação.
- **Don't** animar a posição arrastada com atraso: a posição segue o ponteiro.
- **Don't** usar apenas hover para revelar ações no celular: menus e ações de tarefa ficam visíveis.
- **Don't** ampliar o escopo da evidência do quadro para todas as telas ou todos os requisitos do prompt.
