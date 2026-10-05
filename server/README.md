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

## Música (YouTube)

Peça "toca Legião Urbana" e o VECNA toca num player dentro do app (pausar, continuar, próxima, parar, volume).
Funciona sem configuração extra, lendo a busca do YouTube. Se parar de funcionar, use a API oficial (grátis):

1. Em https://console.cloud.google.com/apis/library/youtube.googleapis.com ative a **YouTube Data API v3**.
2. Em Credenciais, crie uma **Chave de API**.
3. Inicie o servidor com `YOUTUBE_API_KEY=sua-chave`.

Alguns vídeos de gravadoras não permitem incorporação; nesse caso o VECNA tenta automaticamente o próximo resultado.

## Voz de estúdio (ElevenLabs, opcional)

Em ⚙ Configurações, cole a chave da ElevenLabs (elevenlabs.io → Developers → API Keys) para o VECNA falar com uma voz
masculina natural em qualquer celular. O Voice ID padrão é o da voz Adam; para trocar, copie o ID de outra voz de "My Voices".
Em branco ou com erro (chave inválida, sem créditos, sem internet), o VECNA usa a voz do aparelho.
Frases curtas e repetidas (como a saudação inicial) ficam em cache no aparelho e não gastam créditos de novo.

## Memória do VECNA (compartilhada)

As anotações que o VECNA guarda (inclusive descrições das imagens que você envia) ficam em `server/.memory.json` no PC,
e todo aparelho conectado ao servidor enxerga as mesmas memórias. Sem servidor configurado, a memória fica só no aparelho
e é enviada ao servidor na próxima conversa em que ele estiver disponível.
