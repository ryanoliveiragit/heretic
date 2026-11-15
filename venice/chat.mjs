import { venice, VENICE_MODEL } from "./venice.mjs";

const res = await venice.chat.completions.create({
  model: VENICE_MODEL,
  messages: [{ role: "user", content: "Reply with exactly: Venice OK" }],
  max_tokens: 200,
});

console.log("model:", res.model);
console.log("reply:", res.choices[0]?.message?.content);
console.log("usage:", JSON.stringify(res.usage));
