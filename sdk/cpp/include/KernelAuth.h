#pragma once
// KernelAuth SDK v1.0 — C++ header-only style (single include + one cpp)
// API compatible with AuthlyX-style flow: Init → Login / LicenseLogin

#include <string>

namespace KernelAuth {

struct UserData {
    std::string username;
    std::string email;
    std::string licenseKey;
    std::string subscription;
    std::string subscriptionLevel;
    std::string expiryDate;
    int daysLeft = 0;
};

struct Response {
    bool success = false;
    std::string message;
    int statusCode = 0;
};

class KernelAuthClient {
public:
    KernelAuthClient(const std::string& ownerId,
                     const std::string& appName,
                     const std::string& version,
                     const std::string& secret,
                     const std::string& apiBase = "https://kernelauth.netlify.app/api");

    bool Init();
    bool Login(const std::string& username, const std::string& password);
    bool LicenseLogin(const std::string& licenseKey);

    const Response& GetResponse() const { return response; }
    const UserData& GetUser() const { return user; }
    const std::string& SessionId() const { return sessionId; }

private:
    std::string PostJson(const std::string& endpoint, const std::string& jsonBody);
    static std::string JsonEscape(const std::string& s);
    static std::string ExtractJsonString(const std::string& json, const std::string& key);
    static bool ExtractJsonBool(const std::string& json, const std::string& key);

    std::string baseUrl;
    std::string ownerId;
    std::string appName;
    std::string version;
    std::string secret;
    std::string sessionId;
    bool initialized = false;
    Response response;
    UserData user;
};

} // namespace KernelAuth
