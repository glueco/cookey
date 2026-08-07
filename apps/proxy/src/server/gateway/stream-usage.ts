import { extractUsage, type ExtractedUsage } from "./enforce";
import type { UsageSpec } from "@/server/connectors/schema";

// ============================================
// STREAMING USAGE EXTRACTION
// LLM adapters emit gateway-canonical (OpenAI-shaped) SSE for streamed
// responses, so usage arrives — when the provider reports it — as a
// `usage` object on one of the `data:` chunks (typically the last).
// This wrapper passes bytes through untouched while scanning each chunk,
// and fires the callback with the final extracted usage when the stream
// ends. Without it, streamed requests would never count against token
// budgets (dailyTokens/monthlyTokens would be a streaming bypass).
// ============================================

export function createUsageScanningStream(
  source: ReadableStream<Uint8Array>,
  usageSpec: UsageSpec,
  onComplete: (usage: ExtractedUsage) => Promise<void>,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let buffer = "";
  let latest: ExtractedUsage = {};

  const scanLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      const parsed = JSON.parse(payload);
      const usage = extractUsage(usageSpec, parsed);
      if (
        usage.totalTokens !== undefined ||
        usage.inputTokens !== undefined ||
        usage.outputTokens !== undefined ||
        usage.model !== undefined
      ) {
        latest = { ...latest, ...usage };
      }
    } catch {
      // Partial or non-JSON chunk — ignore; passthrough is unaffected
    }
  };

  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) scanLine(line);
      },
      async flush() {
        if (buffer) scanLine(buffer);
        if (latest.totalTokens === undefined) {
          const input = latest.inputTokens ?? 0;
          const output = latest.outputTokens ?? 0;
          if (input + output > 0) latest.totalTokens = input + output;
        }
        await onComplete(latest).catch(() => {
          // Usage recording must never break the client's stream
        });
      },
    }),
  );
}
