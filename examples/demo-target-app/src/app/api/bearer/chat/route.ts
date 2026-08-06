import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// ============================================
// POST /api/bearer/chat
// Chat through the gateway using the STOCK openai client — no Cookey
// SDK anywhere. baseURL points at /r/llm/{provider}/v1 and the grant
// token is the api key.
// Body: { gatewayUrl, token, provider, model, messages }
// ============================================

export async function POST(request: NextRequest) {
  let body: {
    gatewayUrl?: string;
    token?: string;
    provider?: string;
    model?: string;
    messages?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { gatewayUrl, token, provider, model, messages } = body;
  if (!gatewayUrl || !token || !provider || !model || !messages) {
    return NextResponse.json(
      { error: "gatewayUrl, token, provider, model and messages are required" },
      { status: 400 },
    );
  }

  const client = new OpenAI({
    baseURL: `${gatewayUrl.replace(/\/$/, "")}/r/llm/${provider}/v1`,
    apiKey: token,
  });

  try {
    const completion = await client.chat.completions.create({
      model,
      messages,
      max_tokens: 512,
    });
    return NextResponse.json({
      content: completion.choices[0]?.message?.content ?? "",
      usage: completion.usage,
    });
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? ((error as { status?: number }).status ?? 502)
        : 502;
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Gateway request failed",
      },
      { status },
    );
  }
}
