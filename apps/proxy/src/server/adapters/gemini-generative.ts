import { z } from "zod";
import type { Adapter, AdapterContext } from "./types";
import type { ActionSpec } from "@/server/connectors/schema";
import type { ChatCompletionRequest } from "@/shared";

// ============================================
// gemini-generative ADAPTER
// messages → contents/parts + systemInstruction; auth via ?key= query
// param; paths /{model}:generateContent and
// /{model}:streamGenerateContent?alt=sse; responses + stream chunks
// converted to OpenAI shape.
// ============================================

const configSchema = z.object({
  baseUrl: z.string().url(),
});

// ---- request translation ----

interface GeminiContent {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: Array<{ text: string }> };
  generationConfig?: {
    temperature?: number;
    topP?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
  };
}

function convertToGeminiFormat(request: ChatCompletionRequest): GeminiRequest {
  const contents: GeminiContent[] = [];
  let systemInstruction: { parts: Array<{ text: string }> } | undefined;

  for (const message of request.messages) {
    if (message.role === "system") {
      const text = typeof message.content === "string" ? message.content : "";
      systemInstruction = { parts: [{ text }] };
    } else {
      const role = message.role === "assistant" ? "model" : "user";
      const parts: Array<{ text: string }> = [];

      if (typeof message.content === "string") {
        parts.push({ text: message.content });
      } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === "text" && part.text) {
            parts.push({ text: part.text });
          }
        }
      } else if (message.content === null) {
        parts.push({ text: "" });
      }

      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }
  }

  const geminiRequest: GeminiRequest = { contents };
  if (systemInstruction) geminiRequest.systemInstruction = systemInstruction;

  const generationConfig: GeminiRequest["generationConfig"] = {};
  if (request.temperature !== undefined)
    generationConfig.temperature = request.temperature;
  if (request.top_p !== undefined) generationConfig.topP = request.top_p;
  if (request.max_tokens !== undefined)
    generationConfig.maxOutputTokens = request.max_tokens;
  if (request.stop) {
    generationConfig.stopSequences = Array.isArray(request.stop)
      ? request.stop
      : [request.stop];
  }
  if (Object.keys(generationConfig).length > 0) {
    geminiRequest.generationConfig = generationConfig;
  }

  return geminiRequest;
}

// ---- response translation ----

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }>; role?: string };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

function mapFinishReason(reason?: string): string {
  switch (reason) {
    case "STOP":
      return "stop";
    case "MAX_TOKENS":
      return "length";
    case "SAFETY":
    case "RECITATION":
      return "content_filter";
    default:
      return "stop";
  }
}

function convertToOpenAIFormat(geminiResponse: GeminiResponse, model: string) {
  const candidate = geminiResponse.candidates?.[0];
  const content =
    candidate?.content?.parts?.map((p) => p.text || "").join("") || "";

  return {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: model.replace("models/", ""),
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: mapFinishReason(candidate?.finishReason),
      },
    ],
    usage: {
      prompt_tokens: geminiResponse.usageMetadata?.promptTokenCount || 0,
      completion_tokens:
        geminiResponse.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: geminiResponse.usageMetadata?.totalTokenCount || 0,
    },
  };
}

function convertStreamChunkToOpenAI(geminiChunk: GeminiResponse, model: string) {
  const candidate = geminiChunk.candidates?.[0];
  const content =
    candidate?.content?.parts?.map((p) => p.text || "").join("") || "";

  return {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: model.replace("models/", ""),
    choices: [
      {
        index: 0,
        delta: { content },
        finish_reason: candidate?.finishReason
          ? mapFinishReason(candidate.finishReason)
          : null,
      },
    ],
  };
}

function transformGeminiStream(
  input: ReadableStream<Uint8Array>,
  model: string,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream({
    async start(controller) {
      const reader = input.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);

              if (data === "[DONE]") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                continue;
              }

              try {
                const geminiChunk = JSON.parse(data) as GeminiResponse;
                const openaiChunk = convertStreamChunkToOpenAI(
                  geminiChunk,
                  model,
                );
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(openaiChunk)}\n\n`),
                );
              } catch {
                // Skip malformed chunks
              }
            }
          }
        }
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

// ---- adapter ----

export const geminiGenerativeAdapter: Adapter = {
  id: "gemini-generative",
  configSchema,

  buildRequest(action: ActionSpec, input: unknown, ctx: AdapterContext, opts) {
    const config = ctx.config as { baseUrl: string };
    const request = input as ChatCompletionRequest;

    // Gemini paths embed the model: /{model}:generateContent
    let modelName = request.model;
    if (!modelName.startsWith("models/")) {
      modelName = `models/${modelName}`;
    }

    const baseUrl = config.baseUrl.replace(/\/$/, "");
    const url = opts.stream
      ? `${baseUrl}/${modelName}:streamGenerateContent?alt=sse&key=${encodeURIComponent(ctx.secret)}`
      : `${baseUrl}/${modelName}:generateContent?key=${encodeURIComponent(ctx.secret)}`;

    return {
      url,
      method: action.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(convertToGeminiFormat(request)),
    };
  },

  async parseResponse(_action, response, opts) {
    // Model is recoverable from the request URL; response translation
    // stores it on the parsed body instead (Gemini omits it).
    const model = modelFromUrl(response.url);
    if (opts.stream) {
      return {
        stream: transformGeminiStream(response.body!, model),
        contentType: "text/event-stream",
      };
    }
    const geminiResponse = (await response.json()) as GeminiResponse;
    return {
      response: convertToOpenAIFormat(geminiResponse, model),
      contentType: "application/json",
    };
  },
};

function modelFromUrl(url: string): string {
  const match = /\/(models\/[^:]+):/.exec(url);
  return match ? match[1] : "gemini";
}
