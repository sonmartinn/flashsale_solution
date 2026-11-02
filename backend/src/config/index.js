import "dotenv/config";

export const config = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27018/flashsale",
  redisUrl: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
};
