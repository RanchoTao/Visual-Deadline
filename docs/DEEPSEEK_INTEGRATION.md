# DeepSeek integration

`/api/ai` is the only DeepSeek path. It authenticates the VD user, checks account control, applies a rate-limit boundary, atomically consumes AI quota, invokes the configured provider, and finalizes a usage ledger record. Supported configuration is `VD_AI_PROVIDER=deepseek`, `DEEPSEEK_API_KEY`, `DEEPSEEK_API_BASE_URL`, and `DEEPSEEK_MODEL`.

The browser never receives the DeepSeek key. User-visible AI instructions require concise Simplified Chinese output.
