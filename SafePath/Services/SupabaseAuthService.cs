using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SafePath.Services;

public static class SupabaseOptions
{
    // Project URL and publishable key are client configuration, not service-role credentials.
    // Publishable keys are intended for client use; never put a secret/service_role key here.
    public const string ProjectUrl = "https://mhdnpgzfpnthrrzuooek.supabase.co";
    public const string PublishableKey = "sb_publishable_mTC9Zewd8IuYRR1hRodLHQ_WsQy6izw";
}

public sealed class SupabaseAuthService(HttpClient http)
{
    private const string AccessKey = "mr.supabase.access";
    private const string RefreshKey = "mr.supabase.refresh";
    private const string ExpiryKey = "mr.supabase.expiry";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<SupabaseAuthResponse> SignUpAsync(string email, string password, CancellationToken cancellationToken = default)
    {
        var response = await SendAuthAsync("auth/v1/signup", new { email, password }, cancellationToken);
        await SaveIfSessionAsync(response);
        return response;
    }

    public async Task<SupabaseAuthResponse> SignInAsync(string email, string password, CancellationToken cancellationToken = default)
    {
        var response = await SendAuthAsync("auth/v1/token?grant_type=password", new { email, password }, cancellationToken);
        await SaveIfSessionAsync(response);
        return response;
    }

    public async Task SignOutAsync(CancellationToken cancellationToken = default)
    {
        var token = await GetAccessTokenAsync(cancellationToken);
        if (!string.IsNullOrEmpty(token))
        {
            using var request = CreateRequest(HttpMethod.Post, "auth/v1/logout", token);
            using var response = await http.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
                await ThrowApiErrorAsync(response, cancellationToken);
        }
        SecureStorage.Default.Remove(AccessKey);
        SecureStorage.Default.Remove(RefreshKey);
        SecureStorage.Default.Remove(ExpiryKey);
    }

    public async Task<string> GetAccessTokenAsync(CancellationToken cancellationToken = default)
    {
        var token = await SecureStorage.Default.GetAsync(AccessKey);
        var expiry = await SecureStorage.Default.GetAsync(ExpiryKey);
        if (!string.IsNullOrWhiteSpace(token) && long.TryParse(expiry, out var expiresAt) && DateTimeOffset.UtcNow.ToUnixTimeSeconds() < expiresAt - 60)
            return token;

        var refresh = await SecureStorage.Default.GetAsync(RefreshKey);
        if (string.IsNullOrWhiteSpace(refresh))
            throw new InvalidOperationException("Sign in before calling Marg Rakshak services.");

        var renewed = await SendAuthAsync("auth/v1/token?grant_type=refresh_token", new { refresh_token = refresh }, cancellationToken);
        await SaveIfSessionAsync(renewed);
        if (string.IsNullOrWhiteSpace(renewed.AccessToken))
            throw new InvalidOperationException("Your sign-in session expired. Sign in again.");
        return renewed.AccessToken;
    }

    private async Task<SupabaseAuthResponse> SendAuthAsync(string path, object body, CancellationToken cancellationToken)
    {
        EnsureConfigured();
        using var request = CreateRequest(HttpMethod.Post, path);
        request.Content = new StringContent(JsonSerializer.Serialize(body, JsonOptions), Encoding.UTF8, "application/json");
        using var response = await http.SendAsync(request, cancellationToken);
        var text = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw CreateApiError(text, (int)response.StatusCode);
        return JsonSerializer.Deserialize<SupabaseAuthResponse>(text, JsonOptions)
            ?? throw new InvalidOperationException("Supabase returned an empty authentication response.");
    }

    private async Task SaveIfSessionAsync(SupabaseAuthResponse response)
    {
        if (string.IsNullOrWhiteSpace(response.AccessToken) || string.IsNullOrWhiteSpace(response.RefreshToken)) return;
        await SecureStorage.Default.SetAsync(AccessKey, response.AccessToken);
        await SecureStorage.Default.SetAsync(RefreshKey, response.RefreshToken);
        var expiry = response.ExpiresAt > 0 ? response.ExpiresAt : DateTimeOffset.UtcNow.ToUnixTimeSeconds() + Math.Max(response.ExpiresIn, 300);
        await SecureStorage.Default.SetAsync(ExpiryKey, expiry.ToString());
    }

    internal HttpRequestMessage CreateRequest(HttpMethod method, string path, string? accessToken = null)
    {
        EnsureConfigured();
        var request = new HttpRequestMessage(method, new Uri(new Uri(SupabaseOptions.ProjectUrl.TrimEnd('/') + "/"), path));
        request.Headers.TryAddWithoutValidation("apikey", SupabaseOptions.PublishableKey);
        if (!string.IsNullOrWhiteSpace(accessToken)) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        return request;
    }

    internal static void EnsureConfigured()
    {
        if (!Uri.TryCreate(SupabaseOptions.ProjectUrl, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps || string.IsNullOrWhiteSpace(SupabaseOptions.PublishableKey))
            throw new InvalidOperationException("Set SupabaseOptions.ProjectUrl and SupabaseOptions.PublishableKey before using cloud features.");
    }

    internal static async Task ThrowApiErrorAsync(HttpResponseMessage response, CancellationToken token)
        => throw CreateApiError(await response.Content.ReadAsStringAsync(token), (int)response.StatusCode);

    private static SupabaseApiException CreateApiError(string json, int status)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            foreach (var key in new[] { "msg", "message", "error_description", "error" })
                if (doc.RootElement.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String)
                    return new SupabaseApiException(value.GetString() ?? "Supabase request failed.", status);
        }
        catch (JsonException) { }
        return new SupabaseApiException("Supabase request failed.", status);
    }
}

public sealed class SupabaseApiException(string message, int statusCode) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}

public sealed class SupabaseAuthResponse
{
    [JsonPropertyName("access_token")] public string? AccessToken { get; init; }
    [JsonPropertyName("refresh_token")] public string? RefreshToken { get; init; }
    [JsonPropertyName("expires_in")] public long ExpiresIn { get; init; }
    [JsonPropertyName("expires_at")] public long ExpiresAt { get; init; }
    [JsonPropertyName("token_type")] public string? TokenType { get; init; }
    [JsonPropertyName("user")] public SupabaseUser? User { get; init; }
}

public sealed class SupabaseUser
{
    [JsonPropertyName("id")] public string? Id { get; init; }
    [JsonPropertyName("email")] public string? Email { get; init; }
    [JsonPropertyName("email_confirmed_at")] public DateTimeOffset? EmailConfirmedAt { get; init; }
}


