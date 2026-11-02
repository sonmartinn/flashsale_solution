import { Router } from "express";
import mongoose from "mongoose";
import { redis } from "../config/redis.js";
import { notImplemented } from "../middlewares/error.js";
import { login, register } from "../controllers/auth.controller.js";
import { getProduct, listProducts } from "../controllers/product.controller.js";
import { buy, getSale, listActiveSales } from "../controllers/sale.controller.js";

export const router = Router();

router.get("/health", async (req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;
  const redisOk = await redis.ping().then((r) => r === "PONG").catch(() => false);
  res.status(mongoOk && redisOk ? 200 : 503).json({ mongo: mongoOk, redis: redisOk });
});

router.post("/auth/register", register);
router.post("/auth/login", login);

router.get("/products", listProducts);
router.get("/products/:id", getProduct);

router.get("/sales/active", listActiveSales);
router.get("/sales/:id", getSale);
router.post("/sales/:id/buy", buy);

router.get("/orders/me", notImplemented("tuần 3"));

router.post("/admin/sales/:id/reset", notImplemented("tuần 3"));
router.get("/admin/sales/:id/stats", notImplemented("tuần 3"));
