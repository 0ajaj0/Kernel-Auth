# KERNEL Auth

Custom social OAuth + license gateway for **KERNEL Loader** (Script Kittens style).

Location: `Desktop\kernel auth`

## What this includes

| Feature | Description |
|---------|-------------|
| **OAuth UI** | Elegant purple KERNEL-themed callback pages |
| **Google / Discord / GitHub** | Server-side token exchange (secrets stay on Netlify) |
| **License keys** | Create keys in Admin panel, activate from loader |
| **Loader API** | REST endpoints the C++ loader can call |
| **AuthlyX ready** | Env vars for AuthlyX — use alongside or instead of built-in keys |

---

## Quick start (local)

```bash
cd "C:\Users\mdaja\Desktop\kernel auth"
copy .env.example .env
npm install
npx netlify dev
```

Open: http://localhost:8888

---

## Netlify deploy (step by step)

### 1. GitHub repo (recommended)

1. Create a new GitHub repo (e.g. `kernel-auth`)
2. Push this folder:

```bash
cd "C:\Users\mdaja\Desktop\kernel auth"
git init
git add .
git commit -m "KERNEL Auth initial"
git remote add origin https://github.com/YOUR_USER/kernel-auth.git
git push -u origin main
```

### 2. Netlify

1. Go to [https://app.netlify.com](https://app.netlify.com)
2. **Add new site → Import an existing project → GitHub**
3. Select your `kernel-auth` repo
4. Build settings (auto-detected from `netlify.toml`):
   - **Publish directory:** `public`
   - **Functions directory:** `netlify/functions`
5. **Deploy site**

### 3. Environment variables

Netlify → **Site configuration → Environment variables** → Add:

| Variable | Required | Example |
|----------|----------|---------|
| `KERNEL_JWT_SECRET` | Yes | random 32+ char string |
| `KERNEL_ADMIN_PASSWORD` | Yes | your admin password |
| `KERNEL_SITE_URL` | Yes | `https://your-name.netlify.app` |
| `GOOGLE_CLIENT_ID` | For Google | from Google Cloud |
| `GOOGLE_CLIENT_SECRET` | For Google | from Google Cloud |
| `DISCORD_CLIENT_ID` | Optional | Discord dev portal |
| `DISCORD_CLIENT_SECRET` | Optional | Discord dev portal |
| `GITHUB_CLIENT_ID` | Optional | GitHub OAuth app |
| `GITHUB_CLIENT_SECRET` | Optional | GitHub OAuth app |

Redeploy after adding variables.

---

## OAuth redirect URLs (IMPORTANT)

Register this callback in **Google / Discord / GitHub**:

```
https://YOUR-SITE.netlify.app/oauth/callback.html?provider=google
https://YOUR-SITE.netlify.app/oauth/callback.html?provider=discord
https://YOUR-SITE.netlify.app/oauth/callback.html?provider=github
```

Some providers accept without query string — use:

```
https://YOUR-SITE.netlify.app/oauth/callback.html
```

Flow:
1. Loader opens browser → `https://YOUR-SITE.netlify.app/api/oauth-start?provider=google&state=XXX`
2. User signs in on Google
3. Google → Netlify callback page (elegant UI)
4. Page redirects code → `http://127.0.0.1:42891/callback?code=...&state=...`
5. Loader receives code (same as now)

---

## API endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Service status |
| `/api/config` | GET | Public config for loader |
| `/api/oauth-start?provider=google&state=xxx` | GET | Start OAuth in browser |
| `/api/oauth-exchange` | POST | Exchange code → profile JSON |
| `/api/license-activate` | POST | Activate license key |
| `/api/license-verify` | POST | Check license status |
| `/api/admin-keys` | GET/POST/DELETE | Admin key management |

### License activate (loader)

```json
POST /api/license-activate
{
  "license_key": "KERNEL-ABCD-EFGH",
  "email": "user@gmail.com",
  "provider_id": "google-id"
}
```

Response:

```json
{
  "ok": true,
  "licensed": true,
  "subscription": "KERNEL Premium",
  "products": ["Counter-Strike 2", "Apex Legends", "Fortnite", "PUBG"]
}
```

---

## Admin panel

URL: `https://YOUR-SITE.netlify.app/admin/`

Use the same password as `KERNEL_ADMIN_PASSWORD` to create keys.

---

## Loader connection (next step)

After Netlify deploy, send your developer:

1. **Netlify site URL** — e.g. `https://kernel-auth.netlify.app`
2. **Google Client ID** (public — can go in loader oauth.ini)
3. Confirm OAuth redirect URLs are registered
4. Whether you use **KERNEL Auth keys** or **AuthlyX** (or both)

Loader will be updated to:
- Open OAuth via your Netlify URL
- Optionally call `/api/oauth-exchange` (no client_secret in loader)
- Optionally call `/api/license-activate` for keys

See `LOADER_CONNECT.md` for the full checklist.
