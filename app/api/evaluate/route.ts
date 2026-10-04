import type { NextRequest } from "next/server";
import { getModelProfile, resolveApiKey } from "@/lib/model-settings";

type EvaluateBody = {
  profileId?: string;
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

  let profile;
  try {
    profile = getModelProfile(body.profileId);
    if (profile.kind !== "system-one")
      throw new Error("Playground requires a System One model profile.");
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Invalid saved model.",
      },
      400,
    );
  }
  const model = profile.model;

  if (body.state === undefined || body.state === null) {
    return json({ error: "Field 'state' is required." }, 400);
  }

  if (
    typeof body.questions !== "object" ||
    body.questions === null ||
    Array.isArray(body.questions) ||
    Object.keys(body.questions).length === 0
  ) {
    return json(
      { error: "Field 'questions' must be a non-empty object map." },
      400,
    );
  }

  const customBaseUrl = parseBaseUrl(profile.baseUrl);
  if (!customBaseUrl) {
    return json({ error: "Field 'baseUrl' must be a valid http(s) URL." }, 400);
  }
  const baseUrl = (customBaseUrl ?? HOSTED_BASE_URL).replace(/\/+$/, "");
  const baseUrlObject = new URL(baseUrl);
  const hostedBaseUrlObject = new URL(HOSTED_BASE_URL);
  const provider =
    baseUrlObject.origin === hostedBaseUrlObject.origin ? "hosted" : "local";
  const endpointUrl = new URL(baseUrl);
  const endpointPath = endpointUrl.pathname.replace(/\/+$/, "");
  if (!endpointPath.endsWith("/v1/systemone")) {
    endpointUrl.pathname = `${endpointPath}${endpointPath.endsWith("/v1") ? "/systemone" : "/v1/systemone"}`;
  }
  const systemOneUrl = endpointUrl.toString().replace(/\/$/, "");
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  let apiKey: string | undefined;
  try {
    apiKey = resolveApiKey({
      profileId: profile.id,
      kind: profile.kind,
      baseUrl: profile.baseUrl,
      model,
    });
  } catch {
    return json({ error: "Could not read saved API key." }, 500);
  }
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  } else if (provider === "hosted") {
    return json(
      {
        error: "No saved API key. Add one in Settings for this model profile.",
      },
      500,
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
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    const message =
      provider === "hosted"
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
    return json(
      {
        error: `Upstream returned ${upstream.status}.`,
        status: upstream.status,
        upstream: data,
      },
      upstream.status,
    );
  }

  return json({
    ...(data as object),
    latencyMs,
    provider,
    model:
      typeof data === "object" && data && "model" in data ? data.model : model,
  });
}
