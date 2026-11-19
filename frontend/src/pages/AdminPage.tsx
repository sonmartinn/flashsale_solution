import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthProvider.tsx";
import { ErrorPanel } from "../components/Layout.tsx";
import { usePolling } from "../hooks/usePolling.ts";
import { readSaleId, remainingByMode, saleModes, saleStatusLabel, syncStatus, type SaleMode, type SaleStats } from "../services/admin-state.ts";
import { getSaleStats, resetSale } from "../services/admin.ts";
import { ApiError } from "../services/api.ts";
import { getActiveSales, getSale } from "../services/catalog.ts";
import { createSingleFlight } from "../services/sale-state.ts";

function SalePicker({ initial, select }: { initial: string | null; select: (saleId: string) => void }) {
  const [error, setError] = useState(initial !== null && !readSaleId(initial));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("saleId");
    const id = readSaleId(typeof value === "string" ? value : null);
    setError(!id);
    if (id) select(id);
  }

  return <form className="admin-picker" onSubmit={submit}>
    <div className="auth-field">
      <label htmlFor="admin-sale-id">Mã đợt sale</label>
      <input id="admin-sale-id" name="saleId" defaultValue={initial ?? ""} autoComplete="off" spellCheck={false}
        aria-invalid={error || undefined} aria-describedby={error ? "admin-sale-id-error" : undefined} />
      {error && <p id="admin-sale-id-error" className="field__error" role="alert">Nhập mã đợt sale gồm 24 ký tự hệ thập lục phân.</p>}
    </div>
    <button className="btn btn--primary" type="submit">Xem số liệu</button>
  </form>;
}

const number = new Intl.NumberFormat("vi-VN");
const stock = (value: number | null) => value === null ? "Chưa nạp" : number.format(value);

function StatsView({ stats }: { stats: SaleStats }) {
  const remaining = remainingByMode(stats);
  const sync = syncStatus(stats);
  return <>
    <dl className="admin-totals">
      <div><dt>Đơn thành công</dt><dd>{number.format(stats.orders)} / {number.format(stats.totalQty)}</dd></div>
      <div><dt>Tồn theo {stats.mode.toUpperCase()}</dt><dd className={remaining !== null && remaining < 0 ? "stock--negative" : undefined}>{stock(remaining)}</dd></div>
      <div><dt>Số đơn bán vượt</dt><dd className={stats.oversold > 0 ? "stock--negative" : undefined}>{number.format(stats.oversold)}</dd></div>
    </dl>
    <dl className="admin-details">
      <div><dt>Mã đợt sale</dt><dd><code>{stats.saleId}</code></dd></div>
      <div><dt>Chế độ</dt><dd>{stats.mode.toUpperCase()}</dd></div>
      <div><dt>Trạng thái</dt><dd>{saleStatusLabel[stats.status]}</dd></div>
      <div><dt>Tồn MongoDB</dt><dd>{stock(stats.mongoRemaining)}</dd></div>
      <div><dt>Tồn Redis</dt><dd>{stock(stats.redisStock)}</dd></div>
      <div><dt>Người mua trong Redis</dt><dd>{number.format(stats.redisBuyers)}</dd></div>
      <div><dt>Người dùng có đơn</dt><dd>{number.format(stats.distinctUsers)}</dd></div>
      <div><dt>Chỉ mục đơn duy nhất</dt><dd>{stats.uniqueOrderIndex ? "Có" : "Thiếu"}</dd></div>
      <div>
        <dt>Đối chiếu Redis–MongoDB</dt>
        <dd><span className={`admin-sync${stats.mode === "v2" && stats.redisInSync === false ? " stock--negative" : ""}`}>{sync}</span></dd>
      </div>
    </dl>
    {stats.mode === "v2" && <p className="admin-note">Đối chiếu số tồn và số người mua tại thời điểm đọc.</p>}
    <Link className="admin-sale-link" to={`/sales/${stats.saleId}`}>Mở trang đợt sale</Link>
  </>;
}

interface StatsSnapshot { stats: SaleStats; updatedAt: Date }

function SaleMonitor({ id }: { id: string }) {
  const { generation, store } = useAuth();
  const [paused, setPaused] = useState(false);
  const [terminal, setTerminal] = useState(false);
  const [snapshot, setSnapshot] = useState<StatsSnapshot>();
  const [readError, setReadError] = useState("");
  const [resetting, setResetting] = useState(false);
  const [choice, setChoice] = useState<SaleMode>();
  const [confirmation, setConfirmation] = useState<SaleMode>();
  const [result, setResult] = useState<{ success: boolean; message: string }>();
  const [flight] = useState(createSingleFlight);
  const opener = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const active = useRef(true);
  const readAfterReset = useRef(false);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => {
    if (confirmation) cancel.current?.focus();
  }, [confirmation]);

  function finishResetRead(stop = paused) {
    if (!readAfterReset.current) return;
    readAfterReset.current = false;
    polling.setPaused(stop);
    setResetting(false);
  }

  const polling = usePolling({
    key: `${generation}:${id}`,
    paused: paused || resetting || terminal,
    async read(signal) {
      if (!readAfterReset.current) return getSaleStats(store, id, signal);
      // Reset trả DTO riêng. Đọc cả hai nguồn trước khi phục hồi trạng thái cập nhật.
      const [stats, detail] = await Promise.allSettled([getSaleStats(store, id, signal), getSale(id, signal)]);
      if (stats.status === "rejected") throw stats.reason;
      if (detail.status === "rejected") throw detail.reason;
      if (detail.value.sale?.id !== id) throw new Error("Phản hồi sai đợt sale.");
      return stats.value;
    },
    onData(stats) {
      if (!store.isCurrent(generation)) return;
      setSnapshot({ stats, updatedAt: new Date() });
      setReadError("");
      setTerminal(false);
      finishResetRead();
    },
    onError(cause) {
      if (!store.isCurrent(generation)) return;
      const forbidden = cause instanceof ApiError && cause.status === 403;
      const missing = cause instanceof ApiError && cause.status === 404;
      if (forbidden || missing) setTerminal(true);
      setReadError(forbidden ? "Không đủ quyền đọc số liệu." : missing ? "Không tìm thấy đợt sale." : "Không đọc được số liệu.");
      finishResetRead(paused || forbidden || missing);
    },
  });

  function togglePause() {
    polling.setPaused(!paused || terminal);
    setPaused(!paused);
  }

  function refreshStats() {
    polling.refresh();
  }

  function dismiss() {
    setConfirmation(undefined);
    opener.current?.focus();
  }

  function confirmReset() {
    if (!confirmation || !snapshot || resetting || readError) return;
    const mode = confirmation;
    void flight.run(async () => {
      polling.setPaused(true);
      setResetting(true);
      setConfirmation(undefined);
      setResult(undefined);
      try {
        await resetSale(store, id, mode);
        if (!active.current || !store.isCurrent(generation)) return;
        setChoice(undefined);
        setResult({ success: true, message: "Đã reset đợt sale." });
      } catch {
        if (!active.current || !store.isCurrent(generation)) return;
        setResult({ success: false, message: "Chưa xác nhận được kết quả reset. Hãy làm mới số liệu để kiểm tra." });
      }
      readAfterReset.current = true;
      // Tạm mở một lượt đọc. Sau khi nhận dữ liệu, quay về lựa chọn tạm dừng trước reset.
      polling.setPaused(false);
    });
  }

  const mode = choice ?? snapshot?.stats.mode;
  return <>
    <div className="admin-updates">
      <div>
        <p role="status">{resetting ? "Đang xử lý reset và đọc lại số liệu…" : terminal ? "Chờ làm mới số liệu" : paused ? "Đã tạm dừng" : "Đang cập nhật"}</p>
        {snapshot && <p className="admin-note">Cập nhật lúc <time dateTime={snapshot.updatedAt.toISOString()}>{snapshot.updatedAt.toLocaleTimeString("vi-VN")}</time></p>}
      </div>
      <div className="admin-actions">
        <button type="button" className="btn btn--secondary" onClick={togglePause} disabled={resetting}>{paused ? "Tiếp tục cập nhật" : "Tạm dừng cập nhật"}</button>
        <button type="button" className="btn btn--secondary" onClick={refreshStats} disabled={resetting}>Làm mới số liệu</button>
      </div>
    </div>
    <p className="admin-note">Trước khi đo E2, đóng các tab sale và tạm dừng hoặc đóng các tab theo dõi khác.</p>
    {!snapshot && !readError && <p role="status">Đang đọc số liệu…</p>}
    {readError && (snapshot
      ? <p className="field__error" role="alert">Dữ liệu đã cũ. {readError}</p>
      : <ErrorPanel message={readError} retry={refreshStats} />)}
    {snapshot && <StatsView stats={snapshot.stats} />}
    {snapshot && mode && <section className="admin-reset" aria-labelledby="admin-reset-h" aria-busy={resetting}>
      <h2 id="admin-reset-h">Reset đợt sale</h2>
      <div className="admin-actions">
        <div className="auth-field">
          <label htmlFor="reset-mode">Chế độ sau reset</label>
          <select id="reset-mode" value={mode} disabled={resetting || Boolean(confirmation)} onChange={event => setChoice(saleModes.find(value => value === event.currentTarget.value))}>
            {saleModes.map(value => <option key={value} value={value}>{value.toUpperCase()}</option>)}
          </select>
        </div>
        <button ref={opener} type="button" className="btn btn--secondary" aria-expanded={Boolean(confirmation)} aria-controls="reset-confirmation"
          disabled={resetting || Boolean(readError)} onClick={() => setConfirmation(mode)}>Reset đợt sale</button>
      </div>
      <div id="reset-confirmation" hidden={!confirmation} onKeyDown={event => { if (event.key === "Escape") dismiss(); }}>
        <p>Reset sẽ xóa đơn và lịch sử thay đổi tồn kho của đợt sale này, khôi phục tồn kho và mở lại đợt sale trong 7 ngày ở chế độ {confirmation?.toUpperCase()}. Chỉ reset giữa các lượt mua hoặc bắn tải.</p>
        <div className="admin-actions">
          <button ref={cancel} type="button" className="btn btn--secondary" onClick={dismiss}>Giữ nguyên đợt sale</button>
          <button type="button" className="btn btn--primary admin-destructive" disabled={resetting || Boolean(readError)} onClick={confirmReset}>Xác nhận reset đợt sale</button>
        </div>
      </div>
    </section>}
    {result && <p role={result.success ? "status" : "alert"} className={result.success ? undefined : "field__error"}>{result.message}</p>}
  </>;
}

function AdminSelection() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("saleId");
  const [activeSale, setActiveSale] = useState<{ id?: string; failed?: boolean }>();
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (raw !== null) return;
    const controller = new AbortController();
    void getActiveSales(controller.signal).then(({ sales }) => {
      if (!controller.signal.aborted) setActiveSale({ id: sales[0]?.id });
    }).catch(() => {
      if (!controller.signal.aborted) setActiveSale({ failed: true });
    });
    return () => controller.abort();
  }, [raw, retry]);

  const id = raw === null ? activeSale?.id : readSaleId(raw);
  return <main id="top">
    <section className="task-screen" aria-labelledby="admin-heading">
      <div className="wrap admin-wrap">
        <h1 id="admin-heading">Theo dõi đợt sale</h1>
        <SalePicker key={raw === null ? "active" : `sale:${raw}`} initial={raw} select={selected => setParams({ saleId: selected })} />
        {id && <SaleMonitor key={id} id={id} />}
        {raw === null && !activeSale && <p role="status">Đang đọc đợt sale…</p>}
        {raw === null && activeSale?.failed && <ErrorPanel message="Không đọc được danh sách đợt sale." retry={() => { setActiveSale(undefined); setRetry(value => value + 1); }} />}
        {raw === null && activeSale && !activeSale.failed && !id && <div>
          <h2>Chưa có đợt sale đang mở</h2>
          <p>Nhập mã đợt sale để xem số liệu của đợt đó.</p>
        </div>}
      </div>
    </section>
  </main>;
}

export default function AdminPage() {
  const { generation } = useAuth();
  return <AdminSelection key={generation} />;
}
