import { describe, it, expect } from "vitest";
import { anthropicMessagesAdapter } from "../anthropic-messages";
import { geminiGenerativeAdapter } from "../gemini-generative";
import { openAiCompatibleAdapter } from "../openai-compatible";
import { mailSendAdapter } from "../mail-send";
import { httpPassthroughAdapter, pathMatchesPattern } from "../http-passthrough";
import type { AdapterContext } from "../types";
import type { ActionSpec, ConnectorDocument } from "@/server/connectors/schema";

// ============================================
// ADAPTER PARITY TESTS
// Each adapter's wire translation is checked against the behavior the
// plugin packages had (the reference implementations that were ported).
// ============================================

const CHAT_ACTION: ActionSpec = {
  method: "POST",
  path: "/chat/completions",
  streaming: true,
};

function ctx(config: Record<string, unknown>, extra?: Partial<AdapterContext>): AdapterContext {
  return {
    secret: "sk-test-secret",
    credentials: { apiKey: "sk-test-secret" },
    config,
    connector: {} as ConnectorDocument,
    ...extra,
  };
}

const CHAT_BODY = {
  model: "test-model",
  messages: [
    { role: "system", content: "You are terse." },
    { role: "user", content: "Hi" },
  ],
  max_tokens: 128,
  temperature: 0.5,
};

describe("openai-compatible", () => {
  it("passes the body through with bearer auth", () => {
    const built = openAiCompatibleAdapter.buildRequest(
      CHAT_ACTION,
      CHAT_BODY,
      ctx({ baseUrl: "https://api.groq.com/openai/v1", auth: { type: "bearer" } }),
      { stream: false },
    );
    expect(built.url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(built.headers.Authorization).toBe("Bearer sk-test-secret");
    expect(JSON.parse(built.body as string)).toEqual(CHAT_BODY);
  });

  it("supports header and query auth styles", () => {
    const header = openAiCompatibleAdapter.buildRequest(
      CHAT_ACTION,
      CHAT_BODY,
      ctx({ baseUrl: "https://x.dev", auth: { type: "header", name: "x-api-key" } }),
      { stream: false },
    );
    expect(header.headers["x-api-key"]).toBe("sk-test-secret");

    const query = openAiCompatibleAdapter.buildRequest(
      CHAT_ACTION,
      CHAT_BODY,
      ctx({ baseUrl: "https://x.dev", auth: { type: "query", name: "key" } }),
      { stream: false },
    );
    expect(query.url).toContain("key=sk-test-secret");
  });

  it("resolves credential placeholders in extraHeaders (OpenAI organization)", () => {
    const built = openAiCompatibleAdapter.buildRequest(
      CHAT_ACTION,
      CHAT_BODY,
      ctx(
        {
          baseUrl: "https://api.openai.com/v1",
          auth: { type: "bearer" },
          extraHeaders: { "OpenAI-Organization": "{credential:organization}" },
        },
        { credentials: { apiKey: "sk-test-secret", organization: "org-123" } },
      ),
      { stream: false },
    );
    expect(built.headers["OpenAI-Organization"]).toBe("org-123");
  });

  it("drops extraHeaders whose credential is unset", () => {
    const built = openAiCompatibleAdapter.buildRequest(
      CHAT_ACTION,
      CHAT_BODY,
      ctx({
        baseUrl: "https://api.openai.com/v1",
        auth: { type: "bearer" },
        extraHeaders: { "OpenAI-Organization": "{credential:organization}" },
      }),
      { stream: false },
    );
    expect(built.headers["OpenAI-Organization"]).toBeUndefined();
  });
});

describe("anthropic-messages", () => {
  const anthropicCtx = ctx({
    baseUrl: "https://api.anthropic.com/v1",
    anthropicVersion: "2023-06-01",
  });
  const action: ActionSpec = { method: "POST", path: "/messages", streaming: true };

  it("extracts the system message and sets Anthropic headers", () => {
    const built = anthropicMessagesAdapter.buildRequest(action, CHAT_BODY, anthropicCtx, {
      stream: false,
    });
    expect(built.url).toBe("https://api.anthropic.com/v1/messages");
    expect(built.headers["x-api-key"]).toBe("sk-test-secret");
    expect(built.headers["anthropic-version"]).toBe("2023-06-01");

    const body = JSON.parse(built.body as string);
    expect(body.system).toBe("You are terse.");
    expect(body.messages).toEqual([{ role: "user", content: "Hi" }]);
    expect(body.max_tokens).toBe(128);
    expect(body.temperature).toBe(0.5);
    expect(body.stream).toBeUndefined();
  });

  it("translates responses back to OpenAI shape", async () => {
    const anthropicResponse = {
      id: "msg_1",
      content: [{ type: "text", text: "Hello!" }],
      model: "claude-3-5-haiku-20241022",
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 4 },
    };
    const result = await anthropicMessagesAdapter.parseResponse(
      action,
      new Response(JSON.stringify(anthropicResponse)),
      { stream: false },
    );
    const openai = result.response as {
      choices: Array<{ message: { content: string }; finish_reason: string }>;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };
    expect(openai.choices[0].message.content).toBe("Hello!");
    expect(openai.choices[0].finish_reason).toBe("stop");
    expect(openai.usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 4,
      total_tokens: 14,
    });
  });

  it("translates SSE stream chunks to OpenAI chunk shape", async () => {
    const sse = [
      'data: {"type":"message_start","message":{"id":"msg_1","model":"claude-3-5-haiku-20241022"}}',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}',
      'data: {"type":"message_stop"}',
      "",
    ].join("\n");

    const result = await anthropicMessagesAdapter.parseResponse(
      action,
      new Response(sse, { headers: { "content-type": "text/event-stream" } }),
      { stream: true },
    );
    const text = await new Response(result.stream).text();
    expect(text).toContain('"object":"chat.completion.chunk"');
    expect(text).toContain('"content":"Hel"');
    expect(text).toContain('"finish_reason":"stop"');
    expect(text).toContain("data: [DONE]");
  });
});

describe("gemini-generative", () => {
  const geminiCtx = ctx({
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  });

  it("converts messages to contents/parts with systemInstruction and ?key= auth", () => {
    const built = geminiGenerativeAdapter.buildRequest(
      { method: "POST", path: "/{model}:generateContent", streaming: true },
      CHAT_BODY,
      geminiCtx,
      { stream: false },
    );
    expect(built.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent?key=sk-test-secret",
    );
    const body = JSON.parse(built.body as string);
    expect(body.systemInstruction).toEqual({ parts: [{ text: "You are terse." }] });
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: "Hi" }] }]);
    expect(body.generationConfig.maxOutputTokens).toBe(128);
  });

  it("uses the streaming endpoint with alt=sse", () => {
    const built = geminiGenerativeAdapter.buildRequest(
      { method: "POST", path: "/{model}:generateContent", streaming: true },
      CHAT_BODY,
      geminiCtx,
      { stream: true },
    );
    expect(built.url).toContain(":streamGenerateContent?alt=sse&key=");
  });

  it("translates responses back to OpenAI shape", async () => {
    const geminiResponse = {
      candidates: [
        { content: { parts: [{ text: "Hello!" }] }, finishReason: "STOP" },
      ],
      usageMetadata: {
        promptTokenCount: 8,
        candidatesTokenCount: 3,
        totalTokenCount: 11,
      },
    };
    const response = new Response(JSON.stringify(geminiResponse));
    Object.defineProperty(response, "url", {
      value:
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=x",
    });
    const result = await geminiGenerativeAdapter.parseResponse(
      { method: "POST", path: "/{model}:generateContent", streaming: false },
      response,
      { stream: false },
    );
    const openai = result.response as {
      model: string;
      choices: Array<{ message: { content: string }; finish_reason: string }>;
      usage: { total_tokens: number };
    };
    expect(openai.model).toBe("gemini-2.5-flash");
    expect(openai.choices[0].message.content).toBe("Hello!");
    expect(openai.usage.total_tokens).toBe(11);
  });
});

describe("mail-send", () => {
  it("normalizes recipients to arrays and posts with bearer auth", () => {
    const built = mailSendAdapter.buildRequest(
      { method: "POST", path: "/emails", streaming: false },
      {
        from: "bot@myapp.com",
        to: "user@example.com",
        subject: "Hi",
        text: "Hello",
        cc: [],
      },
      ctx({ baseUrl: "https://api.resend.com", auth: { type: "bearer" } }),
      { stream: false },
    );
    expect(built.url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(built.body as string);
    expect(body.to).toEqual(["user@example.com"]);
    expect(body.cc).toBeUndefined(); // empty arrays dropped
    expect(built.headers.Authorization).toBe("Bearer sk-test-secret");
  });
});

describe("http-passthrough", () => {
  it("glob path matching: * within a segment, ** across", () => {
    expect(pathMatchesPattern("/v1/images/generate", "/v1/images/*")).toBe(true);
    expect(pathMatchesPattern("/v1/images/a/b", "/v1/images/*")).toBe(false);
    expect(pathMatchesPattern("/v1/images/a/b", "/v1/images/**")).toBe(true);
    expect(pathMatchesPattern("/v2/images/x", "/v1/images/*")).toBe(false);
    expect(pathMatchesPattern("/v1/echo", "/v1/echo")).toBe(true);
  });

  it("forwards raw bytes to baseUrl + subPath with the credential injected", () => {
    const raw = new TextEncoder().encode('{"anything": true}');
    const built = httpPassthroughAdapter.buildRequest(
      { method: "POST", pathPattern: "/v1/**", streaming: false },
      raw,
      ctx({ baseUrl: "https://api.example.com", auth: { type: "bearer" } }, { subPath: "/v1/echo/x?q=1" }),
      { stream: false },
    );
    expect(built.url).toBe("https://api.example.com/v1/echo/x?q=1");
    expect(built.body).toBe(raw);
    expect(built.headers.Authorization).toBe("Bearer sk-test-secret");
  });
});
