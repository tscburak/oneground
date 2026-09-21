import type { NextRequest } from "next/server";

type EvaluateBody = {
  provider?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  state: unknown;
  questions: unknown;
};

const HOSTED_BASE_URL = "https://api.typesafe.ai";
const LOCAL_BASE_URL = process.env.KEV_BASE_URL?.trim() || "http://127.0.0.1:8008";

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function parseBaseUrl(input: string | undefined): string | null {
  const trimmed = input?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return trimmed;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  let body: EvaluateBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const provider = body.provider === "local" ? "local" : "hosted";
  const model = body.model?.trim() || (provider === "local" ? "kev-latest" : "jev-latest");

  if (body.state === undefined || body.state === null) {
    return json({ error: "Field 'state' is required." }, 400);
  }

  if (
    typeof body.questions !== "object" ||
    body.questions === null ||
    Array.isArray(body.questions) ||
    Object.keys(body.questions).length === 0
  ) {
    return json({ error: "Field 'questions' must be a non-empty object map." }, 400);
  }

  const defaultBaseUrl = provider === "local" ? LOCAL_BASE_URL : HOSTED_BASE_URL;
  const customBaseUrl = parseBaseUrl(body.baseUrl);
  if (body.baseUrl?.trim() && !customBaseUrl) {
    return json({ error: "Field 'baseUrl' must be a valid http(s) URL." }, 400);
  }
  const baseUrl = (customBaseUrl ?? defaultBaseUrl).replace(/\/+$/, "");
  const headers: Record<string, string> = { "content-type": "application/json" };

  const apiKey = body.apiKey?.trim() || process.env.TYPESAFE_API_KEY;
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  } else if (provider === "hosted" && customBaseUrl === null) {
    return json(
      { error: "No API key. Set one in the UI or set TYPESAFE_API_KEY on the server." },
      500
    );
  }

  const payload = { state: body.state, model, questions: body.questions };
  const started = performance.now();

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/v1/systemone`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const message =
      provider === "local"
        ? `Could not reach the local System One server at ${baseUrl}. Is kev running?`
        : `Could not reach ${baseUrl}.`;
    return json({ error: message, cause: String(error) }, 502);
  }

  const latencyMs = Math.round(performance.now() - started);
  const text = await upstream.text();

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!upstream.ok) {
    return json({ error: `Upstream returned ${upstream.status}.`, status: upstream.status, upstream: data }, upstream.status);
  }

  return json({ ...(data as object), latencyMs, provider, model });
}
