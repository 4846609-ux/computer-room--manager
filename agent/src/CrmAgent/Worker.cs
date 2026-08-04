namespace CrmAgent;

/// <summary>
/// Background service: registers on first run, then keeps a heartbeat and executes
/// any commands returned with it. Reconnects with backoff; a real build also caches
/// the active session to disk for offline recovery (see docs/agent-protocol.md).
/// </summary>
public sealed class Worker : BackgroundService
{
    private readonly ILogger<Worker> _log;
    private readonly AgentConfig _config;
    private readonly ApiClient _api;
    private readonly CommandDispatcher _dispatcher;

    public Worker(ILogger<Worker> log, AgentConfig config, ApiClient api, CommandDispatcher dispatcher)
    {
        _log = log;
        _config = config;
        _api = api;
        _dispatcher = dispatcher;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await EnsureRegisteredAsync(stoppingToken);

        var delay = TimeSpan.FromSeconds(_config.HeartbeatSeconds);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var metrics = CollectMetrics();
                var resp = await _api.HeartbeatAsync(_config, metrics, stoppingToken);
                if (resp?.Commands is { Count: > 0 } commands)
                {
                    foreach (var cmd in commands)
                    {
                        var (status, detail) = await _dispatcher.ExecuteAsync(cmd, stoppingToken);
                        await _api.ReportResultAsync(_config, cmd.Id, status, detail, stoppingToken);
                    }
                }
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "Heartbeat failed; will retry");
            }

            await Task.Delay(delay, stoppingToken);
        }
    }

    private async Task EnsureRegisteredAsync(CancellationToken ct)
    {
        if (_config.IsRegistered) return;
        if (string.IsNullOrEmpty(_config.InstallToken))
        {
            _log.LogError("No install token and not registered; cannot start.");
            return;
        }

        // Retry registration with exponential backoff until it succeeds.
        var attempt = 0;
        while (!ct.IsCancellationRequested)
        {
            try
            {
                var reg = await _api.RegisterAsync(_config, ct);
                if (reg is not null)
                {
                    _config.AgentId = reg.AgentId;
                    _config.AgentSecret = reg.AgentSecret;
                    _config.InstallToken = null;
                    _log.LogInformation("Registered as agent {AgentId}", reg.AgentId);
                    // A real build persists credentials to a protected local store here.
                    return;
                }
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "Registration attempt {Attempt} failed", attempt + 1);
            }
            var backoff = TimeSpan.FromSeconds(Math.Min(60, Math.Pow(2, attempt++)));
            await Task.Delay(backoff, ct);
        }
    }

    private object CollectMetrics()
    {
        // A real agent reads CPU/RAM/disk via performance counters and the logged-in
        // user via the session API. Placeholders keep the contract shape here.
        return new
        {
            cpuPercent = 0.0,
            ramPercent = 0.0,
            diskFreeMb = 0,
            loggedInUser = Environment.UserName,
            localIp = "",
            agentVersion = _config.Version,
            antivirusOk = (bool?)null,
        };
    }
}
