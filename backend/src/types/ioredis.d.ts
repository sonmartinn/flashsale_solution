// Khai báo kiểu cho lệnh Redis tự định nghĩa "flashBuy" (script Lua buy.lua, đăng ký bằng defineCommand
// trong services/lua.ts). defineCommand gắn hàm lúc chạy nên TypeScript không tự biết; file này chỉ bổ sung
// kiểu, không được import ở runtime (tsconfig include "src" đã đưa nó vào biên dịch).
import type { ClientContext, Result } from "ioredis";

declare module "ioredis" {
  interface RedisCommander<Context extends ClientContext = { type: "default" }> {
    /** KEYS: stock:<id>, buyers:<id>; ARGV: userId, qty. Trả 1 / 0 / -1 / -2 (xem lua/buy.lua). */
    flashBuy(stockKey: string, buyersKey: string, userId: string, qty: string): Result<number, Context>;
  }
}

export {};
