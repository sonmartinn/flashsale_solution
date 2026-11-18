import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useAuth } from "../auth/AuthProvider.tsx";
import { ErrorPanel, SaleHero, usePageKit } from "../components/Layout.tsx";
import { ApiError } from "../services/api.ts";
import { loginPath, StaleSessionError } from "../services/auth.ts";
import { getProduct, getSale, productAttributes } from "../services/catalog.ts";
import { buyUnavailable, createSingleFlight, remainingSeconds, serverTime, synchronizeClock, type ServerClock } from "../services/sale-state.ts";
import type { ProductDto, SaleDto } from "../services/types.ts";

interface SaleSnapshot {
  sale: SaleDto;
  clock: ServerClock;
  revision: number;
}

interface PurchaseResult {
  generation: number;
  state: "success" | "error" | "uncertain" | "already-bought";
  message: string;
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

function SaleDetail({ id }: { id: string }) {
  const { generation, store } = useAuth();
  const navigate = useNavigate();
  const returnTo = `/sales/${id}`;
  const nextRevision = useRef(0);
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<SaleSnapshot>();
  const [readError, setReadError] = useState("");
  const [tick, setTick] = useState(0);
  const [pending, setPending] = useState(false);
  const [purchase, setPurchase] = useState<PurchaseResult>();
  const blockedGeneration = useRef<number>(-1);
  const [flight] = useState(createSingleFlight);
  const active = useRef(false);
  const root = usePageKit(snapshot !== undefined);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void getSale(id, controller.signal).then(({ sale, now }) => {
      if (controller.signal.aborted) return;
      const monotonic = performance.now();
      const clock = synchronizeClock(now, monotonic);
      setTick(monotonic);
      setSnapshot({ sale, clock, revision });
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setReadError(cause instanceof ApiError ? cause.message : "Không đọc được đợt sale.");
    });
    return () => controller.abort();
  }, [id, revision]);

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

  function refresh() {
    nextRevision.current += 1;
    setReadError("");
    setRevision(nextRevision.current);
  }

  const outcome = purchase?.generation === generation ? purchase : undefined;

  function buy() {
    if (!snapshot || snapshot.revision !== nextRevision.current) return;
    if (buyUnavailable(snapshot.sale, serverTime(snapshot.clock, performance.now()))) return;

    const session = store.getSnapshot();
    if (!session.session) {
      void navigate(loginPath(returnTo));
      return;
    }
    if (blockedGeneration.current === session.generation) return;

    void flight.run(async () => {
      setPurchase(undefined);
      setPending(true);
      try {
        const { order } = await store.request<{ order: { id: string } }>(`/sales/${snapshot.sale.id}/buy?mode=${snapshot.sale.mode}`, {
          method: "POST",
          body: { qty: 1 },
        });
        if (!active.current || !store.isCurrent(session.generation)) return;
        blockedGeneration.current = session.generation;
        setPurchase({ generation: session.generation, state: "success", message: `Mua thành công. Mã đơn ${order.id}.` });
        refresh();
      } catch (cause) {
        if (!active.current || cause instanceof StaleSessionError) return;
        const current = store.getSnapshot();
        if (cause instanceof ApiError && cause.status === 401 && cause.code === "UNAUTHORIZED") {
          if (!current.session && current.generation === session.generation + 1) void navigate(loginPath(returnTo), { replace: true });
          return;
        }
        if (current.generation !== session.generation) return;

        if (cause instanceof ApiError && cause.status >= 400 && (cause.status < 500 || cause.code === "STOCK_NOT_LOADED")) {
          const state = cause.code === "ALREADY_BOUGHT" ? "already-bought" : "error";
          if (state === "already-bought") blockedGeneration.current = session.generation;
          setPurchase({ generation: session.generation, state, message: cause.message });
          refresh();
        } else {
          blockedGeneration.current = session.generation;
          setPurchase({
            generation: session.generation,
            state: "uncertain",
            message: "Chưa xác nhận được kết quả mua. Vui lòng kiểm tra lại trước khi mua thêm.",
          });
        }
      } finally {
        if (active.current) setPending(false);
      }
    });
  }

  if (!snapshot) return <main id="top" ref={root}>
    <section className="task-screen"><div className="wrap">
      <h1>Thông tin đợt sale</h1>
      {readError ? <ErrorPanel message={readError} retry={refresh} /> : <p role="status">Đang đọc đợt sale…</p>}
    </div></section>
  </main>;

  const { sale } = snapshot;
  const now = serverTime(snapshot.clock, tick);
  const reading = snapshot.revision !== revision && !readError;
  const unavailable = buyUnavailable(sale, now, {
    purchased: outcome?.state === "success" || outcome?.state === "already-bought",
    pending,
    stale: snapshot.revision !== revision || outcome?.state === "uncertain",
  });

  return <main id="top" ref={root}>
    <SaleHero sale={sale} detail>
      <Countdown endAt={sale.endAt} seconds={remainingSeconds(sale.endAt, now)} />
      <div className="sale-actions">
        <button className="btn btn--primary" type="button" disabled={Boolean(unavailable)} onClick={buy}>
          {pending ? "Đang mua…" : "Mua ngay"}
        </button>
        <button className="btn btn--secondary" type="button" disabled={reading || pending} onClick={refresh}>
          {reading ? "Đang đọc tồn kho…" : "Làm mới tồn kho"}
        </button>
      </div>
      <div className="sale-feedback" role="status">
        {outcome?.message || unavailable}
      </div>
      {readError && <p className="field__error" role="alert">Tồn kho chưa được cập nhật. {readError}</p>}
    </SaleHero>
    <ProductDetails key={sale.productId} id={sale.productId} />
  </main>;
}

export default function SalePage() {
  const { id = "" } = useParams();
  return <SaleDetail key={id} id={id} />;
}
