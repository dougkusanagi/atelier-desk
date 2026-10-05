# Plano de implementação

## Processo de entrega

Cada marco resulta em comportamento utilizável, testes pertinentes, atualização desta lista e da matriz, commit descritivo em pt-BR e push. Não aguardar o término de toda a aplicação para publicar código.

| Marco | Entrega                                     | Validação de saída                                       | Estado                                                        |
| ----- | ------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| 0     | Repositório, prompt integral e plano        | Conferir documentos e remoto                             | Concluído                                                     |
| 1     | Monorepo, tokens e motor do canvas          | Transformações, zoom, seleção, arraste, build            | Canvas funcional publicado; benchmark pendente                |
| 2     | Cartões e edição                            | Edição, upload, clipboard, undo/redo                     | Implementado; E2E ampliado em andamento                       |
| 3     | Colunas, conexões e quadros aninhados       | Ordenação, geometria, navegação e duplicação             | Funcional; controles avançados em andamento                   |
| 4     | API, autenticação, banco, assets e offline  | Persistência, autorização, reinício e reconexão          | Integrações passaram; validação offline ampliada em andamento |
| 5     | Interações, responsividade e acessibilidade | Browser desktop/mobile, movimento reduzido e teclado     | Implementado; auditoria final pendente                        |
| 6     | Colaboração, comentários e compartilhamento | Dois clientes, convergência, revogação e leitura pública | Funcional; múltiplas instâncias e E2E em andamento            |
| 7     | Exportação, templates, busca e operação     | Exportações reais, E2E, CI e documentação                | Exportações verificadas; infraestrutura e QA em andamento     |

## Critério de conclusão

Todos os requisitos do prompt precisam de implementação e evidência de validação. Recursos ainda não entregues permanecem explicitamente pendentes na matriz.
