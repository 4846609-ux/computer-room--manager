namespace CrmAgent;

/// <summary>
/// Local configuration for the workstation agent. The install token and ids are
/// embedded by the per-station installer; credentials are filled after registration.
/// </summary>
public sealed class AgentConfig
{
    public string ServerUrl { get; set; } = "https://localhost:4000";
    public string OrganizationId { get; set; } = "";
    public string BranchId { get; set; } = "";
    public string ComputerId { get; set; } = "";
    public string SystemId { get; set; } = "";

    /// <summary>Single-use installation token (present only until registered).</summary>
    public string? InstallToken { get; set; }

    /// <summary>Persisted after a successful registration.</summary>
    public string? AgentId { get; set; }
    public string? AgentSecret { get; set; }

    public int HeartbeatSeconds { get; set; } = 15;
    public string Version { get; set; } = "1.0.0";

    public bool IsRegistered => !string.IsNullOrEmpty(AgentId) && !string.IsNullOrEmpty(AgentSecret);
}
