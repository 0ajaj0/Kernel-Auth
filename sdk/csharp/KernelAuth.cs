using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace KernelAuth;

public sealed class KernelAuthClient : IDisposable
{
    private readonly HttpClient _http = new();
    private readonly string _baseUrl;
    private readonly string _ownerId;
    private readonly string _appName;
    private readonly string _version;
    private readonly string _secret;
    private string _sessionId = "";
    private bool _initialized;

    public KernelResponse Response { get; private set; } = new();
    public KernelUser User { get; private set; } = new();

    public KernelAuthClient(string ownerId, string appName, string version, string secret,
        string apiBase = "https://kernelauth.netlify.app/api")
    {
        _ownerId = ownerId;
        _appName = appName;
        _version = version;
        _secret = secret;
        _baseUrl = apiBase.TrimEnd('/');
    }

    public async Task<bool> InitAsync()
    {
        var payload = new { owner_id = _ownerId, app_name = _appName, version = _version };
        var json = await PostAsync("v2-init", payload);
        if (json is null) { Response = new KernelResponse { Message = "No connection." }; return false; }

        Response = ParseResponse(json);
        if (!Response.Success) return false;

        _sessionId = json.RootElement.TryGetProperty("session_id", out var sid) ? sid.GetString() ?? "" : "";
        _initialized = !string.IsNullOrEmpty(_sessionId);
        return _initialized;
    }

    public async Task<bool> LoginAsync(string username, string password)
    {
        if (!_initialized) { Response = new KernelResponse { Message = "Call InitAsync first." }; return false; }
        var payload = new { session_id = _sessionId, username, password };
        var json = await PostAsync("v2-login", payload);
        if (json is null) return false;
        Response = ParseResponse(json);
        if (!Response.Success) return false;
        User.Username = GetString(json, "username");
        User.Email = GetString(json, "email");
        User.Subscription = GetString(json, "subscription");
        return true;
    }

    public async Task<bool> LicenseLoginAsync(string licenseKey)
    {
        if (!_initialized) { Response = new KernelResponse { Message = "Call InitAsync first." }; return false; }
        var payload = new { session_id = _sessionId, license_key = licenseKey };
        var json = await PostAsync("v2-login", payload);
        if (json is null) return false;
        Response = ParseResponse(json);
        if (!Response.Success) return false;
        User.LicenseKey = licenseKey;
        User.Subscription = GetString(json, "subscription");
        User.ExpiryDate = GetString(json, "expiry_date");
        return true;
    }

    private async Task<JsonDocument?> PostAsync(string endpoint, object body)
    {
        var content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
        var res = await _http.PostAsync($"{_baseUrl}/{endpoint}", content);
        var text = await res.Content.ReadAsStringAsync();
        Response.StatusCode = (int)res.StatusCode;
        try { return JsonDocument.Parse(text); }
        catch { return null; }
    }

    private static KernelResponse ParseResponse(JsonDocument doc)
    {
        var root = doc.RootElement;
        return new KernelResponse
        {
            Success = root.TryGetProperty("success", out var s) && s.GetBoolean(),
            Message = root.TryGetProperty("message", out var m) ? m.GetString() ?? "" : ""
        };
    }

    private static string GetString(JsonDocument doc, string key)
        => doc.RootElement.TryGetProperty(key, out var v) ? v.GetString() ?? "" : "";

    public void Dispose() => _http.Dispose();
}

public class KernelResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = "";
    public int StatusCode { get; set; }
}

public class KernelUser
{
    public string Username { get; set; } = "";
    public string Email { get; set; } = "";
    public string LicenseKey { get; set; } = "";
    public string Subscription { get; set; } = "";
    public string ExpiryDate { get; set; } = "";
    public int DaysLeft { get; set; }
}
