# KernelAuth SDK

AuthlyX-style SDK for **KERNEL Auth** (`https://kernelauth.netlify.app`).

## Get credentials

Dashboard → **Applications** → **Credentials** → copy:
- Owner ID
- App Name
- App Secret

## C++ (Windows)

```cpp
#include "KernelAuth.h"

KernelAuth::KernelAuthClient auth(
    "owner-id-here",
    "My App",
    "1.0",
    "secret-here"
);

auth.Init();
auth.LicenseLogin("KERNEL-XXXX-XXXX");
// or auth.Login("username", "password");
```

Files:
- `sdk/cpp/include/KernelAuth.h`
- `sdk/cpp/src/KernelAuth.cpp`
- `sdk/cpp/example/main.cpp`

Link: `winhttp.lib`

## C#

```csharp
var auth = new KernelAuthClient("owner-id", "My App", "1.0", "secret");
await auth.InitAsync();
await auth.LicenseLoginAsync("KERNEL-XXXX-XXXX");
```

Files:
- `sdk/csharp/KernelAuth.cs`
- `sdk/csharp/Example/Program.cs`

## API endpoints used

| Method | Endpoint |
|--------|----------|
| Init | `POST /api/v2-init` |
| Login | `POST /api/v2-login` |
| License | `POST /api/license-activate` (optional) |

## OAuth (loader)

Social login uses Netlify OAuth — see `LOADER_CONNECT.md`.
