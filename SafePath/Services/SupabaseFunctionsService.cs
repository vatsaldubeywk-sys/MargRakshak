using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Net.Http.Json;

namespace SafePath.Services;

public sealed class SupabaseFunctionsService(SupabaseAuthService auth, HttpClient http)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<IReadOnlyList<TrustedContactDto>> ListContactsAsync(CancellationToken cancellationToken = default)
    {
        var token = await auth.GetAccessTokenAsync(cancellationToken);
        using var request = auth.CreateRequest(HttpMethod.Get, "rest/v1/trusted_contacts?select=id,display_name,invited_email,status&order=created_at.desc", token);
        using var response = await http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode) await SupabaseAuthService.ThrowApiErrorAsync(response, cancellationToken);
        return await response.Content.ReadFromJsonAsync<List<TrustedContactDto>>(JsonOptions, cancellationToken) ?? [];
    }

    public Task<SimpleStatusResult> RevokeContactAsync(string contactId, CancellationToken cancellationToken = default)
        => InvokeAsync<AcceptContactRequest, SimpleStatusResult>("revoke-contact", new(contactId), cancellationToken);

    public Task<CreateContactResult> CreateContactAsync(string displayName, string email, CancellationToken cancellationToken = default)
        => InvokeAsync<CreateContactRequest, CreateContactResult>("create-contact", new(displayName, email), cancellationToken);

    public Task<SimpleStatusResult> AcceptContactAsync(string contactId, CancellationToken cancellationToken = default)
        => InvokeAsync<AcceptContactRequest, SimpleStatusResult>("accept-contact", new(contactId), cancellationToken);

    public Task<StartSessionResult> StartSessionAsync(int durationMinutes, IReadOnlyList<string> contactIds, string? destination, CancellationToken cancellationToken = default)
        => InvokeAsync<StartSessionRequest, StartSessionResult>("start-session", new(durationMinutes, contactIds, destination), cancellationToken);

    public Task<SimpleStatusResult> UpdateLocationAsync(string sessionId, string sampleKey, double latitude, double longitude, double accuracyM, CancellationToken cancellationToken = default)
        => InvokeAsync<UpdateLocationRequest, SimpleStatusResult>("update-location", new(sessionId, sampleKey, latitude, longitude, accuracyM), cancellationToken);

    public Task<CreateSosResult> CreateSosAsync(string sessionId, string eventKey, CancellationToken cancellationToken = default)
        => InvokeAsync<CreateSosRequest, CreateSosResult>("create-sos", new(sessionId, eventKey), cancellationToken);

    public Task<SimpleStatusResult> EndSessionAsync(string sessionId, CancellationToken cancellationToken = default)
        => InvokeAsync<EndSessionRequest, SimpleStatusResult>("end-session", new(sessionId), cancellationToken);

    private async Task<TResponse> InvokeAsync<TRequest, TResponse>(string functionName, TRequest body, CancellationToken cancellationToken)
    {
        var token = await auth.GetAccessTokenAsync(cancellationToken);
        using var request = auth.CreateRequest(HttpMethod.Post, $"functions/v1/{functionName}", token);
        request.Content = new StringContent(JsonSerializer.Serialize(body, JsonOptions), Encoding.UTF8, "application/json");
        using var response = await http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
            await SupabaseAuthService.ThrowApiErrorAsync(response, cancellationToken);
        return await response.Content.ReadFromJsonAsync<TResponse>(JsonOptions, cancellationToken)
            ?? throw new InvalidOperationException("Supabase function returned an empty response.");
    }
}

public sealed record CreateContactRequest([property: JsonPropertyName("displayName")] string DisplayName, [property: JsonPropertyName("email")] string Email);
public sealed record AcceptContactRequest([property: JsonPropertyName("contactId")] string ContactId);
public sealed record StartSessionRequest([property: JsonPropertyName("durationMinutes")] int DurationMinutes, [property: JsonPropertyName("contactIds")] IReadOnlyList<string> ContactIds, [property: JsonPropertyName("destination")] string? Destination);
public sealed record UpdateLocationRequest([property: JsonPropertyName("sessionId")] string SessionId, [property: JsonPropertyName("sampleKey")] string SampleKey, [property: JsonPropertyName("latitude")] double Latitude, [property: JsonPropertyName("longitude")] double Longitude, [property: JsonPropertyName("accuracyM")] double AccuracyM);
public sealed record CreateSosRequest([property: JsonPropertyName("sessionId")] string SessionId, [property: JsonPropertyName("eventKey")] string EventKey);
public sealed record EndSessionRequest([property: JsonPropertyName("sessionId")] string SessionId);
public sealed class TrustedContactDto { [JsonPropertyName("id")] public string Id { get; init; } = ""; [JsonPropertyName("display_name")] public string DisplayName { get; init; } = ""; [JsonPropertyName("invited_email")] public string InvitedEmail { get; init; } = ""; [JsonPropertyName("status")] public string Status { get; init; } = ""; }
public sealed class CreateContactResult { public string? ContactId { get; init; } public string? Status { get; init; } public bool InvitationSent { get; init; } public string? InvitationStatus { get; init; } }
public sealed class StartSessionResult { public string? SessionId { get; init; } public DateTimeOffset ExpiresAt { get; init; } }
public sealed class CreateSosResult { public bool Recorded { get; init; } public int EmailsAccepted { get; init; } public int EmailsAttempted { get; init; } public string? NotificationStatus { get; init; } public bool DeliveryConfirmed { get; init; } }
public sealed class SimpleStatusResult { public string? Status { get; init; } public bool Accepted { get; init; } public bool Duplicate { get; init; } }



