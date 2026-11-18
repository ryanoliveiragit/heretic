export type Code =
  | "invalid_json" | "invalid_request" | "context_overflow" | "unauthorized"
  | "scope_required" | "daily_token_limit" | "turns_in_flight"
  | "upstream_unavailable" | "internal";

const STATUS: Record<Code, number> = {
  invalid_json: 400, invalid_request: 400, context_overflow: 400, unauthorized: 401,
  scope_required: 403, daily_token_limit: 429, turns_in_flight: 429,
  upstream_unavailable: 502, internal: 500,
};

const TIPO: Record<Code, string> = {
  invalid_json: "invalid_request_error", invalid_request: "invalid_request_error",
  context_overflow: "invalid_request_error", unauthorized: "authentication_error",
  scope_required: "permission_error", daily_token_limit: "rate_limit_error",
  turns_in_flight: "rate_limit_error", upstream_unavailable: "api_error", internal: "api_error",
};

export function erro(code: Code, message: string) {
  return new Response(JSON.stringify({ error: { message, type: TIPO[code], code } }), {
    status: STATUS[code],
    headers: { "Content-Type": "application/json" },
  });
}

export function ok(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
}
