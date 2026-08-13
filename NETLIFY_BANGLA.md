# Netlify Deploy — বাংলা গাইড

## ধাপ ১: Folder ready

Desktop-এ আছে: `kernel auth`

## ধাপ ২: GitHub-এ upload

1. GitHub.com → New repository → নাম: `kernel-auth`
2. PowerShell:

```powershell
cd "$env:USERPROFILE\Desktop\kernel auth"
git init
git add .
git commit -m "KERNEL Auth"
git branch -M main
git remote add origin https://github.com/TOMAR_USERNAME/kernel-auth.git
git push -u origin main
```

## ধাপ ৩: Netlify connect

1. [app.netlify.com](https://app.netlify.com) → Login
2. **Add new site → Import from Git**
3. GitHub repo select → Deploy

## ধাপ ৪: Environment Variables

Netlify → Site → **Environment variables** → Add:

```
KERNEL_JWT_SECRET = (random long string)
KERNEL_ADMIN_PASSWORD = (tomar password)
KERNEL_SITE_URL = https://tomar-site.netlify.app
GOOGLE_CLIENT_ID = (Google Console theke)
GOOGLE_CLIENT_SECRET = (Google Console theke)
```

**Deploy → Trigger deploy** (redeploy)

## ধাপ ৫: Google OAuth setup

Google Cloud Console → Credentials → OAuth Client:

**Authorized redirect URI** (exact):

```
https://tomar-site.netlify.app/oauth/callback.html
```

## ধাপ ৬: Test

1. Browser: `https://tomar-site.netlify.app/api/health` → `ok: true`
2. **Dashboard**: `https://tomar-site.netlify.app/dashboard/` → admin password দিয়ে login
3. Dashboard থেকে: Licenses, Users, Social Auth, Variables, Sessions, Logs — সব manage করা যাবে
4. OAuth test: Social Auth page → **Test Flow** button

### Dashboard Pages (AuthlyX-style)

| Page | কাজ |
|------|-----|
| Dashboard | Stats + recent activity |
| Applications | Owner ID, App Secret, API URLs |
| Users | Create, ban, delete users |
| Licenses | Generate, revoke, delete keys |
| Social Auth | Google/Discord/GitHub status + redirect URI |
| Variables | Remote config key/value |
| Sessions | Active loader sessions |
| Logs | Full audit trail |
| Settings | All API endpoints list |

---

## Loader connect er jonno amake pathao

`LOADER_CONNECT.md` file dekho — shekhane list ache.

**Minimum pathate hobe:**
- Netlify URL
- Google Client ID
- AuthlyX use korbe naki KERNEL Auth key
- Admin password (DM)

Deploy complete hole bolba — ami loader connect kore dibo.
