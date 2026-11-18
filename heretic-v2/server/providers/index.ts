import * as openrouter from "./openrouter";
import * as venice from "./venice";
import * as anthropic from "./anthropic";

export function escolher(model: string) {
  if (model.startsWith("venice:")) return venice.chamar;
  if (model.startsWith("claude")) return anthropic.chamar;
  return openrouter.chamar;
}
