---
"@glueco/sdk": patch
---

Remove `PluginClientFactory` and `PluginClient`, leftover type helpers for the old per-provider npm plugin-package pattern that connectors-as-data replaced. Neither was exported from the package entry point, so this isn't a breaking change for anyone actually importing from `@glueco/sdk`.
