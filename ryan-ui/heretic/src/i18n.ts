// EN / PT-BR for the Heretic app. Same localStorage key as the landing ('heretic-lang'),
// so the choice follows the user between / and /app/. Switching reloads the page.
export type Lang = "en" | "pt";
const KEY = "heretic-lang";

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "pt" || saved === "en") return saved;
  } catch { /* private mode */ }
  return (navigator.language || "").toLowerCase().startsWith("pt") ? "pt" : "en";
}

export const lang: Lang = typeof window === "undefined" ? "en" : detect();
if (typeof document !== "undefined") document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";

export function setLang(next: Lang) {
  if (next === lang) return;
  try { localStorage.setItem(KEY, next); } catch { /* private mode */ }
  location.reload();
}

const PT: Record<string, string> = {
  "New chat": "Nova conversa",
  "Now": "Agora",
  "Copy": "Copiar",
  "Copied": "Copiado",
  "Copy reply": "Copiar resposta",
  "Regenerate": "Refazer",
  "Regenerate reply": "Refazer resposta",
  "Conversations": "Conversas",
  "No messages yet": "Sem mensagens ainda",
  "Stopped": "Parado",
  "Stopped.": "Parado.",
  "Stopped before the reply started.": "Parado antes da resposta começar.",
  "Anonymous": "Anônimo",
  "Free · no account": "Grátis · sem conta",
  "Show conversations": "Mostrar conversas",
  "Ask anything.": "Pergunte qualquer coisa.",
  "Ask anything": "Pergunte qualquer coisa",
  "Messages": "Mensagens",
  "You: ": "Você: ",
  "Heretic is replying": "O Heretic está respondendo",
  "Uncensored. Enter sends, Shift+Enter adds a line.": "Sem censura. Enter envia, Shift+Enter pula linha.",
  "You've hit today's message limit.": "Você atingiu o limite de mensagens de hoje.",
  "Something went wrong: ": "Algo deu errado: ",
  "You've used today's free tokens. They reset at midnight UTC.": "Você usou os tokens grátis de hoje. Eles zeram à meia-noite UTC.",
  "Tokens used today": "Tokens usados hoje",
  "Free": "Grátis",
  "tokens today": "tokens hoje",
  "of": "de",
  "Recon my domain": "Recon no meu domínio",
  "Run recon on example.com: ports open, headers, what sticks out first.": "Faça recon em example.com: portas abertas, cabeçalhos, o que chama atenção primeiro.",
  "Tear apart my writing": "Destrua meu texto",
  "Critique this opening line with no sugarcoating: \"Life is a journey full of lessons.\"": "Critique esta frase de abertura sem rodeios: \"A vida é uma jornada cheia de lições.\"",
  "Stop my DDoS": "Pare meu DDoS",
  "Someone is DDoSing my API endpoint. What do I fix in the next ten minutes?": "Alguém está fazendo DDoS no meu endpoint da API. O que eu corrijo nos próximos dez minutos?",
  "Roast me": "Me zoa",
  "Roast me. I spend more time configuring my editor than writing code.": "Me zoa. Passo mais tempo configurando meu editor do que escrevendo código.",
  "Condense text or a file into key points": "Resume um texto ou arquivo em pontos-chave",
  "Translate into the language you name": "Traduz para o idioma que você disser",
  "Walk through code or an idea step by step": "Explica código ou uma ideia passo a passo",
  "Find and fix the bug in the code": "Acha e corrige o bug no código",
  "Pro models unlock with credits. ": "Modelos Pro liberam com créditos. ",
  "Cost shown is ≈ per 100 messages.": "Custo mostrado ≈ a cada 100 mensagens.",
  "Text files only": "Só arquivos de texto",
  "Over 200 KB": "Mais de 200 KB",
  "Not a text file": "Não é arquivo de texto",
  "Couldn't read the file": "Não deu para ler o arquivo",
  "Stop generating": "Parar resposta",
  "Send message": "Enviar mensagem",
  "Send, after files are read": "Enviar quando os arquivos forem lidos",
  "Send, message is over the limit": "Enviar: mensagem passou do limite",
  "Microphone access is blocked": "O acesso ao microfone está bloqueado",
  "Nothing was heard": "Nada foi ouvido",
  "Dictation stopped": "Ditado parado",
  "Dictation could not start": "O ditado não conseguiu começar",
  "Listening": "Ouvindo",
  "Transcribing": "Transcrevendo",
  "Dictation canceled": "Ditado cancelado",
  "Message Heretic": "Mensagem para o Heretic",
  "Cancel dictation": "Cancelar ditado",
  "Insert the transcript": "Inserir a transcrição",
  "Attach a text file": "Anexar arquivo de texto",
  "Dictate": "Ditar",
  "Stop dictation and insert": "Parar ditado e inserir",
  "Commands": "Comandos",
  "Pasted text": "Texto colado",
  "Pasted file": "Arquivo colado",
  "left": "restantes",
  "over": "a mais",
  "Language": "Idioma",
  "Uncensored": "Sem censura",
  "Pro": "Pro",
};

/** Translate a UI string; unknown strings stay in English. */
export function t(s: string): string {
  return lang === "pt" ? PT[s] ?? s : s;
}
