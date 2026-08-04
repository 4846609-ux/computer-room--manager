using System.Text.Json;

namespace CrmAgent;

/// <summary>
/// Executes ONLY allow-listed commands. Any action outside this set is rejected —
/// the server can never make the agent run free-form shell. Mirrors the shared
/// AGENT_ACTIONS list in packages/shared.
/// </summary>
public sealed class CommandDispatcher
{
    private static readonly HashSet<string> Allowed = new(StringComparer.Ordinal)
    {
        "SHUTDOWN", "RESTART", "LOGOFF_USER", "LOCK", "UNLOCK", "SHOW_MESSAGE",
        "SCREENSHOT", "START_SESSION", "END_SESSION", "SYNC_SETTINGS", "OPEN_APP",
        "CLOSE_APP", "PING", "COLLECT_LOGS", "UPDATE_AGENT", "SCHEDULE_TASK",
        "ENTER_MAINTENANCE", "EXIT_MAINTENANCE",
    };

    private readonly ILogger<CommandDispatcher> _log;

    public CommandDispatcher(ILogger<CommandDispatcher> log) => _log = log;

    public async Task<(string status, string? detail)> ExecuteAsync(AgentCommand cmd, CancellationToken ct)
    {
        if (!Allowed.Contains(cmd.Action))
        {
            _log.LogWarning("Rejected non-allow-listed action {Action}", cmd.Action);
            return ("REJECTED", "action not allowed");
        }

        if (cmd.ExpiresAt is { } exp && exp < DateTimeOffset.UtcNow)
        {
            return ("EXPIRED", "command expired");
        }

        try
        {
            switch (cmd.Action)
            {
                case "PING":
                    return ("SUCCESS", "pong");
                case "LOCK":
                    LockWorkstation();
                    return ("SUCCESS", null);
                case "SHOW_MESSAGE":
                    ShowMessage(cmd.Params);
                    return ("SUCCESS", null);
                case "RESTART":
                    // Real implementation schedules a graceful restart honoring the
                    // afterSessionEnd flag; omitted here for the skeleton.
                    _log.LogInformation("RESTART requested");
                    return ("SUCCESS", "scheduled");
                default:
                    _log.LogInformation("Handling {Action}", cmd.Action);
                    await Task.CompletedTask;
                    return ("SUCCESS", null);
            }
        }
        catch (Exception ex)
        {
            return ("FAILED", ex.Message);
        }
    }

    private void ShowMessage(JsonElement p)
    {
        var body = p.TryGetProperty("body", out var b) ? b.GetString() : null;
        _log.LogInformation("On-screen message: {Body}", body);
        // A real agent renders a top-most notification window to the logged-in user.
    }

    private void LockWorkstation()
    {
        // On Windows this P/Invokes user32!LockWorkStation(); no-op in the skeleton.
        _log.LogInformation("Workstation lock requested");
    }
}
