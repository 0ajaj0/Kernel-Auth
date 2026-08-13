#include "KernelAuth.h"

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winhttp.h>
#pragma comment(lib, "winhttp.lib")

#include <sstream>

namespace KernelAuth {

static std::wstring ToWide(const std::string& s) {
    if (s.empty()) return L"";
    int len = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, nullptr, 0);
    std::wstring out(len - 1, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, out.data(), len);
    return out;
}

KernelAuthClient::KernelAuthClient(const std::string& ownerId_,
                                   const std::string& appName_,
                                   const std::string& version_,
                                   const std::string& secret_,
                                   const std::string& apiBase)
    : baseUrl(apiBase), ownerId(ownerId_), appName(appName_), version(version_), secret(secret_) {}

std::string KernelAuthClient::JsonEscape(const std::string& s) {
    std::string o;
    for (char c : s) {
        if (c == '"') o += "\\\"";
        else if (c == '\\') o += "\\\\";
        else o += c;
    }
    return o;
}

std::string KernelAuthClient::ExtractJsonString(const std::string& json, const std::string& key) {
    const std::string needle = "\"" + key + "\":\"";
    size_t p = json.find(needle);
    if (p == std::string::npos) return "";
    p += needle.size();
    size_t e = json.find('"', p);
    if (e == std::string::npos) return "";
    return json.substr(p, e - p);
}

bool KernelAuthClient::ExtractJsonBool(const std::string& json, const std::string& key) {
    const std::string needle = "\"" + key + "\":";
    size_t p = json.find(needle);
    if (p == std::string::npos) return false;
    p += needle.size();
    return json.compare(p, 4, "true") == 0;
}

std::string KernelAuthClient::PostJson(const std::string& endpoint, const std::string& jsonBody) {
    URL_COMPONENTS uc{};
    uc.dwStructSize = sizeof(uc);
    std::wstring wurl = ToWide(baseUrl + "/" + endpoint);
    uc.dwSchemeLength = uc.dwHostNameLength = uc.dwUrlPathLength = (DWORD)-1;
    if (!WinHttpCrackUrl(wurl.c_str(), 0, 0, &uc)) return "";

    HINTERNET session = WinHttpOpen(L"KernelAuth/1.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, nullptr, nullptr, 0);
    if (!session) return "";

    std::wstring host(uc.lpszHostName, uc.dwHostNameLength);
    HINTERNET connect = WinHttpConnect(session, host.c_str(), uc.nPort, 0);
    if (!connect) { WinHttpCloseHandle(session); return ""; }

    std::wstring path(uc.lpszUrlPath, uc.dwUrlPathLength);
    HINTERNET request = WinHttpOpenRequest(connect, L"POST", path.c_str(), nullptr, WINHTTP_NO_REFERER,
        WINHTTP_DEFAULT_ACCEPT_TYPES, uc.nScheme == INTERNET_SCHEME_HTTPS ? WINHTTP_FLAG_SECURE : 0);
    if (!request) {
        WinHttpCloseHandle(connect); WinHttpCloseHandle(session); return "";
    }

    const wchar_t* headers = L"Content-Type: application/json\r\n";
    BOOL ok = WinHttpSendRequest(request, headers, (DWORD)-1, (LPVOID)jsonBody.data(), (DWORD)jsonBody.size(), (DWORD)jsonBody.size(), 0);
    if (!ok || !WinHttpReceiveResponse(request, nullptr)) {
        WinHttpCloseHandle(request); WinHttpCloseHandle(connect); WinHttpCloseHandle(session); return "";
    }

    std::string body;
    DWORD avail = 0;
    do {
        if (!WinHttpQueryDataAvailable(request, &avail) || !avail) break;
        std::string chunk(avail, '\0');
        DWORD read = 0;
        if (!WinHttpReadData(request, chunk.data(), avail, &read)) break;
        chunk.resize(read);
        body += chunk;
    } while (avail > 0);

    WinHttpCloseHandle(request);
    WinHttpCloseHandle(connect);
    WinHttpCloseHandle(session);
    return body;
}

bool KernelAuthClient::Init() {
    response = {};
    std::ostringstream payload;
    payload << "{"
            << "\"owner_id\":\"" << JsonEscape(ownerId) << "\","
            << "\"app_name\":\"" << JsonEscape(appName) << "\","
            << "\"version\":\"" << JsonEscape(version) << "\""
            << "}";

    const std::string raw = PostJson("v2-init", payload.str());
    if (raw.empty()) {
        response.message = "No connection to KERNEL Auth server.";
        return false;
    }

    response.success = ExtractJsonBool(raw, "success");
    response.message = ExtractJsonString(raw, "message");
    if (!response.success) {
        if (response.message.empty()) response.message = "Init failed.";
        return false;
    }

    sessionId = ExtractJsonString(raw, "session_id");
    initialized = !sessionId.empty();
    if (!initialized) {
        response.message = "Missing session_id from server.";
        return false;
    }
    response.message = "Initialized";
    return true;
}

bool KernelAuthClient::Login(const std::string& username, const std::string& password) {
    response = {};
    if (!initialized) {
        response.message = "Call Init() first.";
        return false;
    }

    std::ostringstream payload;
    payload << "{"
            << "\"session_id\":\"" << JsonEscape(sessionId) << "\","
            << "\"username\":\"" << JsonEscape(username) << "\","
            << "\"password\":\"" << JsonEscape(password) << "\""
            << "}";

    const std::string raw = PostJson("v2-login", payload.str());
    response.success = ExtractJsonBool(raw, "success");
    response.message = ExtractJsonString(raw, "message");
    if (!response.success) return false;

    user.username = ExtractJsonString(raw, "username");
    user.email = ExtractJsonString(raw, "email");
    user.subscription = ExtractJsonString(raw, "subscription");
    return true;
}

bool KernelAuthClient::LicenseLogin(const std::string& licenseKey) {
    response = {};
    if (!initialized) {
        response.message = "Call Init() first.";
        return false;
    }

    std::ostringstream payload;
    payload << "{"
            << "\"session_id\":\"" << JsonEscape(sessionId) << "\","
            << "\"license_key\":\"" << JsonEscape(licenseKey) << "\""
            << "}";

    const std::string raw = PostJson("v2-login", payload.str());
    response.success = ExtractJsonBool(raw, "success");
    response.message = ExtractJsonString(raw, "message");
    if (!response.success) return false;

    user.licenseKey = licenseKey;
    user.subscription = ExtractJsonString(raw, "subscription");
    user.expiryDate = ExtractJsonString(raw, "expiry_date");
    return true;
}

} // namespace KernelAuth
