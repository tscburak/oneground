import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { evaluate, EvaluationError } from "../lib/lab/evaluators";
import type { Evaluator, Schema } from "../lib/lab/types";
import { saveModelProfile } from "../lib/model-settings";
import { db } from "../lib/lab/store";
import { mkdtempSync, rmdirSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server: Server, baseUrl: string;
const counts = new Map<string, number>();
const priorKey = process.env.LLM_API_KEY;
const directory = mkdtempSync(join(tmpdir(), "oneground-providers-"));
process.env.ONEGROUND_DB_PATH = join(directory, "providers.sqlite");
const profiles = new Map<string, string>();
const schema: Schema = {
  id: "s",
  name: "test",
  createdAt: "",
  drafts: [],
  questions: { urgent: { type: "noul", instructions: "urgent?" } },
};
const config = (kind: Evaluator["kind"], id = kind): Evaluator => ({
  id,
  name: id,
  kind,
  model: "mock-model",
  baseUrl,
  prompt: "test",
  rules: [],
  defaults: { urgent: false },
  inputPrice: null,
  outputPrice: null,
  profileId: profiles.get(kind),
});
before(async () => {
  process.env.LLM_API_KEY = "test-only-key";
  server = createServer(async (request, response) => {
    if (request.headers.authorization !== "Bearer db-test-key") {
      response.statusCode = 401;
      response.end("{}");
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const state = body.state ?? JSON.parse(body.messages[1].content).state;
    counts.set(state, (counts.get(state) ?? 0) + 1);
    response.setHeader("content-type", "application/json");
    if (state === "retry" && counts.get(state) === 1) {
      response.statusCode = 429;
      response.end("{}");
      return;
    }
    if (request.url === "/v1/systemone")
      response.end(
        JSON.stringify({
          model: "mock-pinned",
          answers:
            state === "missing"
              ? {}
              : {
                  urgent: {
                    type: "noul",
                    noul: state === "uncertain" ? 0.51 : 0.9,
                  },
                },
          usage: { input_tokens: 10, output_tokens: 2 },
        }),
      );
    else
      response.end(
        JSON.stringify({
          model: "mock-llm",
          choices: [
            {
              message: {
                content:
                  state === "bad-llm"
                    ? "broken JSON"
                    : '{"answers":{"urgent":true}}',
              },
            },
          ],
          usage: { prompt_tokens: 12, completion_tokens: 3 },
        }),
      );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  for (const kind of ["system-one", "llm"] as const) {
    const profile = saveModelProfile({
      name: kind,
      kind,
      model: "mock-model",
      baseUrl: kind === "llm" ? `${baseUrl}/v1` : baseUrl,
      prompt: "test",
      inputPrice: null,
      outputPrice: null,
      apiKey: "db-test-key",
    });
    profiles.set(kind, profile.id);
  }
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (priorKey === undefined) delete process.env.LLM_API_KEY;
  else process.env.LLM_API_KEY = priorKey;
  db().close();
  unlinkSync(join(directory, "providers.sqlite"));
  if (existsSync(join(directory, ".settings.key")))
    unlinkSync(join(directory, ".settings.key"));
  rmdirSync(directory);
});
test("System One preserves pinned model, probability and token usage", async () => {
  const result = await evaluate(config("system-one"), "valid", schema);
  assert.equal(result.answers.urgent.probability, 0.9);
  assert.equal(result.resolvedModel, "mock-pinned");
  assert.equal(result.inputTokens, 10);
});
test("Rate-limited requests retry, invalid responses retain raw output and billed usage", async () => {
  await evaluate(config("system-one"), "retry", schema);
  assert.equal(counts.get("retry"), 2);
  await assert.rejects(
    () => evaluate(config("system-one"), "missing", schema),
    (error) => {
      assert.ok(error instanceof EvaluationError);
      assert.equal(error.inputTokens, 10);
      assert.ok(error.raw);
      return true;
    },
  );
});
test("LLM output is validated and does not invent a probability", async () => {
  const llm = { ...config("llm"), baseUrl: `${baseUrl}/v1` };
  const result = await evaluate(llm, "valid-llm", schema);
  assert.equal(result.answers.urgent.value, true);
  assert.equal(result.answers.urgent.confidence, undefined);
  assert.equal(result.inputTokens, 12);
  await assert.rejects(
    () => evaluate(llm, "bad-llm", schema),
    (error) => {
      assert.ok(error instanceof EvaluationError);
      assert.equal(error.outputTokens, 3);
      assert.match(JSON.stringify(error.raw), /broken JSON/);
      return true;
    },
  );
});
test("Cascade short-circuits matching rules and escalates uncertain answers", async () => {
  const rules = {
    ...config("rules"),
    rules: [
      {
        question: "urgent",
        path: "",
        operator: "contains" as const,
        value: "urgent",
        output: true,
      },
    ],
  };
  const system = config("system-one"),
    llm = { ...config("llm"), baseUrl: `${baseUrl}/v1` };
  const cascade = {
    ...config("cascade"),
    stages: [rules.id, system.id, llm.id],
    fallbackConfidence: 0.7,
  };
  const evaluators = [rules, system, llm, cascade];
  const result = await evaluate(cascade, "urgent", schema, evaluators);
  assert.equal(result.answers.urgent.source, "rules");
  assert.equal(counts.get("urgent"), undefined);
  const escalated = await evaluate(cascade, "uncertain", schema, evaluators);
  assert.equal(escalated.answers.urgent.source, "llm");
  assert.equal(escalated.inputTokens, 22);
  assert.equal(counts.get("uncertain"), 2);
});
