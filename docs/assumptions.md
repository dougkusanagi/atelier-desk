# Premissas e decisões

- Repositório público `dougkusanagi/atelier-desk`, conforme a solicitação de publicar o prompt; diretório inicial vazio.
- O prompt original permanece em inglês para preservar seu conteúdo. A implementação, templates e documentação serão em pt-BR.
- Identidade visual clara, neutra e espacial já definida pelo briefing; sem rodada adicional de perguntas.
- Node.js 24 está disponível. As dependências serão fixadas no lockfile.
- Docker não está instalado no ambiente inicial. A composição Docker será entregue, mas os testes locais usarão serviços executáveis no ambiente disponível, com a alternativa descrita explicitamente.
- Sem autorização implícita para enviar convites ou e-mails a terceiros durante a implementação; usar contas e serviços locais de teste.
- Sem Docker, PostgreSQL ou acesso sudo não interativo, PGlite fornece PostgreSQL embarcado persistente para execução local. A produção usa `DATABASE_URL`; os dados e migrations usam o mesmo dialeto PostgreSQL.
- A porta de preview é 5174 porque 5173 já estava ocupada por outro processo.

- Podman rootless foi identificado durante a validação: permitiu executar PostgreSQL externo e construir as imagens sem instalar Docker ou usar sudo.
