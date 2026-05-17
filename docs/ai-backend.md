# Visual Deadline AI Backend

Visual Deadline uses a Vercel Serverless Function at `POST /api/ai` so logged-in users can use AI features without putting a provider API key in the browser.

## Runtime behavior

1. The frontend gets the current Supabase session and sends `Authorization: Bearer <supabase_access_token>` to `/api/ai`.
2. The serverless function verifies the token by calling Supabase Auth (`/auth/v1/user`) from the backend.
3. The function validates the AI payload and applies a simple placeholder rate limit of **20 AI requests per user per day**.
4. The function calls DeepSeek's chat completions endpoint from the backend and returns only the generated content, model, and provider name.

The browser never receives `DEEPSEEK_API_KEY`. Developer fallback mode still exists, but it only reads an API key saved in the user's local browser `localStorage`; Visual Deadline does not upload or store that key in Supabase.

## Vercel environment variables

Configure these variables in Vercel Project Settings → Environment Variables:

| Variable | Example | Required | Notes |
| --- | --- | --- | --- |
| `AI_PROVIDER` | `deepseek` | Yes | Currently only `deepseek` is supported. |
| `DEEPSEEK_API_KEY` | `sk-...` | Yes | Backend-only secret. Do **not** prefix with `VITE_`. |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | Yes | The function posts to `${DEEPSEEK_BASE_URL}/chat/completions`. |
| `DEEPSEEK_MODEL` | `deepseek-chat` | Yes | DeepSeek chat model used by VD Cloud AI. |
| `SUPABASE_URL` | `https://<project>.supabase.co` | Yes | Backend Supabase project URL used to verify sessions. Falls back to `VITE_SUPABASE_URL` if absent. |
| `SUPABASE_ANON_KEY` | `<anon-key>` | Yes | Backend Supabase anon key used with the user's bearer token. Falls back to `VITE_SUPABASE_ANON_KEY` if absent. |

The existing frontend variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are still needed by the React app for login and cloud sync.

## API contract

`POST /api/ai`

Headers:

```http
Authorization: Bearer <supabase_access_token>
Content-Type: application/json
```

Request body:

```json
{
  "mode": "task_advice",
  "message": "User prompt or structured prompt text",
  "context": {
    "tasks": [],
    "goals": [],
    "pressure": {}
  }
}
```

Supported `mode` values:

- `task_advice`
- `daily_plan`
- `pressure_analysis`

Successful response:

```json
{
  "ok": true,
  "content": "...",
  "model": "deepseek-chat",
  "provider": "deepseek"
}
```

Error responses are frontend-safe JSON objects such as:

```json
{
  "ok": false,
  "error": "Supabase 登录凭证无效或已过期。"
}
```

## Local testing

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local env file for Vite/Vercel development, for example `.env.local`:

   ```bash
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon-key>
   SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_ANON_KEY=<anon-key>
   AI_PROVIDER=deepseek
   DEEPSEEK_API_KEY=<deepseek-api-key>
   DEEPSEEK_BASE_URL=https://api.deepseek.com
   DEEPSEEK_MODEL=deepseek-chat
   ```

3. Run the Vercel dev server so `/api/ai` and Vite are available together:

   ```bash
   npx vercel dev
   ```

4. Log in through the app. AI features should show `VD Cloud AI 已启用` when no local developer API key is configured.

5. Optional direct API smoke test after logging in and copying the Supabase access token from the browser's `vd.supabase.session` localStorage value:

   ```bash
   curl -i http://localhost:3000/api/ai \
     -H 'Content-Type: application/json' \
     -H 'Authorization: Bearer <supabase_access_token>' \
     -d '{"mode":"task_advice","message":"给我一个今天的任务排序建议","context":{"tasks":[]}}'
   ```

## Vercel testing

1. Add the environment variables listed above for the target Vercel environment (`Production`, `Preview`, or both).
2. Redeploy the project after changing environment variables.
3. Open the deployed app, log in with Supabase Auth, and run an AI feature.
4. If the request fails, check the browser Network tab for `/api/ai` status codes:
   - `401`: missing/expired Supabase session; log in again.
   - `400`: invalid payload or too much input data.
   - `429`: placeholder daily request limit reached for the user on the current function instance.
   - `500`/`502`/`504`: missing backend environment variable, DeepSeek upstream error, or timeout.

## Rate limit note

The current 20-requests-per-user-per-day limit is intentionally a placeholder implemented in serverless function memory. It protects a warm instance but is not durable across cold starts or multiple Vercel instances. A production quota should be moved to a Supabase table or another durable store.
