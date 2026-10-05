# Medição do canvas

O cenário E2E insere 1.000 cartões reais (notas editáveis e cores) além dos sete cartões de onboarding. O quadro é recarregado antes da medição para incluir bootstrap/persistência. Depois de carregar fontes, o teste desloca o canvas por 120 frames, descarta os dez primeiros e registra os intervalos de `requestAnimationFrame`.

Resultado local em Chromium headless, viewport 1280×720, build de produção: **27 elementos de cartão renderizados**, mediana **16,7ms**, p95 **16,8ms**. A fixture total tem 1.007 cartões. O teste anexa JSON ao relatório Playwright e exige menos de 100 cartões DOM visíveis e p95 inferior a 34ms para detectar regressões grosseiras em CI.

Esses números evidenciam aproximadamente 60fps no cenário medido; não garantem 60fps em todos os dispositivos ou com mil imagens/vídeos abertos. A distribuição espacial, resolução, quantidade de conteúdo simultaneamente visível e decodificação de mídia afetam o resultado. O teste de desempenho deve ser repetido no hardware de referência da implantação e com projetos representativos.

RBush indexa retângulos em coordenadas do mundo. O canvas renderiza apenas o viewport com margem de 400px, além da seleção/cartão em edição. Movimentos usam previews locais por frame e fazem uma transação CRDT ao soltar. Notas usam editor carregado separadamente, imagens são carregadas sob demanda e atualizações de presença são limitadas a 20Hz.

No runner GitHub Actions, a execução `37334413720` mediu mediana 33,3ms e p95 66,6ms, acima do limite de regressão. Em resposta, removemos consultas DOM por cartão na culling e a assinatura de câmera no componente de edição. Essa correção mantém o teste exigente; resultados locais não substituem a validação remota.
