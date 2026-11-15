import OpenAI from "openai";

export const VENICE_BASE_URL = "https://api.venice.ai/api/v1";
export const VENICE_MODEL = "zai-org-glm-5-2";

if (!process.env.VENICE_API_KEY) {
  throw new Error("VENICE_API_KEY is not set (add it to .env)");
}

export const venice = new OpenAI({
  apiKey: process.env.VENICE_API_KEY,
  baseURL: VENICE_BASE_URL,
});
