// ============================================
// PRESET TEST REQUESTS
// Local wire-shape types — the gateway speaks OpenAI-style chat for all
// LLM providers, so no per-provider packages are needed.
// ============================================

interface ChatRequest {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

type GeminiRequest = ChatRequest;
type GroqRequest = ChatRequest;
type OpenAIRequest = ChatRequest;

interface SendEmailRequest {
  from: string;
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
}

// ============================================
// TYPES
// ============================================

export interface Preset {
  id: string;
  name: string;
  description: string;
  resourceType: string;
  provider: string;
  method: "GET" | "POST";
  path: string;
  body?: string;
  expectedStatus?: number[];
}

// ============================================
// TYPED REQUEST BUILDERS
// ============================================

/**
 * Build a Groq chat completion request using contract types.
 */
export function buildGroqChatRequest(): GroqRequest {
  return {
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "user",
        content: "Say 'Hello from Demo Target App!' in exactly 5 words.",
      },
    ],
    max_tokens: 50,
  };
}

/**
 * Build a Gemini chat completion request using contract types.
 */
export function buildGeminiChatRequest(): GeminiRequest {
  return {
    model: "gemini-2.5-flash",
    messages: [
      {
        role: "user",
        content: "Say 'Hello from Demo Target App!' in exactly 5 words.",
      },
    ],
    max_tokens: 500,
  };
}

/**
 * Build an OpenAI chat completion request using contract types.
 */
export function buildOpenAIChatRequest(): OpenAIRequest {
  return {
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: "Say 'Hello from Demo Target App!' in exactly 5 words.",
      },
    ],
    max_tokens: 500,
  };
}

/**
 * Build a Resend email request using contract types.
 */
export function buildResendEmailRequest(): SendEmailRequest {
  return {
    from: "test@example.com",
    to: "recipient@example.com",
    subject: "Test from Demo Target App",
    html: "<h1>Hello!</h1><p>This is a test email sent via Personal Resource Gateway.</p>",
  };
}

// ============================================
// PRESETS
// ============================================

export const PRESETS: Preset[] = [
  // Groq
  {
    id: "groq-chat",
    name: "Groq Chat Completions",
    description: "Send a simple chat completion request to Groq",
    resourceType: "llm",
    provider: "groq",
    method: "POST",
    path: "/v1/chat/completions",
    body: JSON.stringify(buildGroqChatRequest(), null, 2),
    expectedStatus: [200],
  },
  // Gemini
  {
    id: "gemini-chat",
    name: "Gemini Chat Completions",
    description: "Send a simple chat completion request to Gemini",
    resourceType: "llm",
    provider: "gemini",
    method: "POST",
    path: "/v1/chat/completions",
    body: JSON.stringify(buildGeminiChatRequest(), null, 2),
    expectedStatus: [200],
  },
  // OpenAI
  {
    id: "openai-chat",
    name: "OpenAI Chat Completions",
    description: "Send a simple chat completion request to OpenAI",
    resourceType: "llm",
    provider: "openai",
    method: "POST",
    path: "/v1/chat/completions",
    body: JSON.stringify(buildOpenAIChatRequest(), null, 2),
    expectedStatus: [200],
  },
  // Resend Email
  {
    id: "resend-send",
    name: "Resend Send Email",
    description: "Send a test email via Resend",
    resourceType: "mail",
    provider: "resend",
    method: "POST",
    path: "/emails/send",
    body: JSON.stringify(buildResendEmailRequest(), null, 2),
    expectedStatus: [200],
  },
];

// ============================================
// RESOURCE TYPE AND PROVIDER HELPERS
// ============================================

export const RESOURCE_TYPES = ["llm", "mail", "storage", "search"];

export const PROVIDERS: Record<string, string[]> = {
  llm: ["groq", "gemini", "openai", "anthropic", "cohere", "mistral"],
  mail: ["sendgrid", "resend", "mailgun"],
  storage: ["s3", "gcs", "azure"],
  search: ["algolia", "elasticsearch", "typesense"],
};

export function getProvidersForType(resourceType: string): string[] {
  return PROVIDERS[resourceType] || [];
}
