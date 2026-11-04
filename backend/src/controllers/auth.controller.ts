import type { RequestHandler } from "express";
import type { AuthService } from "../services/auth.service.js";
import { parseLoginInput, parseRegisterInput } from "../utils/validate.js";

/** Handler đăng ký / đăng nhập. Express 5 tự chuyển lỗi async tới middleware lỗi, không cần try/catch. */
export function createAuthController(service: AuthService): { register: RequestHandler; login: RequestHandler } {
  const register: RequestHandler = async (req, res) => {
    res.status(201).json(await service.register(parseRegisterInput(req.body)));
  };
  const login: RequestHandler = async (req, res) => {
    res.json(await service.login(parseLoginInput(req.body)));
  };
  return { register, login };
}
