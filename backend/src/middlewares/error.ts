import type { ErrorRequestHandler, RequestHandler } from "express";
import mongoose from "mongoose";
import { HttpError, type ErrorCode } from "../utils/http-error.js";

/** Gắn sau router /api: mọi đường dẫn không khớp đều thành 404 NOT_FOUND. */
export const notFound: RequestHandler = () => {
  throw new HttpError(404, "Không tìm thấy đường dẫn", "NOT_FOUND");
};

/**
 * Ánh xạ mọi lỗi sang JSON { message, code } theo bảng SPECS mục 7 / D-15.
 * Lỗi 500 chỉ trả thông báo chung; chi tiết (stack) chỉ ghi ra log của server.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  // Phản hồi đã bắt đầu gửi thì không thể ghi body lỗi nữa: để Express tự đóng kết nối.
  if (res.headersSent) {
    next(err);
    return;
  }

  const send = (status: number, message: string, code: ErrorCode): void => {
    res.status(status).json({ message, code });
  };

  if (err instanceof HttpError) {
    send(err.status, err.message, err.code);
    return;
  }
  if (err instanceof mongoose.Error.CastError) {
    send(400, "Mã định danh không hợp lệ", "INVALID_ID");
    return;
  }
  if (err instanceof mongoose.Error.ValidationError) {
    send(400, "Dữ liệu không hợp lệ", "VALIDATION_ERROR");
    return;
  }
  if (err instanceof mongoose.mongo.MongoServerError && err.code === 11000) {
    send(409, "Dữ liệu bị trùng", "DUPLICATE");
    return;
  }

  const e = err as { type?: unknown; status?: unknown };
  if (e.type === "entity.parse.failed") {
    send(400, "Body JSON không hợp lệ", "INVALID_JSON");
    return;
  }
  // Các lỗi 4xx khác của body-parser (413 body quá lớn, 415 charset...) giữ nguyên status.
  if (typeof e.status === "number" && e.status >= 400 && e.status < 500) {
    send(e.status, "Yêu cầu không hợp lệ", "VALIDATION_ERROR");
    return;
  }

  console.error(err);
  send(500, "Lỗi máy chủ, vui lòng thử lại sau", "INTERNAL_ERROR");
};
