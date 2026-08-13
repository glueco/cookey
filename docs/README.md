# Cookey documentation

Pick the guide for your role:

- **You own (or want to own) a gateway** → [OWNER_GUIDE.md](OWNER_GUIDE.md)
  — the first-time setup walkthrough: deploy, add a provider key, approve
  your first app.
- **You're building an app that connects to gateways** →
  [APP_DEVELOPER_GUIDE.md](APP_DEVELOPER_GUIDE.md) — write a grant
  document, get a token, call the proxy. You almost certainly don't need
  an SDK.

## Specifications

Normative references — the zod schemas in the codebase are the source of
truth; these documents explain them.

| Spec | Covers |
|---|---|
| [GRANT_SPEC.md](GRANT_SPEC.md) | The grant document: what apps request, how owners approve, lifecycle, credentials |
| [CONNECTOR_SPEC.md](CONNECTOR_SPEC.md) | The connector document: adapters, actions, enforcement rules, install lifecycle |
| [POP_PROTOCOL.md](POP_PROTOCOL.md) | The PoP v1 wire protocol (Ed25519 request signing) |
| [API_REFERENCE.md](API_REFERENCE.md) | Every endpoint, one line each — plus [`openapi.yaml`](openapi.yaml) |

## Reference

- [SECURITY.md](SECURITY.md) — what the gateway enforces, and honestly,
  what it cannot.
- [brand/](brand/) — the Cookey marks and how to use them.
