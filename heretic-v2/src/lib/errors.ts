const FRASES: Record<string, string> = {
  invalid_json: "O pedido saiu malformado. Tente de novo.",
  invalid_request: "Faltou algo no pedido.",
  context_overflow: "A conversa encheu a janela. Compacte para continuar.",
  unauthorized: "Sessão expirada.",
  scope_required: "Esta chave não gera imagem.",
  daily_token_limit: "Você usou os tokens livres de hoje. O Pro libera o dia inteiro.",
  turns_in_flight: "Você já tem respostas sendo escritas. Aguarde uma terminar.",
  upstream_unavailable: "O modelo não respondeu. Tente de novo.",
  internal: "Falhou do nosso lado. Tente de novo.",
};

export const frase = (code?: string) => FRASES[code ?? "internal"] ?? FRASES.internal;
