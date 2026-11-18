#!/usr/bin/env bash
# Kiểm thử logic sở hữu nhóm tiến trình của dev-common.sh, stop.sh với ps/lsof/kill giả.
# Không gửi tín hiệu thật nào. Chạy được trên Git Bash (Windows) và bash của macOS/Linux,
# nhưng chỉ chứng minh logic shell, không phải bằng chứng runtime macOS.
# Cách chạy: bash scripts/test/fixtures/shell-guards.sh <thư mục scripts>
set -euo pipefail

SOURCE_SCRIPTS=$(cd -P -- "$1" && pwd -P)
WORK=$(mktemp -d "${TMPDIR:-/tmp}/dev-guards.XXXXXX")
ROOT="$WORK/Dữ liệu [dev] (thử)"
FAKE_DIR="$WORK/fake"
mkdir -p "$ROOT/scripts" "$ROOT/backend" "$ROOT/frontend" "$FAKE_DIR"
for file in start.sh stop.sh dev-common.sh; do
    cp "$SOURCE_SCRIPTS/$file" "$ROOT/scripts/$file"
done
export FAKE_DIR
export FAKE_CALLER_PGID=100
FAILURES=0
PASSES=0

cleanup() { rm -rf -- "$WORK"; }
trap cleanup EXIT

# ---- Bảng tiến trình giả: pid|pgid|lstart|comm|command ----
# shellcheck disable=SC2329
ps() {
    local field="" pid="" all=0 line
    while [ "$#" -gt 0 ]; do
        case "$1" in
            -ww) ;;
            -A) all=1 ;;
            -o)
                shift
                field=$1
                ;;
            -p)
                shift
                pid=$1
                ;;
        esac
        shift
    done
    if [ "$all" -eq 1 ]; then
        while IFS='|' read -r p g s c cmd; do
            [ -n "$p" ] || continue
            case "$field" in
                pid=,pgid=) printf '%6s %6s\n' "$p" "$g" ;;
                pid=,pgid=,lstart=) printf '%6s %6s %s\n' "$p" "$g" "$s" ;;
            esac
        done <"$FAKE_DIR/ps.txt"
        return 0
    fi
    line=$(awk -F'|' -v p="$pid" '$1 == p { print; exit }' "$FAKE_DIR/ps.txt")
    if [ -z "$line" ]; then
        # Tiến trình thật đang chạy harness: nhóm của lệnh gọi.
        if builtin kill -0 "$pid" 2>/dev/null; then
            line="$pid|$FAKE_CALLER_PGID|Thu Jan  1 00:00:00 2026|bash|bash harness"
        else
            return 1
        fi
    fi
    IFS='|' read -r p g s c cmd <<EOF
$line
EOF
    case "$field" in
        pid=) printf '%6s\n' "$p" ;;
        pgid=) printf '%6s\n' "$g" ;;
        lstart=) printf '%s\n' "$s" ;;
        comm=) printf '%s\n' "$c" ;;
        command=) printf '%s\n' "$cmd" ;;
        *) return 1 ;;
    esac
}

# shellcheck disable=SC2329
lsof() {
    local port=""
    while [ "$#" -gt 0 ]; do
        case "$1" in
            -iTCP:*) port=${1#-iTCP:} ;;
        esac
        shift
    done
    awk -v p="$port" '$1 == p { print $2; found = 1 } END { exit !found }' "$FAKE_DIR/listen.txt"
}

# Ghi lại tín hiệu và mô phỏng tiến trình thoát. Không bao giờ gọi kill thật.
# shellcheck disable=SC2329
kill() {
    local signal=$1 target
    shift
    [ "$1" != "--" ] || shift
    target=$1
    printf '%s %s\n' "$signal" "$target" >>"$FAKE_DIR/kills.txt"
    case "$target" in
        -*) awk -F'|' -v g="${target#-}" '$2 != g' "$FAKE_DIR/ps.txt" >"$FAKE_DIR/ps.next" ;;
        *) awk -F'|' -v p="$target" '$1 != p' "$FAKE_DIR/ps.txt" >"$FAKE_DIR/ps.next" ;;
    esac
    if [ -f "$FAKE_DIR/sticky" ]; then
        cp "$FAKE_DIR/ps.txt" "$FAKE_DIR/ps.next"
    fi
    mv "$FAKE_DIR/ps.next" "$FAKE_DIR/ps.txt"
    awk 'NR == FNR { alive[$1] = 1; next } ($2 in alive)' FS='|' "$FAKE_DIR/ps.txt" FS=' ' "$FAKE_DIR/listen.txt" >"$FAKE_DIR/listen.next"
    mv "$FAKE_DIR/listen.next" "$FAKE_DIR/listen.txt"
}

# shellcheck disable=SC2329
sleep() { :; }
# shellcheck disable=SC2329
uname() { printf 'Darwin\n'; }
# shellcheck disable=SC2329
docker() {
    printf 'docker %s\n' "$*" >>"$FAKE_DIR/kills.txt"
    return 0
}
export -f ps lsof kill sleep uname docker

reset_state() {
    : >"$FAKE_DIR/ps.txt"
    : >"$FAKE_DIR/listen.txt"
    : >"$FAKE_DIR/kills.txt"
    rm -f "$FAKE_DIR/sticky"
    rm -rf "$ROOT/.dev"
    mkdir -p "$ROOT/.dev"
}

proc() { printf '%s|%s|%s|%s|%s\n' "$1" "$2" "$3" "$4" "$5" >>"$FAKE_DIR/ps.txt"; }
listen() { printf '%s %s\n' "$1" "$2" >>"$FAKE_DIR/listen.txt"; }
kills() { cat "$FAKE_DIR/kills.txt"; }

check() {
    local name=$1
    shift
    if "$@"; then
        PASSES=$((PASSES + 1))
        printf 'ok - %s\n' "$name"
    else
        FAILURES=$((FAILURES + 1))
        printf 'not ok - %s\n' "$name"
        printf '#   kills: %s\n' "$(kills | tr '\n' ';')"
    fi
}

no_kills() { [ ! -s "$FAKE_DIR/kills.txt" ]; }
killed() { grep -qxF -- "$1" "$FAKE_DIR/kills.txt"; }
not_killed() { ! grep -qF -- "$1" "$FAKE_DIR/kills.txt"; }
fails() { ! "$@"; }

# shellcheck source=../../dev-common.sh
. "$ROOT/scripts/dev-common.sh"
CALLER_PGID=$FAKE_CALLER_PGID
TOKEN=0123456789abcdef0123456789abcdef
START='Wed Nov 18 11:58:04 2026'
LABEL=$(runner_label api "$TOKEN")
RUNNER_CMD="/bin/bash -c cd -- \"\$1\" $LABEL $ROOT/backend /usr/local/bin/npm"
API_NODE="node $ROOT/backend/node_modules/.bin/tsx watch src/server.ts"

valid_record() {
    write_record api 500 500 "$START" "$TOKEN"
    proc 500 500 "$START" bash "$RUNNER_CMD"
    proc 501 500 "$START" node "node /usr/local/bin/npm run dev"
    proc 502 500 "$START" node "$API_NODE"
}

check "lstart trùng chuỗi là cùng tiến trình" same_start "$START" "$START"
check "lstart trôi 1-2 giây (btime của Linux) vẫn là cùng tiến trình" same_start "$START" 'Wed Nov 18 11:58:06 2026'
check "lstart lệch 3 giây là tiến trình khác" fails same_start "$START" 'Wed Nov 18 11:58:07 2026'
check "lstart qua nửa đêm và cuối năm vẫn tính đúng" same_start 'Thu Dec 31 23:59:59 2026' 'Fri Jan  1 00:00:01 2027'
check "khoảng trắng đệm ngày một chữ số được chuẩn hóa" same_start 'Sun Nov  8 01:02:03 2026' 'Sun Nov 8 01:02:03 2026'
check "chuỗi không phân tích được phải trùng hoàn toàn" fails same_start 'mer 18 nov 11:58:04 2026' 'mer 18 nov 11:58:05 2026'
check "lstart rỗng không bao giờ khớp" fails same_start "" ""

reset_state
valid_record
check "bản ghi hợp lệ nhận đúng nhóm runner" test "$(owned_group api)" = 500

reset_state
valid_record
awk -F'|' 'BEGIN { OFS = "|" } $1 == 500 { $3 = "Thu Nov 19 08:00:00 2026" } { print }' "$FAKE_DIR/ps.txt" >"$FAKE_DIR/ps.next"
mv "$FAKE_DIR/ps.next" "$FAKE_DIR/ps.txt"
check "PID bị tái sử dụng (lstart khác) bị từ chối" fails owned_group api

reset_state
valid_record
awk -F'|' 'BEGIN { OFS = "|" } $1 == 500 { $5 = "/bin/bash -c other-tool" } { print }' "$FAKE_DIR/ps.txt" >"$FAKE_DIR/ps.next"
mv "$FAKE_DIR/ps.next" "$FAKE_DIR/ps.txt"
check "PID cùng thời điểm nhưng thiếu nhãn dự án bị từ chối" fails owned_group api

reset_state
write_record api 500 500 "$START" "$TOKEN"
proc 500 400 "$START" bash "$RUNNER_CMD"
check "runner không còn là trưởng nhóm bị từ chối" fails owned_group api

reset_state
valid_record
CALLER_PGID=500
check "nhóm trùng nhóm lệnh gọi bị từ chối" fails owned_group api
check "stop_group không gửi tín hiệu cho nhóm lệnh gọi" fails stop_group 500
check "không có tín hiệu nào được gửi cho nhóm lệnh gọi" no_kills
CALLER_PGID=$FAKE_CALLER_PGID

reset_state
check "PGID 0 và 1 không bao giờ nhận tín hiệu" fails stop_group 1
check "PGID 0 bị từ chối" fails stop_group 0
check "PGID không phải số bị từ chối" fails stop_group "1 2"
check "không có tín hiệu cho nhóm hệ thống" no_kills

reset_state
valid_record
check "nhóm đã xác minh dừng bằng PGID âm" stop_group 500
check "TERM gửi cho cả nhóm 500" killed "-TERM -500"
check "không còn thành viên nhóm 500" test -z "$(group_members 500)"

reset_state
valid_record
touch "$FAKE_DIR/sticky"
check "nhóm không chịu dừng trả lỗi" fails stop_group 500
check "KILL chỉ gửi cho thành viên đã chụp của nhóm" killed "-KILL 502"
rm -f "$FAKE_DIR/sticky"

reset_state
proc 600 600 "$START" node "node $ROOT/backend/server.js"
proc 601 601 "$START" node "node $ROOT-khác/backend/server.js"
proc 602 602 "$START" node "node $ROOT/backend/../../evil/server.js"
proc 603 603 "$START" python3 "python3 $ROOT/backend/server.py"
proc 604 604 "$START" /usr/local/bin/node "/usr/local/bin/node $ROOT/frontend/node_modules/.bin/vite"
check "node trong backend của dự án được nhận" project_node 600 api
check "thư mục cùng tiền tố bị từ chối" fails project_node 601 api
check "đường dẫn thoát ra bằng .. bị từ chối" fails project_node 602 api
check "tiến trình không phải node bị từ chối" fails project_node 603 api
check "comm là đường dẫn đầy đủ của node (macOS) được nhận" project_node 604 web
check "node của frontend không được nhận cho api" fails project_node 604 api

reset_state
proc 700 700 "$START" bash "$RUNNER_CMD"
proc 702 700 "$START" node "$API_NODE"
listen 5000 702
check "mất file PID: nhóm runner của dự án được dừng cả nhóm" stop_listener api 702
check "fallback gửi TERM cho nhóm runner" killed "-TERM -700"

reset_state
proc 800 800 "$START" zsh "-zsh"
proc 802 800 "$START" node "$API_NODE"
listen 5000 802
check "nhóm lạ: chỉ dừng đúng node của dự án" stop_listener api 802
check "nhóm lạ không bị gửi tín hiệu nhóm" not_killed "-800"
check "node của dự án nhận TERM riêng" killed "-TERM 802"

reset_state
proc 902 "$FAKE_CALLER_PGID" "$START" node "$API_NODE"
listen 5000 902
check "node nằm trong nhóm lệnh gọi không bị dừng" fails stop_listener api 902
check "không có tín hiệu khi listener cùng nhóm lệnh gọi" no_kills

reset_state
proc 950 950 "$START" node "node /srv/other-app/backend/server.js"
listen 5000 950
check "node ngoài dự án chỉ được báo, không bị dừng" fails stop_listener api 950
check "không có tín hiệu cho node ngoài dự án" no_kills

# ---- Chạy stop.sh thật với công cụ giả ----
reset_state
set +e
out=$(bash "$ROOT/scripts/stop.sh" --keep-db 2>&1)
code=$?
set -e
check "stop khi không có PID và không có listener thoát 0" test "$code" -eq 0
check "stop báo không có gì để dừng" grep -q 'Không có gì để dừng.' <<EOF
$out
EOF
check "stop --keep-db không gửi tín hiệu và không gọi docker" no_kills
check "stop nhả khóa vòng đời" test ! -e "$ROOT/.dev/lifecycle.lock.d"

reset_state
proc 960 960 "$START" node "node /srv/other-app/backend/server.js"
listen 5000 960
set +e
out=$(bash "$ROOT/scripts/stop.sh" --keep-db 2>&1)
code=$?
set -e
check "listener lạ ở 5000 làm stop thoát 1" test "$code" -eq 1
check "stop báo PID và tên của listener lạ" grep -q 'Cổng 5000 đang được giữ bởi PID 960 (node).' <<EOF
$out
EOF
check "listener lạ không bị gửi tín hiệu" no_kills

reset_state
valid_record
write_record web 510 510 "$START" "fedcba9876543210fedcba9876543210"
proc 510 510 "$START" bash "/bin/bash -c x $(runner_label web fedcba9876543210fedcba9876543210) $ROOT/frontend npm"
proc 511 510 "$START" node "node $ROOT/frontend/node_modules/.bin/vite"
listen 5000 502
listen 5173 511
set +e
out=$(bash "$ROOT/scripts/stop.sh" 2>&1)
code=$?
set -e
check "stop đầy đủ thoát 0" test "$code" -eq 0
check "stop dừng nhóm api" killed "-TERM -500"
check "stop dừng nhóm web" killed "-TERM -510"
check "stop gọi docker compose stop" killed "docker compose stop"
check "stop xóa file PID" test ! -e "$ROOT/.dev/api.pid" -a ! -e "$ROOT/.dev/web.owner"
check "stop in đủ 4 bước" test "$(printf '%s\n' "$out" | grep -c '^\[[1-4]/4\]')" -eq 4

# ---- Khóa vòng đời ----
reset_state
mkdir -p "$ROOT/.dev/lifecycle.lock.d"
printf 'pid=%s\nstart=%s\n' "$$" 'Thu Jan  1 00:00:00 2026' >"$ROOT/.dev/lifecycle.lock.d/owner"
set +e
out=$(bash "$ROOT/scripts/stop.sh" --keep-db 2>&1)
code=$?
set -e
check "khóa của tiến trình còn sống chặn stop" test "$code" -eq 1
check "khóa còn sống giữ nguyên" test -f "$ROOT/.dev/lifecycle.lock.d/owner"

reset_state
mkdir -p "$ROOT/.dev/lifecycle.lock.d"
printf 'pid=%s\nstart=%s\n' 999999 'Thu Jan  1 00:00:00 2026' >"$ROOT/.dev/lifecycle.lock.d/owner"
set +e
out=$(bash "$ROOT/scripts/stop.sh" --keep-db 2>&1)
code=$?
set -e
check "khóa của tiến trình đã chết được gỡ" test "$code" -eq 0
check "báo đã gỡ khóa cũ" grep -q 'Đã gỡ khóa cũ' <<EOF
$out
EOF

reset_state
mkdir -p "$ROOT/.dev/lifecycle.lock.d"
set +e
out=$(bash "$ROOT/scripts/stop.sh" --keep-db 2>&1)
code=$?
set -e
check "khóa thiếu chủ sở hữu không bị gỡ" test "$code" -eq 1 -a -d "$ROOT/.dev/lifecycle.lock.d"
check "báo cách xử lý khóa thiếu chủ sở hữu" grep -q 'chưa ghi chủ sở hữu' <<EOF
$out
EOF

printf '# pass %s\n# fail %s\n' "$PASSES" "$FAILURES"
[ "$FAILURES" -eq 0 ]
