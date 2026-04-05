# @glueco/plugin-llm-anthropic

Anthropic Claude LLM plugin for [Glueco Gateway](https://github.com/glueco/gateway).

## Features

- **OpenAI-compatible interface** — Send requests in OpenAI format, automatically converted to Anthropic's Messages API
- **Streaming support** — Anthropic SSE events transformed to OpenAI-compatible chunks
- **Tool calling** — Full support for function/tool calling with format conversion
- **System messages** — Automatically extracted from messages array to Anthropic `system` parameter
- **Policy enforcement** — Model allowlists, token limits, streaming controls

## Supported Models

- `claude-3-5-sonnet-20241022`
- `claude-3-5-haiku-20241022`
- `claude-3-opus-20240229`
- `claude-3-sonnet-20240229`
- `claude-3-haiku-20240307`

## Usage (Target App)

```typescript
import { createTransport } from "@glueco/sdk";
import { anthropic } from "@glueco/plugin-llm-anthropic/client";

const transport = createTransport({
  proxyUrl: "https://gateway.example.com",
  appId: "app_abc123",
});

const claude = anthropic(transport);

const response = await claude.chatCompletions({
  model: "claude-3-5-sonnet-20241022",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "What is the capital of France?" },
  ],
  max_tokens: 1000,
});

console.log(response.data.choices[0].message.content);
```

## Streaming

```typescript
const stream = await claude.chatCompletionsStream({
  model: "claude-3-5-sonnet-20241022",
  messages: [{ role: "user", content: "Tell me a story" }],
});

const reader = stream.stream.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  process.stdout.write(decoder.decode(value));
}
```

## Enabling

Add to `proxy.plugins.ts` at the repository root:

```typescript
const enabledPlugins = [
  "@glueco/plugin-llm-anthropic",
  // ...other plugins
];
```

Then run `npm run build`.

## License

MIT
