/** In thông báo lỗi tiếng Việt rồi thoát tiến trình với mã 1 (dùng cho server và CLI, không dùng trong handler). */
export function fail(message: string): never {
  console.error(`[LỖI] ${message}`);
  process.exit(1);
}
