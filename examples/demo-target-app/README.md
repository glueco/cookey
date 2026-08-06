# Demo Target App

Reference implementation for integrating with a Personal Resource Gateway using the `@glueco/sdk`.

## Features

- **SDK Integration** - Uses `GatewayClient` for connection management and PoP signing
- **Typed Plugin Clients** - Type-safe requests using plugin packages
- **Browser Storage** - Custom localStorage-based storage implementations
- **Modular Integrations** - Clean pattern for adding new resource types

## Installation

```bash
# Clone and navigate
cd examples/demo-target-app

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser.

## Package Dependencies

| Package | Purpose |
|---------|---------|
| `@glueco/sdk` | Gateway client, transport, PoP signing |
| `@glueco/plugin-llm-gemini` | Gemini LLM integration |
| `@glueco/plugin-llm-groq` | Groq LLM integration |
| `@glueco/plugin-llm-openai` | OpenAI LLM integration |
| `@glueco/plugin-mail-resend` | Resend email integration |

## Usage

### 1. Connect to Gateway

Get a pairing string from your proxy's admin dashboard and enter it on the home page.

### 2. Approve Permissions

You'll be redirected to the proxy to approve the requested permissions.

### 3. Test Endpoints

Use the dashboard to test typed requests to available resources.

## Project Structure

```
src/
├── app/
│   ├── page.tsx              # Connection page
│   └── dashboard/page.tsx    # Request testing
├── integrations/
│   ├── llm/
│   │   ├── gemini.ts         # Typed Gemini client
│   │   ├── groq.ts           # Typed Groq client
│   │   └── openai.ts         # Typed OpenAI client
│   └── mail/
│       └── resend.ts         # Typed Resend client
└── lib/
    ├── gateway.ts            # GatewayClient singleton
    ├── storage.ts            # Browser storage implementations
    └── presets.ts            # Test request presets
```

## Documentation

- [SDK Integration Guide](docs/sdk-integration.md) - How to use the SDK
- [Adding Integrations](docs/adding-integrations.md) - How to add new plugins

## Security

- Credentials stored in browser localStorage only
- Session TTL enforced by gateway
- PoP (Proof of Possession) signing for all requests

## License

Part of the Personal Resource Gateway project.
