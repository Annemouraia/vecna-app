// vecna-dividendos.js
// Módulo de análise de dividendos para o VECNA (PWA)
// Busca ativos da B3 com melhor dividend yield via Brapi API
// Token gratuito em: https://brapi.dev/dashboard

const BRAPI_TOKEN = "SEU_TOKEN_AQUI"; // cole seu token gratuito da Brapi aqui

const DIVIDEND_KEYWORDS = [
  "dividendo", "dividendos", "onde investir", "melhores ações",
  "proventos", "dividend yield", "renda passiva"
];

/**
 * Detecta se a mensagem do usuário é sobre dividendos/investimentos,
 * para o VECNA decidir se deve acionar este módulo.
 */
function isDividendQuery(text) {
  const lower = text.toLowerCase();
  return DIVIDEND_KEYWORDS.some((k) => lower.includes(k));
}

/**
 * Busca e ranqueia ativos por dividend yield na B3.
 * @param {Object} opts
 * @param {number} opts.limit - quantos ativos retornar
 * @param {number} opts.minYield - dividend yield mínimo (%) para entrar no ranking
 * @param {string} opts.type - "stock" | "fund" (FIIs) | "bdr"
 */
async function getTopDividendPicks({ limit = 10, minYield = 4, type = "stock" } = {}) {
  const url = `https://brapi.dev/api/quote/list?token=${BRAPI_TOKEN}&sortBy=dividendYield&sortOrder=desc&limit=${limit}&type=${type}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Erro ao consultar Brapi: ${res.status}`);
  }
  const data = await res.json();

  // OBS: confira o nome exato do campo na resposta atual da Brapi
  // (costuma ser "stocks" ou "indexes" dependendo do endpoint/versão).
  const lista = data.stocks || data.indexes || [];

  return lista
    .filter((s) => s.dividendYield && s.dividendYield >= minYield)
    .map((s) => ({
      ticker: s.stock,
      nome: s.name,
      preco: s.close,
      dividendYield: s.dividendYield,
      setor: s.sector || "não informado",
      variacao: s.change,
    }));
}

/**
 * Formata o ranking em texto pronto para o VECNA falar/exibir.
 */
function formatForChat(ranked) {
  if (!ranked.length) {
    return "Não encontrei ativos com dividend yield acima do critério definido no momento.";
  }
  const linhas = ranked.map(
    (a, i) =>
      `${i + 1}. ${a.ticker} (${a.nome}) — DY: ${a.dividendYield.toFixed(2)}% — R$ ${a.preco.toFixed(2)}`
  );
  return (
    `Aqui estão os ativos com melhor dividend yield agora:\n\n${linhas.join("\n")}\n\n` +
    `Lembrete: dividend yield alto nem sempre significa qualidade — vale checar payout ratio ` +
    `e consistência histórica de pagamento antes de decidir.`
  );
}

/*
 * INTEGRAÇÃO NO VECNA (exemplo)
 * No handler que processa a mensagem do usuário antes de chamar a Claude API:
 *
 * import { isDividendQuery, getTopDividendPicks, formatForChat } from "./vecna-dividendos.js";
 *
 * async function handleUserMessage(text) {
 *   if (isDividendQuery(text)) {
 *     const ranked = await getTopDividendPicks();
 *     const resumo = formatForChat(ranked);
 *     const prompt = `Dados atuais de dividendos da B3:\n${resumo}\n\n` +
 *                    `Responda como VECNA, em pt-BR, no seu tom direto de sempre, ` +
 *                    `resumindo isso pra Anne de forma natural.`;
 *     return await callClaudeAPI(prompt); // função já existente no VECNA
 *   }
 *   return await callClaudeAPI(text); // fluxo normal do chat
 * }
 */

export { isDividendQuery, getTopDividendPicks, formatForChat };
