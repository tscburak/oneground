import type { NextRequest } from "next/server";

type EvaluateBody = {
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  state: unknown;
  questions: unknown;
};

const HOSTED_BASE_URL = "https://api.typesafe.ai";

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

  const model = body.model?.trim() || "jev-latest";

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

  const customBaseUrl = parseBaseUrl(body.baseUrl);
  if (body.baseUrl?.trim() && !customBaseUrl) {
    return json({ error: "Field 'baseUrl' must be a valid http(s) URL." }, 400);
  }
  const baseUrl = (customBaseUrl ?? HOSTED_BASE_URL).replace(/\/+$/, "");
  const baseUrlObject = new URL(baseUrl);
  const hostedBaseUrlObject = new URL(HOSTED_BASE_URL);
  const provider = baseUrlObject.origin === hostedBaseUrlObject.origin ? "hosted" : "local";
  const endpointUrl = new URL(baseUrl);
  const endpointPath = endpointUrl.pathname.replace(/\/+$/, "");
  if (!endpointPath.endsWith("/v1/systemone")) {
    endpointUrl.pathname = `${endpointPath}${endpointPath.endsWith("/v1") ? "/systemone" : "/v1/systemone"}`;
  }
  const systemOneUrl = endpointUrl.toString().replace(/\/$/, "");
  const headers: Record<string, string> = { "content-type": "application/json" };

  const apiKey = body.apiKey?.trim() || (provider === "hosted" ? process.env.TYPESAFE_API_KEY : undefined);
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  } else if (provider === "hosted") {
    return json(
      { error: "No API key. Set one in the UI or set TYPESAFE_API_KEY on the server." },
      500
    );
  }

  const payload = { state: body.state, model, questions: body.questions };
  const started = performance.now();

  let upstream: Response;
  try {
    upstream = await fetch(systemOneUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const message = provider === "hosted"
      ? `Could not reach ${baseUrl}.`
      : `Could not reach the local System One server at ${baseUrl}. Is it running?`;
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
