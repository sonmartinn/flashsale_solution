#!/usr/bin/env bash
# Khởi động môi trường dev trên macOS (bash 3.2). Cùng hành vi và tham số với scripts/start.ps1.
set -euo pipefail

print_help() {
    echo 'Cách chạy: ./scripts/start.sh [--seed] [--help]'
    echo 'Tùy chọn --seed xóa dữ liệu cũ và tạo lại dữ liệu mẫu. Chỉ dùng script này cho môi trường dev.'
}

SEED=0
for arg in ${1+"$@"}; do
    case "$arg" in
        --seed) SEED=1 ;;
        --help | -h)
            print_help
            exit 0
            ;;
        *)
            echo "[LỖI] Tham số không hợp lệ: $arg"
            print_help
            exit 1
            ;;
    esac
done

# shellcheck source=scripts/dev-common.sh
. "$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/dev-common.sh"
reject_windows_shell start

NEW_SERVICES=""
NODE=""
NPM=""
DOCKER=""

# Tạo backend/.env từ .env.example với JWT_SECRET ngẫu nhiên 32 byte. Ghi độc quyền (flag wx), không in secret.
ENV_JS='const fs=require("node:fs");try{const t=fs.readFileSync(".env.example","utf8");if(!/^JWT_SECRET=[^\r\n]*/m.test(t))process.exit(1);fs.writeFileSync(".env",t.replace(/^JWT_SECRET=[^\r\n]*/m,"JWT_SECRET="+require("node:crypto").randomBytes(32).toString("hex")),{flag:"wx"});}catch(e){if(e.code!=="EEXIST")process.exit(1);}'
# Dùng cùng cách nạp cấu hình với seed. Chỉ tự seed đúng database vừa đếm và Redis dev.
SEED_TARGET_JS='require("dotenv/config");const e=process.env;const m=e.MONGODB_URI?.trim(),r=e.REDIS_URL?.trim();if(m!=="mongodb://127.0.0.1:27018/flashsale")process.exit(1);if(!["redis://127.0.0.1:6379","redis://127.0.0.1:6379/","redis://127.0.0.1:6379/0"].includes(r))process.exit(1);'
# Runner đổi thư mục qua tham số vị trí (không ghép chuỗi lệnh), rồi chạy npm run dev.
# Runner ở lại làm trưởng nhóm để dòng lệnh giữ nhãn ASCII của dự án cho bước stop.
RUNNER_JS='cd -- "$1" || exit 1
"$2" run dev
code=$?
if [ "$code" -ne 0 ]; then echo "npm run dev kết thúc với mã $code."; fi
exit "$code"'

on_exit() {
    local status=$? service log group
    set +e
    trap - EXIT HUP INT TERM
    if [ "$status" -ne 0 ]; then
        for service in $NEW_SERVICES; do
            log="$LOG_ROOT/$service.log"
            if [ -f "$log" ]; then
                say "Log gần nhất của $service ($log)"
                tail -n 20 "$log"
            fi
            group=$(owned_group "$service")
            if [ -z "$group" ] || stop_group "$group"; then
                clear_record "$service"
            fi
        done
    fi
    leave_lock
    exit "$status"
}

check_tools() {
    local tool version major minor npm_version compose re
    for tool in lsof ps curl nohup od cksum openssl; do
        find_tool "$tool" >/dev/null || fail "Thiếu $tool. Script cần công cụ có sẵn của macOS: lsof, ps, curl, nohup, od, cksum, openssl."
    done
    NODE=$(find_tool node) || fail 'Thiếu node. Hãy cài Node.js LTS (kèm npm) và Docker Desktop (kèm Compose v2), rồi mở lại terminal.'
    NPM=$(find_tool npm) || fail 'Thiếu npm. Hãy cài Node.js LTS (kèm npm) và Docker Desktop (kèm Compose v2), rồi mở lại terminal.'
    DOCKER=$(find_tool docker) || fail 'Thiếu docker. Hãy cài Node.js LTS (kèm npm) và Docker Desktop (kèm Compose v2), rồi mở lại terminal.'
    version=$("$NODE" --version 2>/dev/null) || version=""
    re='^v([0-9]+)\.([0-9]+)\.[0-9]+$'
    if ! [[ $version =~ $re ]]; then
        fail 'Không đọc được phiên bản Node.js. Hãy cài Node.js LTS rồi thử lại.'
    fi
    major=${BASH_REMATCH[1]}
    minor=${BASH_REMATCH[2]}
    if ! { [ "$major" -eq 20 ] && [ "$minor" -ge 19 ]; } &&
        ! { [ "$major" -eq 22 ] && [ "$minor" -ge 12 ]; } &&
        ! [ "$major" -gt 22 ]; then
        fail "Node.js $version không tương thích. Hãy dùng Node 20.19+ (nhánh 20) hoặc 22.12+."
    fi
    npm_version=$("$NPM" --version 2>/dev/null) || fail 'npm không chạy được. Kiểm tra bản cài Node.js.'
    [ -n "$npm_version" ] || fail 'npm không chạy được. Kiểm tra bản cài Node.js.'
    compose=$("$DOCKER" compose version --short 2>/dev/null) || compose=""
    re='^v?([0-9]+)\.'
    if ! [[ $compose =~ $re ]] || [ "${BASH_REMATCH[1]}" -lt 2 ]; then
        fail 'Cần Docker Compose v2 hoặc mới hơn. Kiểm tra bản cài Docker Desktop.'
    fi
}

wait_docker() {
    local deadline
    if "$DOCKER" info >/dev/null 2>&1; then
        return 0
    fi
    if ! open -a Docker >/dev/null 2>&1; then
        fail 'Docker daemon chưa chạy và không mở được Docker Desktop. Hãy mở hoặc cài Docker Desktop rồi thử lại.'
    fi
    deadline=$((SECONDS + 120))
    while [ "$SECONDS" -lt "$deadline" ]; do
        sleep 2
        if "$DOCKER" info >/dev/null 2>&1; then
            return 0
        fi
    done
    fail 'Hết thời gian chờ Docker Desktop. Kiểm tra Docker daemon đã sẵn sàng rồi thử lại.'
}

check_running() {
    local service group pid pgid foreign=0 attempt
    for service in $DEV_SERVICES; do
        group=$(owned_group "$service") || group=""
        set_group "$service" "$group"
    done
    for service in $DEV_SERVICES; do
        group=$(get_group "$service")
        for pid in $(port_listeners "$(service_port "$service")"); do
            pgid=$(proc_field "$pid" pgid) || pgid=""
            if [ -z "$group" ] || [ "$pgid" != "$group" ]; then
                print_port_owner "$(service_port "$service")" "$pid"
                foreign=1
            fi
        done
    done
    if [ "$foreign" -eq 1 ]; then
        fail 'Cổng dev đang bận. Kiểm tra tiến trình được báo trước khi chạy start lại.'
    fi
    if [ -n "$API_GROUP" ] || [ -n "$WEB_GROUP" ]; then
        if [ -n "$API_GROUP" ] && [ -n "$WEB_GROUP" ]; then
            # Cho tiến trình đang tải lại một khoảng ngắn để nhận kết nối trở lại.
            attempt=0
            while [ "$attempt" -lt 6 ]; do
                if service_ready api && service_ready web; then
                    say 'Backend và frontend đang chạy.'
                    print_links
                    exit 0
                fi
                sleep 0.2
                attempt=$((attempt + 1))
            done
        fi
        fail 'Môi trường chỉ đang chạy một phần. Chạy ./scripts/stop.sh --keep-db trước khi khởi động lại.'
    fi
    for service in $DEV_SERVICES; do
        clear_record "$service"
    done
}

init_env() {
    if [ -f "$PROJECT_ROOT/backend/.env" ]; then
        say 'Giữ nguyên backend/.env.'
        return 0
    fi
    if ! (cd -- "$PROJECT_ROOT/backend" && "$NODE" -e "$ENV_JS") >/dev/null 2>&1; then
        fail 'Không tạo được backend/.env. Kiểm tra .env.example và quyền ghi thư mục backend.'
    fi
}

lock_hash() {
    local out
    out=$(openssl dgst -sha256 <"$1" 2>/dev/null) || return 1
    out=${out##* }
    case "$out" in
        '' | *[!0-9a-fA-F]*) return 1 ;;
    esac
    printf '%s' "$out"
}

install_deps() {
    local package=$1 dir marker hash after code=0
    dir="$PROJECT_ROOT/$package"
    marker="$DEV_ROOT/$package.lock.sha256"
    hash=$(lock_hash "$dir/package-lock.json") || fail "Không đọc được package-lock.json của $package. Kiểm tra file và lệnh openssl."
    if [ -d "$dir/node_modules" ] && [ -f "$marker" ] && [ "$(cat "$marker")" = "$hash" ]; then
        say "Bỏ qua npm ci cho $package."
        return 0
    fi
    rm -f -- "$marker"
    (cd -- "$dir" && "$NPM" ci) >/dev/null 2>&1 || code=$?
    if [ "$code" -ne 0 ]; then
        fail "npm ci thất bại ở $package (mã $code). Kiểm tra mạng và package-lock.json, rồi thử lại."
    fi
    after=$(lock_hash "$dir/package-lock.json") || after=""
    [ "$after" = "$hash" ] || fail "package-lock.json của $package đã đổi trong lúc cài. Chạy start lại."
    printf '%s' "$hash" >"$marker"
}

seed_if_needed() {
    local count code=0
    if [ "$SEED" -ne 1 ]; then
        count=$("$DOCKER" exec flashsale-mongo mongosh flashsale --quiet --eval 'db.users.countDocuments()' 2>/dev/null) || code=$?
        if [ "$code" -ne 0 ] || ! is_number "$count"; then
            fail 'Không đếm được người dùng trong MongoDB. Kiểm tra flashsale-mongo và chạy start lại.'
        fi
        case "$count" in
            *[!0]*)
                say 'Đã có người dùng, bỏ qua seed.'
                return 0
                ;;
        esac
        if ! (cd -- "$PROJECT_ROOT/backend" && "$NODE" -e "$SEED_TARGET_JS") >/dev/null 2>&1; then
            fail 'Cấu hình MongoDB hoặc Redis khác môi trường dev mặc định. Kiểm tra đích dữ liệu trước khi yêu cầu --seed.'
        fi
    else
        say '[CẢNH BÁO] --seed sẽ xóa dữ liệu MongoDB và Redis đã cấu hình rồi tạo lại dữ liệu mẫu.'
    fi
    (cd -- "$PROJECT_ROOT/backend" && "$NPM" run seed) >/dev/null 2>&1 || code=$?
    if [ "$code" -ne 0 ]; then
        fail "Seed thất bại (mã $code). Kiểm tra cấu hình MongoDB và Redis trước khi thử lại."
    fi
}

# Chạy npm run dev trong một nhóm tiến trình riêng (job control của bash, không cần setsid),
# bỏ qua SIGHUP bằng nohup, stdin từ /dev/null, stdout và stderr vào log chuẩn.
launch_service() {
    local service=$1 folder token label log pid pgid start command
    folder=$(service_folder "$service")
    token=$(new_token)
    case "$token" in
        '' | *[!0-9a-f]*) fail 'Không tạo được mã nhận diện tiến trình từ /dev/urandom.' ;;
    esac
    [ "${#token}" -eq 32 ] || fail 'Không tạo được mã nhận diện tiến trình từ /dev/urandom.'
    label=$(runner_label "$service" "$token")
    log="$LOG_ROOT/$service.log"
    set -m
    nohup "$BASH" -c "$RUNNER_JS" "$label" "$PROJECT_ROOT/$folder" "$NPM" </dev/null >"$log" 2>&1 &
    pid=$!
    set +m
    pgid=$(proc_field "$pid" pgid) || pgid=""
    start=$(proc_field "$pid" lstart) || start=""
    command=$(proc_field "$pid" command) || command=""
    if [ -z "$pgid" ] || [ -z "$start" ]; then
        NEW_SERVICES="$NEW_SERVICES $service"
        fail "Không xác nhận được tiến trình $service. Xem .dev/logs/$service.log rồi thử lại."
    fi
    # Ghi nhóm chỉ khi job control đã tách runner khỏi nhóm của lệnh đang gọi.
    if [ "$pgid" != "$pid" ] || ! safe_group "$pgid"; then
        kill -TERM "$pid" 2>/dev/null || true
        fail "Không tạo được nhóm tiến trình riêng cho $service. Hãy chạy start từ Terminal rồi thử lại."
    fi
    case "$command" in
        *"$label"*) ;;
        *)
            kill -TERM -- "-$pgid" 2>/dev/null || true
            fail "Không xác nhận được tiến trình $service. Xem .dev/logs/$service.log rồi thử lại."
            ;;
    esac
    write_record "$service" "$pid" "$pgid" "$start" "$token"
    NEW_SERVICES="$NEW_SERVICES $service"
    set_group "$service" "$pgid"
}

wait_services() {
    local deadline service ready pending
    deadline=$((SECONDS + 30))
    while :; do
        for service in $DEV_SERVICES; do
            owned_group "$service" >/dev/null || fail "Tiến trình $service đã thoát khi khởi động. Kiểm tra log rồi thử lại."
        done
        ready=0
        pending=""
        for service in $DEV_SERVICES; do
            if service_ready "$service"; then
                ready=$((ready + 1))
            else
                pending="$pending, $service"
            fi
        done
        [ "$ready" -lt 2 ] || return 0
        [ "$SECONDS" -lt "$deadline" ] || break
        sleep 0.25
    done
    fail "Hết thời gian chờ dịch vụ ${pending#, }. Kiểm tra log và cổng rồi thử lại."
}

trap on_exit EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

say '[1/10] Về thư mục gốc dự án.'
cd -- "$PROJECT_ROOT"
init_caller
enter_lock

say '[2/10] Kiểm tra Node.js, npm, Docker và Docker Compose.'
check_tools

say '[3/10] Kiểm tra Docker daemon.'
wait_docker

say '[4/10] Kiểm tra tiến trình và cổng 5000, 5173.'
check_running

say '[5/10] Khởi động MongoDB và Redis bằng Docker Compose.'
compose_code=0
"$DOCKER" compose up -d --wait >/dev/null 2>&1 || compose_code=$?
if [ "$compose_code" -ne 0 ]; then
    fail "Docker Compose không khởi động được (mã $compose_code). Kiểm tra docker compose ps, docker compose logs và cổng MongoDB 27018, Redis 6379."
fi

say '[6/10] Kiểm tra cấu hình backend.'
init_env

say '[7/10] Cài thư viện khi cần.'
install_deps backend
install_deps frontend

say '[8/10] Kiểm tra có cần seed dữ liệu mẫu.'
seed_if_needed

say '[9/10] Khởi động backend và frontend ở chế độ nền.'
mkdir -p -- "$LOG_ROOT"
launch_service api
launch_service web

say '[10/10] Chờ API health và cổng frontend.'
wait_services
print_links
exit 0
