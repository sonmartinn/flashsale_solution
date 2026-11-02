export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Dùng cho các route chưa làm, nhận tên mốc trong lộ trình
export function notImplemented(milestone) {
  return () => {
    throw new HttpError(501, `Chưa cài đặt (dự kiến ${milestone})`);
  };
}

export function notFound(req, res) {
  res.status(404).json({ message: "Không tìm thấy" });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err.name === "CastError") {
    return res.status(400).json({ message: "Mã không hợp lệ" });
  }
  const status = err.status || 500;
  if (status >= 500 && status !== 501) console.error(err);
  res.status(status).json({ message: status === 500 ? "Lỗi máy chủ" : err.message });
}
