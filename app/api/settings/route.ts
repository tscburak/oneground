import { z } from "zod";
import {
  deleteModelProfile,
  getModelSettings,
  saveModelProfile,
  savePreferences,
} from "@/lib/model-settings";

export const runtime = "nodejs";
export async function GET() {
  try {
    return Response.json(getModelSettings(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Could not load saved settings." },
      { status: 500 },
    );
  }
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return Response.json(
        { error: "Cross-origin settings changes are not allowed." },
        { status: 403 },
      );
    const text = await request.text();
    if (text.length > 100_000)
      throw new Error("Settings request is too large.");
    const body = JSON.parse(text);
    if (body.action === "save-model") {
      const input = z
        .object({
          id: z.string().min(1).optional(),
          name: z.string().trim().min(1).max(120),
          kind: z.enum(["system-one", "llm"]),
          model: z.string().trim().min(1).max(200),
          baseUrl: z.string().max(2000),
          prompt: z.string().max(20_000),
          apiKey: z.string().max(8000).optional(),
          clearApiKey: z.boolean().optional(),
          inputPrice: z.number().nonnegative().nullable(),
          outputPrice: z.number().nonnegative().nullable(),
        })
        .parse(body);
      const profile = saveModelProfile(input);
      return Response.json({
        ...getModelSettings(),
        savedProfileId: profile.id,
      });
    }
    if (body.action === "delete-model")
      return Response.json(
        deleteModelProfile(z.string().min(1).parse(body.id)),
      );
    if (body.action === "preferences")
      return Response.json(
        savePreferences(
          z
            .object({
              defaultProfileId: z.string().optional(),
              stateMode: z.enum(["single", "bulk"]).optional(),
              delimiter: z
                .enum(["newline", "comma", "semicolon", "tab", "jsonl"])
                .optional(),
            })
            .parse(body),
        ),
      );
    throw new Error("Unknown settings action.");
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof z.ZodError
            ? "Invalid model/settings fields."
            : error instanceof Error
              ? error.message
              : "Invalid settings request.",
      },
      { status: 400 },
    );
  }
}
