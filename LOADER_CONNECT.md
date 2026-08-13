# KERNEL Auth — Loader Connection Guide

## Step 1: Dashboard থেকে credentials নাও

1. https://kernelauth.netlify.app/dashboard/ খোলো
2. **Apps** → তোমার app তৈরি করো
3. **Credentials** ক্লিক → `owner_id`, `app_name`, `secret` copy করো

## Step 2: Loader config সেট করো

```powershell
Copy-Item "$env:USERPROFILE\Desktop\UIEngine\UIEngine\assets\kernel_auth.ini.example" "$env:APPDATA\KERNEL\kernel_auth.ini"
```

`kernel_auth.ini` edit করো — dashboard credentials বসাও।

## Step 3: Google OAuth (Loader Social Login)

1. `%AppData%\KERNEL\oauth.ini` এ Google `client_id` + `client_secret` বসাও
2. Google Cloud Console এ redirect URI:
   - `http://127.0.0.1:42891/callback` (loader)
   - `https://kernelauth.netlify.app/oauth/callback.html` (dashboard)

## Step 4: Netlify Environment Variables

| Variable | Purpose |
|----------|---------|
| `KERNEL_ADMIN_PASSWORD` | Dashboard password login |
| `KERNEL_SITE_URL` | `https://kernelauth.netlify.app` |
| `GOOGLE_CLIENT_ID` | Dashboard + OAuth |
| `GOOGLE_CLIENT_SECRET` | Dashboard + OAuth |
| `KERNEL_ADMIN_EMAIL` | (optional) শুধু এই Gmail dashboard login করতে পারবে |

## API Endpoints (AuthlyX compatible)

| Endpoint | URL |
|----------|-----|
| Init | `POST /api/v2/init` |
| Login | `POST /api/v2/login` |
| Register | `POST /api/v2/register` |
| License | `POST /api/v2/licenses` |
| Extend | `POST /api/v2/extend` |

## Deploy

```powershell
cd "$env:USERPROFILE\Desktop\kernel auth"
git add .
git commit -m "Fix dashboard, OAuth, delete, v2 API, loader connect"
git push
```

Netlify deploy হলে **Ctrl+Shift+R** দিয়ে dashboard refresh করো।
