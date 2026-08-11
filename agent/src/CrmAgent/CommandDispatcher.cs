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
        "ENTER_MAINTENANCE", "EXIT_MAINTENANCE", "APPLY_ACCESS_POLICY",
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
                case "APPLY_ACCESS_POLICY":
                    ApplyAccessPolicy(cmd.Params);
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

    /// <summary>
    /// Enforces a usage access policy on this station: which capabilities are allowed
    /// (internet, email, apps, USB, printing) and whether video is blocked locally
    /// and/or online — separately. In the skeleton we only log the resolved policy;
    /// a production agent applies it via Windows mechanisms:
    ///   - internet/email/site rules → per-user firewall + hosts/proxy allow/block list
    ///   - block video on computer   → block known media players / file associations
    ///   - block video on internet   → block streaming domains + browser policy
    ///   - USB                       → device-installation policy
    /// </summary>
    private void ApplyAccessPolicy(JsonElement p)
    {
        bool Flag(string name, bool fallback = false)
            => p.TryGetProperty(name, out var v) && v.ValueKind is JsonValueKind.True or JsonValueKind.False
                ? v.GetBoolean()
                : fallback;

        var name = p.TryGetProperty("profileName", out var n) ? n.GetString() : "(unnamed)";
        var level = p.TryGetProperty("level", out var l) ? l.GetString() : "CUSTOM";

        _log.LogInformation(
            "Applying access policy '{Name}' ({Level}): computer={Computer} internet={Internet} " +
            "email={Email} apps={Apps} usb={Usb} print={Print} blockVideoPC={VidPC} blockVideoNet={VidNet}",
            name, level,
            Flag("allowComputer", true), Flag("allowInternet", true), Flag("allowEmail", true),
            Flag("allowApps", true), Flag("allowUsb", true), Flag("allowPrinting", true),
            Flag("blockVideoOnComputer"), Flag("blockVideoOnInternet"));

        // TODO (production): translate the flags above into the OS-level controls
        // described in the summary and revert them on END_SESSION.
    }
}
