using CrmAgent;

// Windows service host. Install with: sc.exe create CrmAgent binPath= "...\CrmAgent.exe"
var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddWindowsService(options => options.ServiceName = "CrmAgent");

// Bind local configuration (installer writes appsettings.json / env).
var config = new AgentConfig();
builder.Configuration.GetSection("Agent").Bind(config);
builder.Services.AddSingleton(config);

builder.Services.AddHttpClient<ApiClient>();
builder.Services.AddSingleton<CommandDispatcher>();
builder.Services.AddHostedService<Worker>();

var host = builder.Build();
host.Run();
