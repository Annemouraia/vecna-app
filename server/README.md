# Servidor VECNA

Roda no PC de casa e serve o PWA + busca de notícias (Google News RSS) para o celular e o computador.

    node server/server.js                 # http://localhost:3000
    VECNA_TOKEN=segredo PORT=3000 node server/server.js

No celular, abra `http://IP-DO-PC:3000`, vá em Configurações e preencha a URL do servidor,
o token (se definiu) e seus temas de estudo. Requer Node 18+, sem dependências.

## Gmail (ler emails e criar rascunhos)

O VECNA **lê** seus emails e cria **rascunhos** de resposta. Ele nunca envia nada: você revisa e envia pelo Gmail.

1. Em https://console.cloud.google.com crie um projeto e ative a **Gmail API**.
2. Tela de consentimento OAuth: tipo *Externo*, adicione seu email como **usuário de teste**.
3. Credenciais → *Criar ID do cliente OAuth* → tipo **App da Web**, com o URI de redirecionamento
   `http://localhost:3000/auth/google/callback` (troque a porta se mudar `PORT`).
4. Inicie o servidor com as credenciais:

       GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node server/server.js

5. **No próprio PC de casa**, abra `http://localhost:3000/auth/google` e autorize uma vez.
   O refresh token fica em `server/.google-token.json` (fora do git).

Escopos pedidos: `gmail.readonly` e `gmail.compose`.
