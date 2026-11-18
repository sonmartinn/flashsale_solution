"""Tiến trình dịch vụ giả cho fixture POSIX: lắng nghe đúng cổng dev và sinh thêm một tiến trình con.

Chạy qua symlink tên ``node`` để ``ps -o comm=`` thấy ``node`` giống dịch vụ thật.
"""
import http.server
import os
import signal
import socketserver
import subprocess
import sys

mode = sys.argv[1]
fixture = os.environ["DEV_FIXTURE_DIR"]
with open(os.path.join(fixture, "procs"), "a", encoding="utf-8") as handle:
    handle.write(f"{os.getpid()}\n")

if mode in ("idle", "unready"):
    if mode == "unready":
        subprocess.Popen([os.environ["DEV_FIXTURE_RT"] + "/node", sys.argv[0], "idle"])
    while True:
        signal.pause()

if mode != "foreign":
    subprocess.Popen([os.environ["DEV_FIXTURE_RT"] + "/node", sys.argv[0], "idle"])
port = 5173 if mode == "frontend" else 5000


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200 if port != 5000 or self.path == "/api/health" else 404)
        self.end_headers()
        self.wfile.write(b"controlled fixture")

    def log_message(self, *args):
        pass


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", port), Handler) as server:
    print(f"listening {port}", flush=True)
    server.serve_forever()
