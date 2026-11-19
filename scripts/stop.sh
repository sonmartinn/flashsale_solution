#!/usr/bin/env bash
# Dừng môi trường dev trên macOS (bash 3.2). Cùng hành vi và tham số với scripts/stop.ps1.
set -euo pipefail

print_help() {
    echo 'Cách chạy: ./scripts/stop.sh [--keep-db] [--help]'
    echo 'Tùy chọn --keep-db giữ MongoDB và Redis tiếp tục chạy.'
}

KEEP_DB=0
for arg in ${1+"$@"}; do
    case "$arg" in
        --keep-db) KEEP_DB=1 ;;
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
reject_windows_shell stop

on_exit() {
    local status=$?
    set +e
    trap - EXIT HUP INT TERM
    leave_lock
    exit "$status"
}

trap on_exit EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

cd -- "$PROJECT_ROOT"
for tool in lsof ps; do
    find_tool "$tool" >/dev/null || fail "Thiếu $tool. Script cần công cụ có sẵn của macOS: lsof, ps."
done
init_caller
enter_lock
stopped=0

say '[1/4] Dừng các cây tiến trình backend và frontend của dự án.'
for service in $DEV_SERVICES; do
    group=$(owned_group "$service") || group=""
    if [ -n "$group" ] && stop_group "$group"; then
        stopped=1
    fi
    for pid in $(port_listeners "$(service_port "$service")"); do
        if stop_listener "$service" "$pid"; then
            stopped=1
        fi
    done
    clear_record "$service"
done

say '[2/4] Xử lý container MongoDB và Redis.'
if [ "$KEEP_DB" -eq 1 ]; then
    say 'Giữ MongoDB và Redis đang chạy.'
else
    DOCKER=$(find_tool docker) || fail 'Thiếu docker. Hãy cài Node.js LTS (kèm npm) và Docker Desktop (kèm Compose v2), rồi mở lại terminal.'
    running=$("$DOCKER" compose ps --status running -q 2>/dev/null) ||
        fail 'Không đọc được trạng thái container. Kiểm tra Docker Desktop hoặc chạy stop --keep-db.'
    "$DOCKER" compose stop >/dev/null 2>&1 ||
        fail 'Không dừng được container. Kiểm tra docker compose ps rồi thử lại.'
    if [ -n "$running" ]; then
        stopped=1
    fi
fi

say '[3/4] Kiểm tra lại cổng 5000, 5173.'
busy=0
for service in $DEV_SERVICES; do
    for pid in $(port_listeners "$(service_port "$service")"); do
        print_port_owner "$(service_port "$service")" "$pid"
        busy=1
    done
done
if [ "$busy" -eq 1 ]; then
    fail 'Cổng dev vẫn đang bận. Kiểm tra các PID được báo.'
fi
say 'Hai cổng dev đã trống.'
say '[4/4] Hoàn tất.'
if [ "$stopped" -eq 0 ]; then
    say 'Không có gì để dừng.'
fi
exit 0
