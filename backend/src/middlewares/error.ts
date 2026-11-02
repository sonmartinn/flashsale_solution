import type { NextFunction, Request, RequestHandler, Response } from "express";

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Dùng cho các route chưa làm, nhận tên mốc trong lộ trình
export function notImplemented(milestone: string): RequestHandler {
  return () => {
    throw new HttpError(501, `Chưa cài đặt (dự kiến ${milestone})`);
  };
}

export function notFound(req: Request, res: Response) {
  res.status(404).json({ message: "Không tìm thấy" });
}

// Express nhận biết middleware xử lý lỗi qua đủ 4 tham số, nên phải giữ next dù không dùng
export function errorHandler(
  err: Error & { status?: number; type?: string },
  req: Request,
  res: Response,
  // eslint-disable-next-line no-unused-vars
  next: NextFunction
) {
  if (err.name === "CastError") {
    return res.status(400).json({ message: "Mã không hợp lệ" });
  }
  if (err.name === "ValidationError") {
    return res.status(400).json({ message: "Dữ liệu không hợp lệ" });
  }
  // Lỗi của express.json khi body không phải JSON hợp lệ
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Nội dung gửi lên không phải JSON hợp lệ" });
  }
  const status = err.status || 500;
  if (status >= 500 && status !== 501) console.error(err);
  res.status(status).json({ message: status === 500 ? "Lỗi máy chủ" : err.message });
}
