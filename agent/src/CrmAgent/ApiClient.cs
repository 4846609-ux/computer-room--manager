using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace CrmAgent;

public sealed record RegisterResponse(
    [property: JsonPropertyName("agentId")] string AgentId,
    [property: JsonPropertyName("agentSecret")] string AgentSecret);

public sealed record AgentCommand(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("action")] string Action,
    [property: JsonPropertyName("params")] JsonElement Params,
    [property: JsonPropertyName("expiresAt")] DateTimeOffset? ExpiresAt,
    [property: JsonPropertyName("signature")] string? Signature);

public sealed record HeartbeatResponse(
    [property: JsonPropertyName("ok")] bool Ok,
    [property: JsonPropertyName("commands")] List<AgentCommand> Commands);

/// <summary>
/// Thin REST client for the agent endpoints. All calls are authenticated: registration
/// with the single-use install token, subsequent calls with the agent id + secret.
/// </summary>
public sealed class ApiClient
{
    private readonly HttpClient _http;

    public ApiClient(HttpClient http, AgentConfig config)
    {
        _http = http;
        _http.BaseAddress = new Uri(config.ServerUrl.TrimEnd('/') + "/api/v1/");
    }

    public async Task<RegisterResponse?> RegisterAsync(AgentConfig cfg, CancellationToken ct)
    {
        var resp = await _http.PostAsJsonAsync("agent/register", new
        {
            installToken = cfg.InstallToken,
            systemId = cfg.SystemId,
            version = cfg.Version,
        }, ct);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<RegisterResponse>(cancellationToken: ct);
    }

    public async Task<HeartbeatResponse?> HeartbeatAsync(AgentConfig cfg, object metrics, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, "agent/heartbeat")
        {
            Content = JsonContent.Create(metrics),
        };
        req.Headers.Add("x-agent-id", cfg.AgentId);
        req.Headers.Add("x-agent-secret", cfg.AgentSecret);
        var resp = await _http.SendAsync(req, ct);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<HeartbeatResponse>(cancellationToken: ct);
    }

    public async Task ReportResultAsync(AgentConfig cfg, string commandId, string status, string? detail, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, $"agent/commands/{commandId}/result")
        {
            Content = JsonContent.Create(new { status, detail }),
        };
        req.Headers.Add("x-agent-id", cfg.AgentId);
        req.Headers.Add("x-agent-secret", cfg.AgentSecret);
        (await _http.SendAsync(req, ct)).EnsureSuccessStatusCode();
    }
}
