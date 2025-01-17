/** @format */

const redis = require("redis");

// Lấy thông tin cấu hình Redis từ biến môi trường
const redisConfig = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || null,
};
// Khởi tạo Redis client một lần và tái sử dụng
let client;

// Tạo Redis client và kết nối
const createRedisClient = () => {
  if (!client) {
    client = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST || "127.0.0.1",
        port: process.env.REDIS_PORT || 6379,
      },
      password: process.env.REDIS_PASSWORD || null,
    });

    client
      .connect()
      .then(() => console.log("Redis client connected"))
      .catch((err) => console.error("Redis connection error:", err));

    client.on("error", (err) => {
      console.error("Redis error:", err);
    });
  }

  return client;
};

module.exports = createRedisClient;
