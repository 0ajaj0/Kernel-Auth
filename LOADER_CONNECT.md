# Loader Connect — তোমাকে কী কী দিতে হবে

Netlify deploy করার পর loader-এ connect করতে এই জিনিসগুলো দাও:

---

## 1. Netlify site URL (অবশ্যই)

```
https://YOUR-NAME.netlify.app
```

Example: `https://kernel-regedit-auth.netlify.app`

---

## 2. OAuth credentials

### Google (অবশ্যই — Continue with Google এর জন্য)

Google Cloud Console থেকে:

- **Client ID** → loader-এ public থাকতে পারে
- **Client Secret** → শুধু Netlify env-তে (loader-এ লাগবে না যদি server exchange use করি)

**Authorized redirect URI** (Google Console-এ add কর):

```
https://YOUR-SITE.netlify.app/oauth/callback.html
```

---

## 3. Admin password

`KERNEL_ADMIN_PASSWORD` — license key বানানোর জন্য admin panel-এ use হবে।

---

## 4. License system — কোনটা use করবে?

### Option A: KERNEL Auth keys (এই project)

- Admin panel থেকে key বানাবে
- Loader `/api/license-activate` call করবে
- AuthlyX লাগবে না

### Option B: AuthlyX (আগের মতো)

Netlify env-তে দাও:

```
AUTHLYX_OWNER_ID=
AUTHLYX_APP_NAME=
AUTHLYX_VERSION=1.0
AUTHLYX_SECRET=
```

Loader AuthlyX SDK দিয়ে key validate করবে — KERNEL Auth শুধু OAuth UI/hosting।

### Option C: দুটো একসাথে

- OAuth → KERNEL Auth (Netlify)
- License → AuthlyX

---

## 5. Discord / GitHub (optional)

Chaile daw — na dile shudhu Google cholbe.

Discord redirect:
```
https://YOUR-SITE.netlify.app/oauth/callback.html
```

GitHub callback URL:
```
https://YOUR-SITE.netlify.app/oauth/callback.html
```

---

## 6. Loader-এ ki change hobe (ami korbo)

Tomar deploy complete hole ami loader update korbo:

| File | Change |
|------|--------|
| `%AppData%\KERNEL\oauth.ini` | `auth_base_url=https://your-site.netlify.app` |
| `social_auth.cpp` | Browser opens Netlify `/api/oauth-start` instead of direct Google URL |
| Optional | `client_secret` remove — exchange via `/api/oauth-exchange` |
| Optional | License via `/api/license-activate` |

---

## Checklist before telling me "connect koro"

- [ ] Netlify site live (URL opens)
- [ ] `/api/health` returns `{ "ok": true }`
- [ ] Google OAuth redirect URI added
- [ ] Env variables set on Netlify
- [ ] Admin panel works — test key create
- [ ] Site URL copy kore pathao

---

## Example message to send

```
Netlify URL: https://kernel-regedit.netlify.app
Google Client ID: 123456.apps.googleusercontent.com
Using: AuthlyX for keys + KERNEL Auth for OAuth
AuthlyX: owner_id=xxx, app=KERNEL, secret=xxx (DM)
Admin password: (DM only)
```

**Never post Client Secret or AuthlyX Secret publicly — DM only.**
