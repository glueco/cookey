# Demo Target App

Reference implementation for integrating with a Personal Resource Gateway. Two connection styles, side by side: PoP (server-side signing keys via `@glueco/sdk`) on the home page, and a plain bearer token (no SDK, works with the stock `openai` client) under `/bearer`.

## Features

- **SDK Integration** - `createServerTransport` from `@glueco/sdk` signs every PoP request server-side; the private key never reaches the browser
- **Zero-SDK Bearer Flow** - `/bearer` connects with a static `ck_` token and the stock `openai` client, no gateway-specific code at all
- **Typed Request Presets** - `lib/presets.ts` builds the request bodies the dashboard sends for each connected resource
- **Browser Storage** - Connections and pending sessions tracked in localStorage, keyed per gateway

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
| `openai` | Stock client used by the bearer-token flow |

## Usage

### 1. Connect to Gateway

Get a pairing string from your proxy's admin dashboard and enter it on the home page (or paste a `ck_` token directly on `/bearer`).

### 2. Approve Permissions

You'll be redirected to the proxy to approve the requested permissions.

### 3. Test Endpoints

Use the dashboard to test typed requests to available resources.

## Project Structure

```
src/
├── app/
│   ├── page.tsx                  # PoP connection page
│   ├── bearer/page.tsx           # Zero-SDK bearer-token connection page
│   ├── callback/page.tsx         # Approval redirect landing page
│   ├── dashboard/page.tsx        # Request testing (PoP flow)
│   └── api/
│       ├── connect/             # Prepare + poll grant status
│       ├── invoke/              # Sign and forward a PoP request
│       ├── rotate/              # Rotate the app's signing key
│       └── bearer/              # Grant lookup + chat for the bearer flow
├── lib/
│   ├── gateway.server.ts        # createServerTransport singleton
│   ├── handle.server.ts         # Signed connection-handle issuing/verification
│   ├── discovery.ts             # Fetch a gateway's available resources
│   ├── storage.ts               # Browser storage helpers
│   └── presets.ts               # Typed test request builders
└── components/
    └── DemoMark.tsx              # In-app Cookey mark
```

## Security

- Credentials stored in browser localStorage only
- Session TTL enforced by gateway
- PoP (Proof of Possession) signing for all requests on the home-page flow

## License

Part of the Personal Resource Gateway project.
