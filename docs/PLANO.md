# Plano de implementação

## Processo de entrega

Cada incremento testável recebe validação pertinente, commit descritivo em pt-BR e push para `main`. O prompt foi publicado antes do código. A evidência cronológica está em [VALIDACAO.md](VALIDACAO.md); [feature-matrix.md](feature-matrix.md) registra os limites desta versão.

| Marco                     | Resultado entregue                                                                     | Validação                                                                |
| ------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 0 — repositório e prompt  | Repositório criado com `gh`, prompt integral, plano e premissas publicados             | Remoto e documentos conferidos                                           |
| 1 — canvas                | Monorepo, tokens, pan/zoom, seleção, drag e culling                                    | Domínio, E2E e benchmark com 1.007 cartões                               |
| 2 — cartões               | Dez tipos, edição rica, uploads, recorte, tarefas, clipboard e undo/redo               | Integrações e navegador com persistência após recarga                    |
| 3 — organização           | Colunas, conexões, curvas, alinhamento, subquadros e duplicação de hierarquia          | Domínio, permissões/ciclos e E2E de conexões/colunas                     |
| 4 — persistência          | API, autenticação, PostgreSQL, assets privados, recuperação offline e histórico causal | Reinício, duas APIs concorrentes, reabertura offline e saída da conta    |
| 5 — interações            | Microanimações, inércia, autopan, temas, visão móvel e teclado                         | Capturas desktop/mobile, revisão independente e axe nos dois temas       |
| 6 — colaboração           | CRDT, presença, comentários, menções, convites, links e publicação                     | Duas sessões, reconexão, autorização REST/WebSocket e snapshots públicos |
| 7 — exportação e operação | PNG/PDF/Markdown/ZIP, templates, busca, containers, worker, CI e guias                 | Arquivos reais, PostgreSQL externo, builds, 59 testes e 16 E2E           |

Os sete marcos têm entregas funcionais publicadas. A conclusão integral da especificação avançada continua condicionada às pendências explícitas da matriz; não confundir uma entrega utilizável com certificação de todos os critérios de produção.

## Próximas entregas delimitadas

1. Presença distribuída e um cenário de três usuários com falhas/reconexão.
2. Busca local offline, fila de hierarquia/comentários e cache de mídia limitado.
3. Conversão Office, posters/metadados de mídia e expurgo automático da lixeira.
4. Coordenação de logout entre abas e limites globais de processamento de uploads.
5. Auditoria manual de leitor de tela, tablet e zoom de 200% em todos os fluxos.
6. Configuração e ensaio de restauração em ambiente com TLS, SMTP, ClamAV e object storage reais.
