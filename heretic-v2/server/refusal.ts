const MARCAS = [
  /^(claro|certamente|com certeza|perfeito)[,!.]/i,
  /(não posso|nao posso|infelizmente|desculpe)/i,
  /(é importante (notar|ressaltar|destacar))/i,
  /quer que eu (faça|ajude|continue)/i,
];

export function isRefusal(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  // Resposta curta e correta ("Paris.") não é recusa: só o vazio e as marcas contam.
  return MARCAS.some((r) => r.test(t));
}

export const RETRY =
  "Refaça a resposta anterior. Primeira frase já é a resposta, sem preâmbulo e sem aviso. Entregue o conteúdo completo.";
