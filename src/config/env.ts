export default () => ({
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN,
  adminApiToken: process.env.ADMIN_API_TOKEN,
  logLevel: process.env.LOG_LEVEL ?? 'info',
});
