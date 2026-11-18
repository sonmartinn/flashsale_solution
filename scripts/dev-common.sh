# shellcheck shell=bash
# Phần dùng chung của scripts/start.sh và scripts/stop.sh (macOS, bash 3.2).
# File này chỉ khai báo biến và hàm. Nạp nó không chạy lệnh nào có tác dụng phụ.
# Không dùng mảng kết hợp, mapfile, ${var,,}, setsid, sed -i hay công cụ GNU riêng.

DEV_SCRIPT_DIR=$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
PROJECT_ROOT=$(cd -P -- "$DEV_SCRIPT_DIR/.." && pwd -P)
DEV_ROOT="$PROJECT_ROOT/.dev"
LOG_ROOT="$DEV_ROOT/logs"
LOCK_DIR="$DEV_ROOT/lifecycle.lock.d"
DEV_SERVICES="api web"
HEALTH_URL="http://localhost:5000/api/health"
WEB_URL="http://localhost:5173"
# Dấu vân tay ASCII của thư mục dự án. ps/lsof của macOS có thể mã hóa ký tự có dấu,
# nên nhận diện runner bằng nhãn ASCII thay vì so khớp đường dẫn tiếng Việt.
PROJECT_TAG=$(printf '%s' "$PROJECT_ROOT" | cksum | awk '{print $1}')
CALLER_PGID=""
LOCK_HELD=0
LOCK_OWNER=""
API_GROUP=""
WEB_GROUP=""
REC_PID=""
REC_PGID=""
REC_START=""
REC_TOKEN=""

say() { printf '%s\n' "$*"; }

# Lỗi nghiệp vụ: in nguyên nhân và cách khắc phục, rồi thoát mã 1 (trap EXIT dọn dẹp).
fail() {
    printf '[LỖI] %s\n' "$*"
    exit 1
}

service_port() {
    case "$1" in
        api) printf '5000' ;;
        web) printf '5173' ;;
    esac
}

service_folder() {
    case "$1" in
        api) printf 'backend' ;;
        web) printf 'frontend' ;;
    esac
}

get_group() {
    case "$1" in
        api) printf '%s' "$API_GROUP" ;;
        web) printf '%s' "$WEB_GROUP" ;;
    esac
}

set_group() {
    case "$1" in
        api) API_GROUP=$2 ;;
        web) WEB_GROUP=$2 ;;
    esac
}

trim() {
    local value=$1
    value=${value#"${value%%[![:space:]]*}"}
    value=${value%"${value##*[![:space:]]}"}
    printf '%s' "$value"
}

is_number() {
    case "$1" in
        '' | *[!0-9]*) return 1 ;;
    esac
    return 0
}

# Đặt chuỗi trong nháy đơn để người dùng chép lệnh chạy được với đường dẫn có dấu và khoảng trắng.
shell_quote() {
    printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}

find_tool() {
    command -v "$1" 2>/dev/null || return 1
}

# Đọc một trường của tiến trình bằng ps (dùng chung cho macOS và Linux): pid, pgid, lstart, comm, command.
proc_field() {
    local out
    is_number "$1" || return 1
    if [ "$2" = lstart ]; then
        # Tên tháng/thứ theo locale C để so sánh và phân tích được.
        out=$(LC_ALL=C ps -ww -o "$2=" -p "$1" 2>/dev/null) || return 1
    else
        out=$(ps -ww -o "$2=" -p "$1" 2>/dev/null) || return 1
    fi
    out=$(trim "$out")
    [ -n "$out" ] || return 1
    printf '%s' "$out"
}

# Hai thời điểm tạo (lstart) cùng là một tiến trình: trùng chuỗi, hoặc lệch tối đa 2 giây.
# Linux tính lstart từ btime nên giá trị có thể trôi 1-2 giây khi đồng hồ được chỉnh;
# macOS lưu thời điểm tạo cố định. Chuỗi không phân tích được thì phải trùng hoàn toàn.
same_start() {
    printf '%s\n%s\n' "$1" "$2" | awk '
        function secs(s,    f, n, m, d, y, t, era, yoe, mp, doy, doe) {
            n = split(s, f, / /)
            if (n != 5) return -1
            m = index("JanFebMarAprMayJunJulAugSepOctNovDec", f[2])
            if (m == 0 || (m - 1) % 3 != 0) return -1
            m = (m + 2) / 3
            if (f[3] !~ /^[0-9]+$/ || f[5] !~ /^[0-9]+$/ || f[4] !~ /^[0-9]+:[0-9]+:[0-9]+$/) return -1
            d = f[3] + 0
            y = f[5] + 0
            split(f[4], t, ":")
            if (m <= 2) y = y - 1
            era = int(y / 400)
            yoe = y - era * 400
            mp = (m + 9) % 12
            doy = int((153 * mp + 2) / 5) + d - 1
            doe = yoe * 365 + int(yoe / 4) - int(yoe / 100) + doy
            return (era * 146097 + doe) * 86400 + t[1] * 3600 + t[2] * 60 + t[3]
        }
        { gsub(/[ \t]+/, " "); sub(/^ /, ""); sub(/ $/, ""); v[NR] = $0 }
        END {
            if (v[1] == "" || v[2] == "") exit 1
            if (v[1] == v[2]) exit 0
            a = secs(v[1])
            b = secs(v[2])
            if (a < 0 || b < 0) exit 1
            diff = a - b
            if (diff < 0) diff = -diff
            exit (diff <= 2) ? 0 : 1
        }'
}

proc_name() {
    local comm
    comm=$(proc_field "$1" comm) || comm='không rõ tên'
    printf '%s' "${comm##*/}"
}

# Mọi PID thuộc nhóm tiến trình PGID.
group_members() {
    is_number "$1" || return 0
    ps -A -o pid=,pgid= 2>/dev/null | awk -v g="$1" '$2 == g { print $1 }'
}

# PID đang LISTEN ở cổng TCP. lsof trả 1 khi không có kết quả.
port_listeners() {
    local out=""
    out=$(lsof -nP -t -iTCP:"$1" -sTCP:LISTEN 2>/dev/null) || true
    printf '%s\n' "$out" | awk '/^[0-9]+$/ { print }' | sort -u
}

print_port_owner() {
    say "Cổng $1 đang được giữ bởi PID $2 ($(proc_name "$2"))."
}

new_token() {
    od -An -N16 -tx1 /dev/urandom | tr -d ' \n'
}

runner_label() {
    printf 'flashsale-dev-%s-%s-%s' "$1" "$PROJECT_TAG" "$2"
}

record_value() {
    printf '%s\n' "$1" | awk -v key="$2" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }'
}

init_caller() {
    CALLER_PGID=$(proc_field "$$" pgid) || fail "Không đọc được nhóm tiến trình bằng ps. Kiểm tra lệnh ps của hệ thống rồi thử lại."
}

# Nhóm được phép nhận tín hiệu: số dương lớn hơn 1 và khác nhóm của lệnh đang gọi script.
safe_group() {
    is_number "$1" || return 1
    [ "$1" -gt 1 ] || return 1
    is_number "$CALLER_PGID" || return 1
    [ "$1" != "$CALLER_PGID" ] || return 1
    return 0
}

# ---------------- Khóa vòng đời ----------------

lock_identity() {
    local start
    start=$(proc_field "$$" lstart) || return 1
    printf 'pid=%s\nstart=%s' "$$" "$start"
}

# Gỡ khóa cũ chỉ khi chứng minh được tiến trình giữ khóa đã chết (hoặc PID đã bị tái sử dụng).
recover_stale_lock() {
    local owner pid start current moved
    if [ ! -f "$LOCK_DIR/owner" ]; then
        say "Khóa .dev/lifecycle.lock.d chưa ghi chủ sở hữu. Nếu chắc chắn không còn lệnh start/stop nào chạy, xóa thư mục đó rồi thử lại."
        return 1
    fi
    owner=$(cat "$LOCK_DIR/owner" 2>/dev/null) || return 1
    pid=$(record_value "$owner" pid)
    start=$(record_value "$owner" start)
    if ! is_number "$pid" || [ -z "$start" ]; then
        say "Không đọc được chủ sở hữu khóa .dev/lifecycle.lock.d. Nếu chắc chắn không còn lệnh start/stop nào chạy, xóa thư mục đó rồi thử lại."
        return 1
    fi
    current=$(proc_field "$pid" lstart) || current=""
    if [ -n "$current" ] && same_start "$current" "$start"; then
        return 1
    fi
    moved="$DEV_ROOT/lifecycle.stale.$$"
    [ ! -e "$moved" ] || return 1
    mv -- "$LOCK_DIR" "$moved" 2>/dev/null || return 1
    if [ "$(cat "$moved/owner" 2>/dev/null)" = "$owner" ]; then
        rm -f -- "$moved/owner"
        rmdir -- "$moved" 2>/dev/null || true
        say "Đã gỡ khóa cũ của PID $pid vì tiến trình đó không còn chạy."
        return 0
    fi
    # Một lệnh khác vừa lấy khóa mới. Trả khóa về chỗ cũ nếu còn trống.
    if [ ! -e "$LOCK_DIR" ]; then
        mv -- "$moved" "$LOCK_DIR" 2>/dev/null || true
    fi
    return 1
}

enter_lock() {
    local me attempt=0
    mkdir -p -- "$DEV_ROOT" || fail "Không tạo được thư mục .dev. Kiểm tra quyền ghi ở thư mục dự án."
    me=$(lock_identity) || fail "Không đọc được thông tin tiến trình hiện tại bằng ps."
    while :; do
        if mkdir -- "$LOCK_DIR" 2>/dev/null; then
            LOCK_HELD=1
            LOCK_OWNER=$me
            printf '%s\n' "$me" >"$LOCK_DIR/owner"
            return 0
        fi
        [ -d "$LOCK_DIR" ] || fail "Không tạo được khóa .dev/lifecycle.lock.d. Kiểm tra quyền ghi thư mục .dev."
        [ "$attempt" -eq 0 ] || break
        attempt=1
        recover_stale_lock || break
    done
    fail "Một lệnh start/stop đang chạy. Hãy đợi rồi thử lại."
}

# Chỉ nhả khóa do chính lần chạy này tạo.
leave_lock() {
    [ "$LOCK_HELD" -eq 1 ] || return 0
    LOCK_HELD=0
    if [ "$(cat "$LOCK_DIR/owner" 2>/dev/null)" = "$LOCK_OWNER" ]; then
        rm -f -- "$LOCK_DIR/owner"
        rmdir -- "$LOCK_DIR" 2>/dev/null || true
    fi
    return 0
}

# ---------------- Bản ghi PID ----------------

record_path() {
    printf '%s/%s.owner' "$DEV_ROOT" "$1"
}

read_record() {
    local file content
    REC_PID=""
    REC_PGID=""
    REC_START=""
    REC_TOKEN=""
    file=$(record_path "$1")
    [ -f "$file" ] || return 1
    content=$(cat "$file" 2>/dev/null) || return 1
    REC_PID=$(record_value "$content" pid)
    REC_PGID=$(record_value "$content" pgid)
    REC_START=$(record_value "$content" start)
    REC_TOKEN=$(record_value "$content" token)
    is_number "$REC_PID" || return 1
    is_number "$REC_PGID" || return 1
    [ -n "$REC_START" ] || return 1
    case "$REC_TOKEN" in
        '' | *[!0-9a-f]*) return 1 ;;
    esac
    [ "${#REC_TOKEN}" -eq 32 ] || return 1
    return 0
}

write_record() {
    local service=$1 tmp
    tmp="$DEV_ROOT/$service.owner.tmp.$$"
    printf 'pid=%s\npgid=%s\nstart=%s\ntoken=%s\n' "$2" "$3" "$4" "$5" >"$tmp"
    mv -f -- "$tmp" "$(record_path "$service")"
    printf '%s\n' "$2" >"$DEV_ROOT/$service.pid"
}

clear_record() {
    rm -f -- "$DEV_ROOT/$1.pid" "$(record_path "$1")"
}

# Runner còn sống đúng như lúc khởi động: cùng PID, cùng thời điểm tạo, là trưởng nhóm riêng,
# khác nhóm của lệnh đang gọi và dòng lệnh mang nhãn của dự án này.
verify_leader() {
    local service=$1 pid=$2 start=$3 token=$4 pgid current command
    pgid=$(proc_field "$pid" pgid) || return 1
    current=$(proc_field "$pid" lstart) || return 1
    command=$(proc_field "$pid" command) || return 1
    [ "$pgid" = "$pid" ] || return 1
    same_start "$current" "$start" || return 1
    safe_group "$pgid" || return 1
    case "$command" in
        *"$(runner_label "$service" "$token")"*) return 0 ;;
    esac
    return 1
}

# In PGID của nhóm dịch vụ đã xác minh, hoặc trả 1.
owned_group() {
    read_record "$1" || return 1
    [ "$REC_PID" = "$REC_PGID" ] || return 1
    verify_leader "$1" "$REC_PID" "$REC_START" "$REC_TOKEN" || return 1
    printf '%s' "$REC_PGID"
}

# Node chạy từ thư mục backend/ hoặc frontend/ của đúng dự án này (fallback khi mất file PID).
project_node() {
    local pid=$1 service=$2 comm command prefix rest segment
    comm=$(proc_field "$pid" comm) || return 1
    [ "${comm##*/}" = node ] || return 1
    command=$(proc_field "$pid" command) || return 1
    prefix="$PROJECT_ROOT/$(service_folder "$service")/"
    case "$command" in
        *"$prefix"*) ;;
        *) return 1 ;;
    esac
    rest=${command#*"$prefix"}
    segment=${rest%% *}
    case "/$segment/" in
        */../*) return 1 ;;
    esac
    return 0
}

# Gửi TERM cho cả nhóm đã xác minh, chờ, rồi KILL các thành viên còn lại khi nhóm vẫn là nhóm cũ.
stop_group() {
    local pgid=$1 snapshot member start old i ours
    safe_group "$pgid" || return 1
    snapshot=$(LC_ALL=C ps -A -o pid=,pgid=,lstart= 2>/dev/null | awk -v g="$pgid" '$2 == g { id = $1; $1 = ""; $2 = ""; sub(/^ +/, ""); print id "|" $0 }') || snapshot=""
    kill -TERM -- "-$pgid" 2>/dev/null || true
    i=0
    while [ "$i" -lt 40 ]; do
        [ -n "$(group_members "$pgid")" ] || return 0
        sleep 0.25
        i=$((i + 1))
    done
    ours=0
    for member in $(group_members "$pgid"); do
        start=$(proc_field "$member" lstart) || continue
        old=$(printf '%s\n' "$snapshot" | awk -F'|' -v p="$member" '$1 == p { print $2; exit }')
        if [ -n "$old" ] && same_start "$old" "$start"; then
            ours=1
        fi
    done
    if [ "$ours" -eq 1 ]; then
        for member in $(group_members "$pgid"); do
            kill -KILL "$member" 2>/dev/null || true
        done
    fi
    i=0
    while [ "$i" -lt 20 ]; do
        [ -n "$(group_members "$pgid")" ] || return 0
        sleep 0.25
        i=$((i + 1))
    done
    say "[CẢNH BÁO] Nhóm tiến trình $pgid vẫn còn thành viên sau khi dừng."
    return 1
}

# Fallback theo cổng: chỉ xử lý node của dự án. Nhóm runner của dự án thì dừng cả nhóm;
# nhóm lạ thì chỉ dừng đúng tiến trình node đó; nhóm của lệnh đang gọi thì không đụng tới.
stop_listener() {
    local service=$1 pid=$2 pgid leader start i
    project_node "$pid" "$service" || return 1
    pgid=$(proc_field "$pid" pgid) || return 1
    start=$(proc_field "$pid" lstart) || return 1
    if safe_group "$pgid" && [ "$(proc_field "$pgid" pgid || true)" = "$pgid" ]; then
        leader=$(proc_field "$pgid" command) || leader=""
        case "$leader" in
            *"flashsale-dev-$service-$PROJECT_TAG-"*)
                stop_group "$pgid"
                return $?
                ;;
        esac
    fi
    if [ "$pgid" = "$CALLER_PGID" ]; then
        say "PID $pid thuộc cùng nhóm tiến trình với lệnh đang chạy, không dừng."
        return 1
    fi
    same_start "$(proc_field "$pid" lstart || true)" "$start" || return 1
    project_node "$pid" "$service" || return 1
    kill -TERM "$pid" 2>/dev/null || true
    i=0
    while [ "$i" -lt 20 ]; do
        [ -n "$(proc_field "$pid" pid || true)" ] || return 0
        sleep 0.25
        i=$((i + 1))
    done
    return 1
}

# ---------------- Sức khỏe dịch vụ ----------------

api_healthy() {
    local host code
    for host in 127.0.0.1 '[::1]'; do
        code=$(curl -g -s -o /dev/null -w '%{http_code}' --max-time 1 --noproxy '*' "http://$host:5000/api/health" 2>/dev/null) || code=""
        if [ "$code" = 200 ]; then
            return 0
        fi
    done
    return 1
}

# Dịch vụ sẵn sàng khi cổng có listener, mọi listener thuộc đúng nhóm, và API trả 200.
service_ready() {
    local service=$1 group pid listeners
    group=$(get_group "$service")
    [ -n "$group" ] || return 1
    listeners=$(port_listeners "$(service_port "$service")")
    [ -n "$listeners" ] || return 1
    for pid in $listeners; do
        [ "$(proc_field "$pid" pgid || true)" = "$group" ] || return 1
    done
    if [ "$service" = api ]; then
        api_healthy || return 1
    fi
    return 0
}

print_links() {
    local service
    say "Frontend: $WEB_URL"
    say "API health: $HEALTH_URL"
    for service in $DEV_SERVICES; do
        say "tail -f $(shell_quote "$LOG_ROOT/$service.log")"
    done
    say "$(shell_quote "$DEV_SCRIPT_DIR/stop.sh")"
}

reject_windows_shell() {
    case "$(uname -s 2>/dev/null || printf unknown)" in
        MINGW* | MSYS* | CYGWIN*)
            say "[LỖI] Script .sh dành cho macOS. Trên Windows hãy chạy scripts\\$1.ps1 bằng PowerShell."
            exit 1
            ;;
    esac
    return 0
}
