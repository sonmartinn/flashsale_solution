"""Thay cho ``node -e`` trong fixture POSIX: tạo .env độc quyền hoặc kiểm tra đích seed.

Chỉ chạy trong thư mục backend của dự án giả dùng một lần, không bao giờ chạm backend/.env thật.
"""
import os
import re
import secrets
import sys

action = sys.argv[1]
if action == "env":
    try:
        with open(".env.example", encoding="utf-8") as handle:
            text = handle.read()
        pattern = re.compile(r"^JWT_SECRET=[^\r\n]*", re.M)
        if not pattern.search(text):
            sys.exit(1)
        body = pattern.sub("JWT_SECRET=" + secrets.token_hex(32), text, count=1)
        fd = os.open(".env", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(body)
    except FileExistsError:
        pass
    sys.exit(0)

if action == "target":
    values = {}
    with open(".env", encoding="utf-8") as handle:
        for line in handle:
            match = re.match(r"^([A-Z_]+)=(.*)$", line.rstrip("\r\n"))
            if match:
                values[match.group(1)] = match.group(2)
    mongo = os.environ.get("MONGODB_URI", values.get("MONGODB_URI", "")).strip()
    redis = os.environ.get("REDIS_URL", values.get("REDIS_URL", "")).strip()
    if mongo != "mongodb://127.0.0.1:27018/flashsale":
        sys.exit(1)
    if redis not in ("redis://127.0.0.1:6379", "redis://127.0.0.1:6379/", "redis://127.0.0.1:6379/0"):
        sys.exit(1)
    sys.exit(0)

sys.exit(99)
