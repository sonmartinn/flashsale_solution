#!/usr/bin/env bash
# Fixture runtime POSIX cho scripts/start.sh và scripts/stop.sh.
# Chạy start/stop thật (ps, lsof, kill, nohup, job control thật) trong một dự án giả dùng một lần
# ở đường dẫn có dấu, khoảng trắng và ngoặc. node/npm/docker/open là công cụ giả; dịch vụ là python3.
# Cần: bash, python3, lsof, curl, ps có -o lstart. Kết quả trên Linux/WSL không phải bằng chứng macOS.
# Cách chạy: bash scripts/test/fixtures/posix-lifecycle.sh <thư mục scripts>
set -euo pipefail

SOURCE_SCRIPTS=$(cd -P -- "$1" && pwd -P)
SOURCE_REPO=$(cd -P -- "$SOURCE_SCRIPTS/.." && pwd -P)
for tool in python3 lsof curl ps; do
    command -v "$tool" >/dev/null 2>&1 || {
        echo "# SKIP thiếu $tool"
        exit 77
    }
done

WORK=$(mktemp -d "${TMPDIR:-/tmp}/dev-posix.XXXXXX")
ROOT="$WORK/Dữ liệu [dev] (thử)"
OTHER="$WORK/Dữ liệu [dev] (thử)-khác"
FIX="$WORK/state"
BIN="$WORK/bin"
RT="$WORK/rt"
mkdir -p "$ROOT/scripts" "$ROOT/backend" "$ROOT/frontend" "$OTHER/backend" "$FIX" "$BIN" "$RT"
cp "$SOURCE_SCRIPTS/start.sh" "$SOURCE_SCRIPTS/stop.sh" "$SOURCE_SCRIPTS/dev-common.sh" "$ROOT/scripts/"
chmod +x "$ROOT/scripts/start.sh" "$ROOT/scripts/stop.sh"
cp "$SOURCE_REPO/backend/.env.example" "$ROOT/backend/.env.example"
for package in backend frontend; do
    cp "$SOURCE_SCRIPTS/test/fixtures/child-server.py" "$ROOT/$package/child-server.py"
    printf '{}' >"$ROOT/$package/package-lock.json"
done
cp "$SOURCE_SCRIPTS/test/fixtures/child-server.py" "$OTHER/backend/child-server.py"
cp "$SOURCE_SCRIPTS/test/fixtures/fake_node.py" "$FIX/fake_node.py"
ln -s "$(command -v python3)" "$RT/node"
: >"$FIX/calls.txt"
: >"$FIX/procs"

cat >"$BIN/node" <<'EOF'
#!/usr/bin/env bash
set -eu
case "${1-}" in
    --version) printf '%s\n' "${DEV_FIXTURE_VERSION:-v24.22.1}"; exit 0 ;;
    -e)
        case "$2" in
            *randomBytes*) exec python3 "$DEV_FIXTURE_DIR/fake_node.py" env ;;
            *dotenv/config*) exec python3 "$DEV_FIXTURE_DIR/fake_node.py" target ;;
        esac
        ;;
esac
echo "unexpected fake node $*" >&2
exit 99
EOF

cat >"$BIN/npm" <<'EOF'
#!/usr/bin/env bash
set -eu
F=$DEV_FIXTURE_DIR
pkg=$(basename "$PWD")
echo "$pkg $*" >>"$F/calls.txt"
case "$*" in
    --version) echo 11.0.0 ;;
    ci)
        mkdir -p node_modules
        if [ "$(cat "$F/install-fail" 2>/dev/null || true)" = "$pkg" ]; then
            echo "fake install failed" >&2
            exit 91
        fi
        ;;
    "run seed") echo 1001 >"$F/count" ;;
    "run dev")
        echo "fake dev stdout $pkg"
        echo "fake dev stderr $pkg" >&2
        if [ "$(cat "$F/exit-early" 2>/dev/null || true)" = "$pkg" ]; then
            sleep 0.5
            exit 17
        fi
        mode=$pkg
        if [ "$(cat "$F/unready" 2>/dev/null || true)" = "$pkg" ]; then mode=unready; fi
        "$DEV_FIXTURE_RT/node" "$PWD/child-server.py" "$mode"
        ;;
    *) echo "unexpected fake npm $*" >&2; exit 98 ;;
esac
EOF

cat >"$BIN/docker" <<'EOF'
#!/usr/bin/env bash
set -eu
F=$DEV_FIXTURE_DIR
echo "$*" >>"$F/calls.txt"
case "$*" in
    "compose version --short") cat "$F/compose-version" 2>/dev/null || echo 2.39.0 ;;
    info) if [ -f "$F/daemon-down" ] && [ ! -f "$F/desktop-opened" ]; then exit 1; fi ;;
    "compose up -d --wait")
        if [ -f "$F/compose-fail" ]; then echo "Bind for 127.0.0.1:27018 failed" >&2; exit 86; fi
        echo yes >"$F/db-running"
        ;;
    "exec flashsale-mongo mongosh flashsale --quiet --eval db.users.countDocuments()")
        if [ -f "$F/count" ]; then cat "$F/count"; else echo 0; fi
        ;;
    "compose ps --status running -q")
        if [ "$(cat "$F/db-running" 2>/dev/null || true)" = yes ]; then echo fake-db; fi
        ;;
    "compose stop") echo no >"$F/db-running" ;;
    *) echo "unexpected fake docker $*" >&2; exit 97 ;;
esac
EOF

cat >"$BIN/open" <<'EOF'
#!/usr/bin/env bash
echo "open $*" >>"$DEV_FIXTURE_DIR/calls.txt"
touch "$DEV_FIXTURE_DIR/desktop-opened"
EOF
chmod +x "$BIN/node" "$BIN/npm" "$BIN/docker" "$BIN/open"

export DEV_FIXTURE_DIR="$FIX"
export DEV_FIXTURE_RT="$RT"
export PATH="$BIN:/usr/bin:/bin:/usr/sbin:/sbin"
SELF_PGID=$(ps -o pgid= -p $$ | tr -d ' ')
PASSES=0
FAILURES=0
FOREIGN=""

cleanup() {
    local pid
    set +e
    for pid in $FOREIGN $(cat "$FIX/procs" 2>/dev/null); do
        kill -TERM "$pid" 2>/dev/null
    done
    for pid in $(cat "$ROOT/.dev/api.pid" "$ROOT/.dev/web.pid" 2>/dev/null); do
        kill -TERM "$pid" 2>/dev/null
    done
    sleep 0.5
    rm -rf -- "$WORK"
}
trap cleanup EXIT

check() {
    local name=$1
    shift
    if "$@"; then
        PASSES=$((PASSES + 1))
        printf 'ok - %s\n' "$name"
    else
        FAILURES=$((FAILURES + 1))
        printf 'not ok - %s\n' "$name"
        printf '%s\n' "$OUT" | sed 's/^/#   /' | tail -n 25
    fi
}

run() {
    set +e
    OUT=$(bash "$ROOT/scripts/$1" "${@:2}" 2>&1)
    CODE=$?
    set -e
}

has() { printf '%s\n' "$OUT" | grep -qF -- "$1"; }
lacks() { ! printf '%s\n' "$OUT" | grep -qF -- "$1"; }
calls() { grep -cxF -- "$1" "$FIX/calls.txt" || true; }
alive() { kill -0 "$1" 2>/dev/null; }
port_free() { [ -z "$(lsof -nP -t -iTCP:"$1" -sTCP:LISTEN 2>/dev/null || true)" ]; }
http_ok() { [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 --noproxy '*' "$1" || true)" = 200 ]; }
record() { awk -F= -v k="$2" '$1 == k { print substr($0, length(k) + 2) }' "$ROOT/.dev/$1.owner"; }
steps() { printf '%s\n' "$OUT" | sed -n "s/^\[\([0-9]*\)\/$1\].*/\1/p" | tr '\n' ' '; }

all_dead() {
    local pid i=0
    while [ "$i" -lt 40 ]; do
        local live=0
        for pid in $(cat "$FIX/procs") $1; do
            if alive "$pid"; then live=1; fi
        done
        [ "$live" -eq 1 ] || return 0
        sleep 0.25
        i=$((i + 1))
    done
    return 1
}

eventually() {
    local i=0
    while [ "$i" -lt 60 ]; do
        if "$@"; then return 0; fi
        sleep 0.25
        i=$((i + 1))
    done
    return 1
}

# ---- Trợ giúp, tham số, công cụ ----
run start.sh --help
check "start --help thoát 0 và nói --seed xóa dữ liệu" test "$CODE" -eq 0 -a -n "$(printf '%s' "$OUT" | grep -- '--seed.*xóa dữ liệu')"
run stop.sh --help
check "stop --help thoát 0 và nói --keep-db giữ container" test "$CODE" -eq 0 -a -n "$(printf '%s' "$OUT" | grep -- '--keep-db.*giữ')"
check "help không tạo .dev" test ! -e "$ROOT/.dev"
run start.sh --bogus
check "tham số lạ thoát 1" test "$CODE" -eq 1
check "help và tham số lạ không gọi công cụ nào" test ! -s "$FIX/calls.txt"

for version in v20.18.3 v21.9.0 v22.11.9; do
    DEV_FIXTURE_VERSION=$version run start.sh
    check "Node $version bị từ chối" test "$CODE" -eq 1
    check "thông báo Node $version không tương thích" has "không tương thích"
done
check "Node sai phiên bản dừng trước Docker" test "$(calls info)" -eq 0
echo 1.29.2 >"$FIX/compose-version"
run start.sh
check "Compose v1 bị từ chối" has "Cần Docker Compose v2"
rm -f "$FIX/compose-version"
check "lock được nhả sau lỗi" test ! -e "$ROOT/.dev/lifecycle.lock.d"

# ---- Lần start đầu: Docker tắt, chưa có .env, chưa có node_modules, DB trống ----
touch "$FIX/daemon-down"
run start.sh
check "start đầu thoát 0" test "$CODE" -eq 0
check "start chạy đủ 10 bước theo thứ tự" test "$(steps 10)" = "1 2 3 4 5 6 7 8 9 10 "
check "Docker tắt thì gọi open -a Docker" test "$(calls 'open -a Docker')" -eq 1
SECRET=$(sed -n 's/^JWT_SECRET=\([0-9a-f]*\)$/\1/p' "$ROOT/backend/.env")
check "tạo JWT_SECRET 32 byte" test "${#SECRET}" -eq 64
check "không in secret" lacks "$SECRET"
check "in URL frontend" has "Frontend: http://localhost:5173"
check "in URL health" has "API health: http://localhost:5000/api/health"
check "in lệnh tail -f với đường dẫn trong nháy đơn" has "tail -f '$ROOT/.dev/logs/api.log'"
check "in lệnh stop" has "'$ROOT/scripts/stop.sh'"
API_PID=$(cat "$ROOT/.dev/api.pid")
WEB_PID=$(cat "$ROOT/.dev/web.pid")
check "PID file là số" test -n "$(printf '%s%s' "$API_PID" "$WEB_PID" | grep -E '^[0-9]+$')"
check "runner api là trưởng nhóm riêng" test "$(record api pgid)" = "$API_PID"
check "runner web là trưởng nhóm riêng" test "$(record web pgid)" = "$WEB_PID"
check "nhóm dịch vụ khác nhóm lệnh gọi" test "$API_PID" != "$SELF_PGID" -a "$WEB_PID" != "$SELF_PGID"
check "nhóm thật trên hệ thống khớp bản ghi" test "$(ps -o pgid= -p "$API_PID" | tr -d ' ')" = "$API_PID"
check "API health 200" http_ok "http://127.0.0.1:5000/api/health"
check "frontend 200" http_ok "http://127.0.0.1:5173/"
check "log api có stdout và stderr" grep -q "fake dev stderr backend" "$ROOT/.dev/logs/api.log"
check "log web có stdout" grep -q "fake dev stdout frontend" "$ROOT/.dev/logs/web.log"
check "log không chứa secret" test -z "$(grep -lF "$SECRET" "$ROOT/.dev/logs/"*.log || true)"
check "npm ci chạy cho backend và frontend" test "$(calls 'backend ci')" -eq 1 -a "$(calls 'frontend ci')" -eq 1
check "DB trống thì seed một lần" test "$(calls 'backend run seed')" -eq 1

# ---- Đóng terminal: SIGHUP tới nhóm dịch vụ không dừng dịch vụ (nohup) ----
kill -HUP -- "-$API_PID" "-$WEB_PID"
sleep 1
check "runner api sống sau SIGHUP" alive "$API_PID"
check "runner web sống sau SIGHUP" alive "$WEB_PID"
check "API vẫn trả 200 sau SIGHUP" http_ok "http://127.0.0.1:5000/api/health"

# ---- start lần hai khi đang chạy ----
run start.sh
check "start lần hai thoát 0" test "$CODE" -eq 0
check "start lần hai báo đang chạy" has "Backend và frontend đang chạy."
check "không khởi động bản thứ hai" test "$(calls 'backend run dev')" -eq 1 -a "$(cat "$ROOT/.dev/api.pid")" = "$API_PID"

# ---- stop ----
run stop.sh
check "stop thoát 0" test "$CODE" -eq 0
check "stop chạy đủ 4 bước" test "$(steps 4)" = "1 2 3 4 "
check "stop dừng cả cây (runner, npm, server, con)" all_dead "$API_PID $WEB_PID"
check "cổng 5000 trống" port_free 5000
check "cổng 5173 trống" port_free 5173
check "container đã dừng" test "$(cat "$FIX/db-running")" = no
check "file PID đã xóa" test ! -e "$ROOT/.dev/api.pid" -a ! -e "$ROOT/.dev/web.owner"

# ---- start sau stop: bỏ qua cài và seed ----
cp "$ROOT/backend/.env" "$FIX/env.before"
run start.sh
check "restart thoát 0" test "$CODE" -eq 0
check "restart bỏ qua npm ci" test "$(calls 'backend ci')" -eq 1 -a "$(calls 'frontend ci')" -eq 1
check "restart báo bỏ qua cài" has "Bỏ qua npm ci cho backend."
check "restart không seed khi đã có người dùng" test "$(calls 'backend run seed')" -eq 1
check "restart giữ nguyên .env" cmp -s "$ROOT/backend/.env" "$FIX/env.before"

# ---- stop --keep-db, rồi stop khi không còn gì ----
run stop.sh --keep-db
check "stop --keep-db thoát 0" test "$CODE" -eq 0
check "stop --keep-db giữ container" test "$(cat "$FIX/db-running")" = yes
check "stop --keep-db không gọi compose stop" test "$(calls 'compose stop')" -eq 1
run stop.sh --keep-db
check "stop lặp lại thoát 0" test "$CODE" -eq 0
check "stop lặp lại báo không có gì để dừng" has "Không có gì để dừng."

# ---- Cổng 5000 bị tiến trình khác giữ (thư mục cùng tiền tố) ----
set -m
"$RT/node" "$OTHER/backend/child-server.py" foreign >/dev/null 2>&1 </dev/null &
FOREIGN=$!
set +m
check "listener lạ đã mở cổng 5000" eventually http_ok "http://127.0.0.1:5000/api/health"
UPS=$(calls 'compose up -d --wait')
run start.sh
check "start thoát 1 khi cổng 5000 bận" test "$CODE" -eq 1
check "start báo PID và tên tiến trình giữ cổng" has "Cổng 5000 đang được giữ bởi PID $FOREIGN (node)."
check "start không gọi compose khi cổng bận" test "$(calls 'compose up -d --wait')" -eq "$UPS"
run stop.sh --keep-db
check "stop thoát 1 khi cổng bị tiến trình lạ giữ" test "$CODE" -eq 1
check "tiến trình lạ không bị dừng" alive "$FOREIGN"
kill -TERM "$FOREIGN"
check "listener lạ đã đóng" eventually port_free 5000

# ---- node của dự án nằm trong nhóm của lệnh gọi: không bao giờ bị gửi tín hiệu ----
"$RT/node" "$ROOT/backend/child-server.py" foreign >/dev/null 2>&1 </dev/null &
SAME=$!
FOREIGN="$FOREIGN $SAME"
check "listener cùng nhóm đã mở cổng" eventually http_ok "http://127.0.0.1:5000/api/health"
check "listener dùng chung nhóm với fixture" test "$(ps -o pgid= -p "$SAME" | tr -d ' ')" = "$SELF_PGID"
run stop.sh --keep-db
check "stop thoát 1 vì không dừng nhóm của lệnh gọi" test "$CODE" -eq 1
check "stop báo cùng nhóm tiến trình" has "cùng nhóm tiến trình với lệnh đang chạy"
check "listener cùng nhóm còn sống" alive "$SAME"
kill -TERM "$SAME"
check "listener cùng nhóm đã đóng" eventually port_free 5000

# ---- Mất file PID nhưng dịch vụ vẫn chạy ----
run start.sh
check "start cho ca mất PID thoát 0" test "$CODE" -eq 0
API_PID=$(cat "$ROOT/.dev/api.pid")
WEB_PID=$(cat "$ROOT/.dev/web.pid")
rm -f "$ROOT/.dev/api.pid" "$ROOT/.dev/api.owner" "$ROOT/.dev/web.pid" "$ROOT/.dev/web.owner"
run stop.sh --keep-db
check "stop fallback thoát 0" test "$CODE" -eq 0
check "fallback dừng cả hai cây" all_dead "$API_PID $WEB_PID"
check "fallback giải phóng cổng 5000" port_free 5000
check "fallback giải phóng cổng 5173" port_free 5173

# ---- Môi trường chỉ chạy một phần ----
run start.sh
API_PID=$(cat "$ROOT/.dev/api.pid")
WEB_PID=$(cat "$ROOT/.dev/web.pid")
kill -TERM -- "-$WEB_PID"
check "đã dừng riêng nhóm web" eventually port_free 5173
run start.sh
check "start báo chạy một phần" has "chỉ đang chạy một phần"
check "start không dừng backend đang chạy" alive "$API_PID"
run stop.sh --keep-db
check "stop sau chạy một phần thoát 0" test "$CODE" -eq 0
check "stop dừng backend còn lại" all_dead "$API_PID"

# ---- Khóa của tiến trình còn sống chặn start ----
mkdir -p "$ROOT/.dev/lifecycle.lock.d"
printf 'pid=%s\nstart=%s\n' "$$" "$(ps -o lstart= -p $$ | sed 's/^ *//; s/ *$//')" >"$ROOT/.dev/lifecycle.lock.d/owner"
run start.sh
check "khóa đang giữ chặn start" has "Một lệnh start/stop đang chạy"
check "khóa đang giữ không bị gỡ" test -f "$ROOT/.dev/lifecycle.lock.d/owner"
rm -rf "$ROOT/.dev/lifecycle.lock.d"

# ---- Dịch vụ thoát sớm: chỉ dọn tiến trình vừa khởi động ----
echo backend >"$FIX/exit-early"
STOPS=$(calls 'compose stop')
run start.sh
check "backend thoát sớm làm start thoát 1" test "$CODE" -eq 1
check "báo tiến trình api đã thoát" has "Tiến trình api đã thoát"
check "in log backend" has "fake dev stderr backend"
check "in mã thoát npm" has "mã 17"
check "cổng 5173 được dọn" eventually port_free 5173
check "không dừng container khi start lỗi" test "$(calls 'compose stop')" -eq "$STOPS" -a "$(cat "$FIX/db-running")" = yes
rm -f "$FIX/exit-early"

# ---- Lockfile đổi và npm ci lỗi không để lại marker ----
printf '{"changed":true}' >"$ROOT/frontend/package-lock.json"
echo frontend >"$FIX/install-fail"
run start.sh
check "npm ci lỗi báo package và mã" has "npm ci thất bại ở frontend (mã 91)"
check "npm ci lỗi không ghi marker" test ! -e "$ROOT/.dev/frontend.lock.sha256"
check "chỉ cài lại frontend" test "$(calls 'backend ci')" -eq 1 -a "$(calls 'frontend ci')" -eq 2
rm -f "$FIX/install-fail"

# ---- Đếm user lỗi không bao giờ thành DB trống; đích lạ không tự seed; --seed cảnh báo ----
for bad in 1.2 -1 ''; do
    printf '%s' "$bad" >"$FIX/count"
    run start.sh
    check "số user '$bad' không hợp lệ dừng trước seed" has "Không đếm được người dùng"
done
printf '0\n17\n' >"$FIX/count"
run start.sh
check "số user nhiều dòng dừng trước seed" has "Không đếm được người dùng"
echo 0 >"$FIX/count"
printf 'MONGODB_URI=mongodb://127.0.0.1:27018/fixture_other\nREDIS_URL=redis://127.0.0.1:6379\nJWT_SECRET=fixture-existing-secret\n' >"$ROOT/backend/.env"
cp "$ROOT/backend/.env" "$FIX/env.fake"
run start.sh
check "đích MongoDB lạ không tự seed" has "Cấu hình MongoDB hoặc Redis khác"
check "không in secret có sẵn" lacks "fixture-existing-secret"
check "không seed khi đích lạ" test "$(calls 'backend run seed')" -eq 1
echo 1001 >"$FIX/count"
run start.sh --seed
check "--seed thoát 0" test "$CODE" -eq 0
check "--seed cảnh báo xóa dữ liệu" has "[CẢNH BÁO] --seed sẽ xóa dữ liệu"
check "--seed chạy seed" test "$(calls 'backend run seed')" -eq 2
check "--seed giữ nguyên .env có sẵn" cmp -s "$ROOT/backend/.env" "$FIX/env.fake"
run stop.sh
check "stop cuối thoát 0" test "$CODE" -eq 0

# ---- Hết thời gian chờ: in log và dọn cây vừa khởi động ----
echo frontend >"$FIX/unready"
SECONDS_BEFORE=$SECONDS
run start.sh
check "frontend không sẵn sàng làm start thoát 1" test "$CODE" -eq 1
check "chờ khoảng 30 giây" test "$((SECONDS - SECONDS_BEFORE))" -ge 29
check "báo dịch vụ web chưa sẵn sàng" has "Hết thời gian chờ dịch vụ web"
check "in log web" has "fake dev stderr frontend"
check "không in URL khi lỗi" lacks "Frontend: http"
check "dọn mọi tiến trình fixture" all_dead ""
check "cổng 5000 trống sau dọn" port_free 5000
rm -f "$FIX/unready"

check "không còn tiến trình fixture nào" all_dead ""
printf '# pass %s\n# fail %s\n' "$PASSES" "$FAILURES"
[ "$FAILURES" -eq 0 ]
