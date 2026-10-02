# Default Shared AI Access (v6.3.2)

All visitors can use the server-configured DeepSeek model without logging in,
entering a browser API key, or supplying a shared access token. Legacy
AI_ACCESS_TOKEN and AI_ALLOW_PUBLIC variables no longer affect access.
The actual DEEPSEEK_API_KEY remains in the CloudBase function environment only.
Optional personal API keys remain supported.

The settings token input and the hotspot browser-Key diagnostic are removed.
Both the Next.js source and the competition-static frontend include these changes.
Publish the backend and upload the matching static build to update both sides.

Existing analysis caches, deduplication, concurrency limits and per-process call
caps remain. They are not an account-wide spending cap: multiple instances can
each consume their own allowance. Anyone with the public URL can consume the
configured AI account quota; monitor provider spending.

Release acceptance checks the version, passive AI health accessMode=public,
and an anonymous empty AI request returning input validation (400, not 401/403).
That empty request does not invoke the paid model. Offline HTTP regressions
exercise all five AI handlers with a mocked model and no visitor credentials.
