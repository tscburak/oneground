import {
  createEvalEntry,
  deleteEvalEntry,
  listEvalEntries,
  parseResource,
  updateEvalEntry,
} from "@/lib/eval-lab/store";

export const runtime = "nodejs";

type Context = { params: Promise<{ resource: string }> };

async function resourceOf(context: Context) {
  return parseResource((await context.params).resource);
}

export async function GET(_request: Request, context: Context) {
  try {
    return Response.json(listEvalEntries(await resourceOf(context)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Could not load the eval library." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const resource = await resourceOf(context);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return Response.json(
        { error: "Cross-origin eval library changes are not allowed." },
        { status: 403 },
      );
    const text = await request.text();
    if (text.length > 5_000_000)
      throw new Error("Eval library request is too large.");
    const body = JSON.parse(text) as { name: unknown; data: unknown };
    return Response.json(createEvalEntry(resource, body));
  } catch (error) {
    const invalid =
      error instanceof Error &&
      /Unknown eval library|too large|Invalid|Expected/i.test(error.message);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not save.",
      },
      { status: invalid ? 400 : 500 },
    );
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    const resource = await resourceOf(context);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return Response.json(
        { error: "Cross-origin eval library changes are not allowed." },
        { status: 403 },
      );
    const text = await request.text();
    if (text.length > 5_000_000)
      throw new Error("Eval library request is too large.");
    const body = JSON.parse(text) as {
      id: unknown;
      name: unknown;
      data: unknown;
    };
    return Response.json(updateEvalEntry(resource, body));
  } catch (error) {
    const invalid =
      error instanceof Error &&
      /Unknown eval library|too large|not found|Invalid|Expected/i.test(
        error.message,
      );
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not update.",
      },
      { status: invalid ? 400 : 500 },
    );
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const resource = await resourceOf(context);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new Error("Missing id.");
    deleteEvalEntry(resource, id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not delete.",
      },
      { status: 400 },
    );
  }
}
