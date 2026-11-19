import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useAuth } from "../auth/AuthProvider.tsx";
import { ErrorPanel, SaleHero, usePageKit } from "../components/Layout.tsx";
import { usePolling } from "../hooks/usePolling.ts";
import { ApiError } from "../services/api.ts";
import { loginPath, StaleSessionError } from "../services/auth.ts";
import { getProduct, getSale, productAttributes } from "../services/catalog.ts";
import { findSaleOrder, listMyOrders } from "../services/orders.ts";
import {
  awaitingMembership, buyUnavailable, classifyPurchaseError, createSingleFlight, PURCHASE_COPY, remainingSeconds, resolvePurchase, saleEpoch,
  serverTime, synchronizeClock, type MembershipRecord, type PurchaseRecord, type ServerClock,
} from "../services/sale-state.ts";
import type { ProductDto, SaleDto } from "../services/types.ts";

interface SaleSnapshot {
  sale: SaleDto;
  clock: ServerClock;
  updatedAt: Date;
}

function Countdown({ endAt, seconds }: { endAt: string; seconds: number }) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds / 3600) % 24;
  const minutes = Math.floor(seconds / 60) % 60;
  return <div className="sale-countdown">
    <p>Kết thúc lúc <time dateTime={endAt}>{new Date(endAt).toLocaleString("vi-VN")}</time></p>
    <p role="timer" aria-live="off">{days} ngày {hours} giờ {minutes} phút {seconds % 60} giây</p>
  </div>;
}

function ProductDetails({ id }: { id: string }) {
  const [product, setProduct] = useState<ProductDto>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void getProduct(id, controller.signal).then(({ product }) => {
      if (!controller.signal.aborted) setProduct(product);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof ApiError ? cause.message : "Không đọc được thông tin sản phẩm.");
    });
    return () => controller.abort();
  }, [id, revision]);

  const attributes = product ? productAttributes(product.attributes) : [];
  return <section className="sale-specs" aria-labelledby="sale-specs-heading">
    <div className="wrap">
      <h2 id="sale-specs-heading">Thông tin sản phẩm</h2>
      {error && <ErrorPanel message={error} retry={() => { setError(""); setRevision(value => value + 1); }} />}
      {!product && !error && <p role="status">Đang đọc thông tin sản phẩm…</p>}
      {product?.description && <p>{product.description}</p>}
      {attributes.length > 0 && <dl className="product-attributes">
        {attributes.map(([label, value], index) => <div key={index}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>}
    </div>
  </section>;
}

/** 404 hoặc mã sai định dạng: đợt sale không tồn tại, thử đọc lại không giúp được. */
const isMissingSale = (cause: unknown) => cause instanceof ApiError && ((cause.status === 404 && cause.code === "NOT_FOUND") || cause.code === "INVALID_ID");

function SaleDetail({ id }: { id: string }) {
  const { generation, session, store } = useAuth();
  const navigate = useNavigate();
  const returnTo = `/sales/${id}`;
  const stockReady = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [snapshot, setSnapshot] = useState<SaleSnapshot>();
  const [readError, setReadError] = useState("");
  const [missing, setMissing] = useState(false);
  const [tick, setTick] = useState(0);
  const [pending, setPending] = useState(false);
  const [purchase, setPurchase] = useState<PurchaseRecord>();
  const [membership, setMembership] = useState<MembershipRecord>();
  const [membershipFailed, setMembershipFailed] = useState<{ generation: number; epoch: string }>();
  const [membershipRevision, setMembershipRevision] = useState(0);
  // Một bộ đếm cho cả lần mua lẫn lần đọc đơn: biết lần đọc nào bắt đầu SAU kết quả chưa rõ.
  const sequence = useRef(0);
  const [flight] = useState(createSingleFlight);
  const active = useRef(true);
  const root = usePageKit(snapshot !== undefined);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const polling = usePolling({
    key: missing ? null : `${id}:${generation}`,
    read: signal => getSale(id, signal),
    onData({ sale, now }) {
      if (!store.isCurrent(generation)) return;
      const monotonic = performance.now();
      const clock = synchronizeClock(now, monotonic);
      stockReady.current = true;
      setTick(monotonic);
      setSnapshot({ sale, clock, updatedAt: new Date() });
      setRefreshing(false);
      setReadError("");
    },
    onError(cause) {
      if (!store.isCurrent(generation)) return;
      stockReady.current = false;
      if (isMissingSale(cause)) setMissing(true);
      setRefreshing(false);
      setReadError("Không đọc được đợt sale.");
    },
  });

  const epoch = snapshot ? saleEpoch(snapshot.sale) : "";
  const saleId = snapshot?.sale.id;
  const userId = session?.user.id;

  // Đọc lại đơn khi vào trang, đổi phiên, thấy lượt sale mới (reset) hoặc người dùng làm mới; không lưu cờ đã mua.
  useEffect(() => {
    if (!epoch || !saleId || !userId) return;
    const controller = new AbortController();
    const seq = ++sequence.current;
    void listMyOrders(store, controller.signal).then(orders => {
      if (controller.signal.aborted || !store.isCurrent(generation)) return;
      setMembership({ generation, epoch, seq, orderId: findSaleOrder(orders, saleId)?.id });
    }).catch((cause: unknown) => {
      // Lỗi đọc đơn chỉ kết thúc trạng thái "đang kiểm tra" của lần đầu; không mở khóa kết quả chưa rõ. API vẫn chặn mua trùng.
      if (controller.signal.aborted || cause instanceof StaleSessionError) return;
      setMembershipFailed({ generation, epoch });
    });
    return () => controller.abort();
  }, [store, generation, userId, epoch, saleId, membershipRevision]);

  const clock = snapshot?.clock;
  const endAt = snapshot?.sale.endAt;
  useEffect(() => {
    if (!clock || !endAt) return;
    // Cập nhật ngay khi đến endAt, kể cả khi giây cuối ngắn hơn chu kỳ hiển thị.
    const interval = window.setInterval(() => setTick(performance.now()), 1000);
    const untilEnd = Date.parse(endAt) - serverTime(clock, performance.now());
    const boundary = untilEnd > 0 && untilEnd <= 2147483647
      ? window.setTimeout(() => setTick(performance.now()), Math.ceil(untilEnd))
      : undefined;
    return () => {
      window.clearInterval(interval);
      if (boundary !== undefined) window.clearTimeout(boundary);
    };
  }, [clock, endAt]);

  function refreshStock(replace = false) {
    stockReady.current = false;
    setRefreshing(true);
    setReadError("");
    polling.refresh(replace);
  }

  function refresh() {
    refreshStock();
    setMembershipRevision(value => value + 1);
  }

  function buy() {
    if (!snapshot || !stockReady.current || missing) return;
    const sent = { sale: snapshot.sale, epoch: saleEpoch(snapshot.sale) };
    if (buyUnavailable(sent.sale, serverTime(snapshot.clock, performance.now()))) return;

    const current = store.getSnapshot();
    if (!current.session) {
      void navigate(loginPath(returnTo));
      return;
    }
    const view = resolvePurchase({ generation: current.generation, epoch: sent.epoch }, purchase, membership);
    if (view.bought || view.locked) return;
    if (awaitingMembership({ generation: current.generation, epoch: sent.epoch, signedIn: true }, membership, membershipFailed)) return;

    void flight.run(async () => {
      const record = (fields: Pick<PurchaseRecord, "kind" | "message" | "orderId">): PurchaseRecord =>
        ({ generation: current.generation, epoch: sent.epoch, seq: ++sequence.current, ...fields });
      setPurchase(undefined);
      setPending(true);
      try {
        // Đúng một POST, mode lấy từ sale đã đọc, không có retry tự động ở bất kỳ nhánh nào.
        const { order } = await store.request<{ order: { id: string } }>(`/sales/${encodeURIComponent(sent.sale.id)}/buy?mode=${sent.sale.mode}`, {
          method: "POST",
          body: { qty: 1 },
        });
        if (!active.current || !store.isCurrent(current.generation)) return;
        if (!order || typeof order.id !== "string") throw new ApiError(201, "Máy chủ trả đơn không hợp lệ.", "INVALID_RESPONSE");
        setPurchase(record({ kind: "success", message: PURCHASE_COPY.success(order.id), orderId: order.id }));
        refreshStock(true);
      } catch (cause) {
        if (!active.current) return;
        if (cause instanceof ApiError && cause.status === 401 && cause.code === "UNAUTHORIZED") {
          // store.request đã xóa phiên hết hạn; chỉ chuyển trang khi chính lần xóa đó là thay đổi phiên mới nhất.
          const after = store.getSnapshot();
          if (!after.session && after.expired && after.generation === current.generation + 1) void navigate(loginPath(returnTo), { replace: true });
          return;
        }
        // Kết quả của phiên cũ (đăng xuất/đổi tài khoản trong lúc chờ) không bao giờ áp vào trang của phiên mới.
        if (cause instanceof StaleSessionError || !store.isCurrent(current.generation)) return;
        const outcome = classifyPurchaseError(cause);
        setPurchase(record(outcome));
        if (outcome.kind !== "uncertain") refreshStock(true);
      } finally {
        if (active.current) setPending(false);
      }
    });
  }

  if (!snapshot || missing) return <main id="top" ref={root}>
    <section className="task-screen"><div className="wrap">
      <h1>{missing ? PURCHASE_COPY.notFound : "Thông tin đợt sale"}</h1>
      {missing
        ? <p className="sale-missing">Đường dẫn này không trỏ tới đợt sale nào. <Link className="btn btn--primary" to="/#products">Xem sản phẩm</Link></p>
        : readError ? <ErrorPanel message={readError} retry={refresh} /> : <p role="status">Đang đọc đợt sale…</p>}
    </div></section>
  </main>;

  const { sale } = snapshot;
  const now = serverTime(snapshot.clock, tick);
  const view = resolvePurchase({ generation, epoch }, purchase, membership);
  // Chưa có lần đọc đơn nào thành công cho phiên + lượt sale này (và lần đọc chưa báo lỗi): chưa bật nút mua,
  // kể cả khung hình đầu trước khi effect đọc đơn kịp chạy.
  const checking = awaitingMembership({ generation, epoch, signedIn: Boolean(session) }, membership, membershipFailed);
  const unavailable = buyUnavailable(sale, now, {
    purchased: view.bought,
    pending,
    stale: refreshing || Boolean(readError) || view.locked,
    checking,
  });
  const message = view.kind === "cleared" && unavailable ? unavailable : view.message || unavailable;
  const showOrdersLink = view.bought || view.kind === "uncertain" || view.kind === "cleared";

  return <main id="top" ref={root}>
    <SaleHero sale={sale} detail>
      <Countdown endAt={sale.endAt} seconds={remainingSeconds(sale.endAt, now)} />
      <div className="sale-actions">
        <button className="btn btn--primary" type="button" disabled={Boolean(unavailable)} onClick={buy}>
          {pending ? "Đang mua…" : "Mua ngay"}
        </button>
        <button className="btn btn--secondary" type="button" disabled={refreshing || pending} onClick={refresh}>
          {refreshing ? "Đang đọc tồn kho…" : "Làm mới tồn kho"}
        </button>
      </div>
      <div className={view.kind ? `sale-feedback sale-feedback--${view.kind}` : "sale-feedback"} role="status" data-outcome={view.kind ?? ""}>
        {message && <p>{message}</p>}
        {showOrdersLink && <Link className="btn btn--secondary" to="/orders">Xem đơn của tôi</Link>}
      </div>
      {readError && <p className="field__error" role="alert">Dữ liệu đã cũ. {readError} Cập nhật lúc {snapshot.updatedAt.toLocaleTimeString("vi-VN")}.</p>}
    </SaleHero>
    <ProductDetails key={sale.productId} id={sale.productId} />
  </main>;
}

export default function SalePage() {
  const { id = "" } = useParams();
  return <SaleDetail key={id} id={id} />;
}
