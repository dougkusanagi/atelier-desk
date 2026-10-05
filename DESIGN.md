# Sistema visual do Atelier Desk

Direção fixada pelo briefing: ferramenta de operação espacial, cartões físicos sobre uma mesa, interface clara e neutra. Construção direta em código; sem reinventar a direção já solicitada.

## Composição

Cabeçalho de 56px com navegação, título, estado de salvamento e ações. Trilho esquerdo de 64px para criação. Canvas livre; painéis contextuais à direita. Dashboard compacto com lista de quadros e templates. Mobile com ações inferiores e visão linear.

## Tokens

Canvas `#F5F4F0`, superfície `#FFFFFF`, texto `#24272D`, secundário `#626872`, borda `#D9DDE3`, seleção `#315BCB`. Modo escuro e escala completa conforme `docs/PROMPT.md`.

Fonte Inter autohospedada; UI 14/20, corpo do cartão 16/24. Espaçamento 4/8/12/16/24/32/48/64. Cartões com raio de 6px e sombra discreta; menus 8px e diálogos 12px.

## Interações

Posição segue o ponteiro diretamente; pickup de 100ms, settle de 260ms, criação de 180ms. Respeitar movimento reduzido. Separar transformações de câmera, posição e aparência.

## Verificação

Conferir desktop e mobile juntos, corrigir em lote e confirmar. Testar estados, contraste, teclado, clipping, foco, ausência de controles mortos e persistência real.
