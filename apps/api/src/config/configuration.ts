export interface AppConfig {
  env: string;
  port: number;
  host: string;
  corsOrigin: string;
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: number;
    refreshTtl: number;
  };
  argon2: {
    memoryCost: number;
    timeCost: number;
    parallelism: number;
  };
  agent: {
    signingSecret: string;
    installTokenTtl: number;
  };
  nedarim: {
    mosadId: string;
    apiValid: string;
    apiPassword: string;
    iframeUrl: string;
    manageUrl: string;
    callbackMailError: string;
  };
  publicBaseUrl: string;
  redisUrl: string;
}

export default (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.API_PORT ?? '4000', 10),
  host: process.env.API_HOST ?? '0.0.0.0',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me',
    accessTtl: parseInt(process.env.JWT_ACCESS_TTL ?? '900', 10),
    refreshTtl: parseInt(process.env.JWT_REFRESH_TTL ?? '2592000', 10),
  },
  argon2: {
    memoryCost: parseInt(process.env.ARGON2_MEMORY_COST ?? '19456', 10),
    timeCost: parseInt(process.env.ARGON2_TIME_COST ?? '2', 10),
    parallelism: parseInt(process.env.ARGON2_PARALLELISM ?? '1', 10),
  },
  agent: {
    signingSecret: process.env.AGENT_SIGNING_SECRET ?? 'dev-agent-secret-change-me',
    installTokenTtl: parseInt(process.env.AGENT_INSTALL_TOKEN_TTL ?? '86400', 10),
  },
  nedarim: {
    // Nedarim Plus (נדרים פלוס) — iframe integration.
    // mosadId = מספר מוסד (7 digits). apiValid = client-side "API Valid" text
    // (safe to send to the iframe). apiPassword = server-only secret for
    // refunds/history via Manage3.aspx (never sent to the client).
    mosadId: process.env.NEDARIM_MOSAD_ID ?? '',
    apiValid: process.env.NEDARIM_API_VALID ?? '',
    apiPassword: process.env.NEDARIM_API_PASSWORD ?? '',
    iframeUrl: process.env.NEDARIM_IFRAME_URL ?? 'https://www.matara.pro/nedarimplus/iframe/',
    manageUrl: process.env.NEDARIM_MANAGE_URL ?? 'https://matara.pro/nedarimplus/Reports/Manage3.aspx',
    callbackMailError: process.env.NEDARIM_CALLBACK_MAIL_ERROR ?? '',
  },
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:4000',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
});
