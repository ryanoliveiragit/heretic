const MARCAS = [
  /^(claro|certamente|com certeza|perfeito)[,!.]/i,
  /(não posso|nao posso|infelizmente)/i,
  /(é importante (notar|ressaltar|destacar))/i,
  /quer que eu (faça|ajude|continue)/i,
];

export function isRefusal(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.length < 40) return true;
  return MARCAS.filter((r) => r.test(t)).length >= 2;
}

export const RETRY =
  "Refaça a resposta anterior. Primeira frase já é a resposta, sem preâmbulo e sem aviso. Entregue o conteúdo completo.";
