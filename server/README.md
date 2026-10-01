# Servidor VECNA

Roda no PC de casa e serve o PWA + busca de notícias (Google News RSS) para o celular e o computador.

    node server/server.js                 # http://localhost:3000
    VECNA_TOKEN=segredo PORT=3000 node server/server.js

No celular, abra `http://IP-DO-PC:3000`, vá em Configurações e preencha a URL do servidor,
o token (se definiu) e seus temas de estudo. Requer Node 18+, sem dependências.
