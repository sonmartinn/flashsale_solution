import { useEffect, useRef, useState } from "react";
import { Link, Route, Routes, useLocation, useParams } from "react-router";
import { ApiError, requestJson, type ProductDto, type SaleDto } from "./services/api.ts";

interface KitModule {
  default?: { init(): void };
  init?(): void;
  mountAll?(root: HTMLElement): Promise<unknown>;
  unmountAll?(root: HTMLElement): void;
}
const kit = (path: string): Promise<KitModule> => import(/* @vite-ignore */ `/assets/${path}`);
const currency = (value: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(value);
const time = (value: string) => new Date(value).toLocaleTimeString("vi-VN");

/** Kit gắn theo vòng đời route; moment dùng API unmount để dọn listener khi rời trang. */
function usePageKit(ready: boolean) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element || !ready) return;
    let active = true;
    let mounted: KitModule | undefined;
    void (async () => {
      const [motion, moments] = await Promise.all([kit("motion/motion.js"), kit("moments/moments.js")]);
      if (!active) return;
      motion.init?.();
      mounted = moments;
      await moments.mountAll?.(element);
      // Unmount cả phần vừa hoàn tất nếu route đổi trong lúc module đang tải.
      if (!active) moments.unmountAll?.(element);
    })();
    return () => { active = false; mounted?.unmountAll?.(element); };
  }, [ready]);
  return root;
}

function Header() {
  const location = useLocation();
  const element = useRef<HTMLElement>(null);
  useEffect(() => {
    // Header sống xuyên route; system.init không bị gọi lại mỗi lần đọc API.
    void kit("system.js");
    void kit("layout/layout.js");
  }, []);
  useEffect(() => {
    element.current?.classList.remove("is-open");
    element.current?.querySelector("button")?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("nav-locked");
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return <header ref={element} className="nav nav--split">
    <div className="wrap nav__bar">
      <a className="skip-link" href="#top">Đến nội dung</a>
      <Link className="nav__logo" to="/"><span className="mark" data-mark="ring" aria-hidden="true" />Flash Sale</Link>
      <nav className="nav__links" aria-label="Điều hướng chính">
        <div className="nav__item"><a className="nav__link" href="/#products">Sản phẩm</a></div>
      </nav>
      <div className="nav__actions"><Link className="nav__link" to="/">Đợt sale</Link></div>
      <button className="nav__toggle btn btn--secondary" type="button" aria-expanded="false" aria-label="Mở menu">Menu</button>
    </div>
  </header>;
}

function Footer() {
  return <footer className="footer closing footer--dark ground-inverse" id="contact">
    <div className="wrap">
      <div className="closing__cta close--type">
        <h2>Chọn sản phẩm thời trang</h2><a className="btn btn--primary btn--xl btn--wide" href="/#products">Xem sản phẩm</a>
      </div>
      <div className="closing__links">
        <p className="nav__logo"><span className="mark" data-mark="ring" aria-hidden="true" />Flash Sale</p>
        <div className="legal"><span>Flash Sale · {new Date().getFullYear()}</span><a href="/credits.html">Ảnh từ Pexels</a></div>
      </div>
    </div>
  </footer>;
}

function SaleHero({ sale, detail = false }: { sale: SaleDto; detail?: boolean }) {
  return <section className="hero hero--product" data-enter aria-labelledby="hero-h">
    <div className="wrap"><div className="hero-text hero__in">
      <div className="hero__head">
        <div><h1 id="hero-h">{sale.product.name}</h1><p className="hero__lead">Đọc giá và số còn lại trong đợt sale hiện tại, rồi chọn xem thông tin của sản phẩm.</p></div>
        <div className="btn-row sale-offer">
          <p className="sale-price">{sale.product.price > sale.salePrice && <del>{currency(sale.product.price)}</del>}<span>{currency(sale.salePrice)}</span></p>
          <p className={sale.remaining < 0 ? "stock stock--negative" : "stock"}>{sale.stockLoaded ? `Còn ${sale.remaining} sản phẩm` : "Kho chưa sẵn sàng"}</p>
          {detail ? <Link className="btn btn--secondary" to="/">Xem danh sách</Link> : <Link className="btn btn--primary" to={`/sales/${encodeURIComponent(sale.id)}`}>Xem đợt sale</Link>}
        </div>
      </div>
      {sale.product.images[0] && <div className="hero__stage"><img src={sale.product.images[0]} alt={sale.product.name} width="1920" height="1080" fetchPriority="high" data-source="stand-in" data-subject="product" /></div>}
    </div></div>
  </section>;
}

function ErrorPanel({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="read-error"><p>{message}</p><button className="btn btn--secondary" onClick={retry}>Thử đọc lại</button></div>;
}

function Home() {
  const [data, setData] = useState<{ sales: SaleDto[]; products: ProductDto[]; now: string }>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const root = usePageKit(data !== undefined);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    void Promise.all([
      requestJson<{ sales: SaleDto[]; now: string }>("/sales/active", { signal: controller.signal }),
      requestJson<{ products: ProductDto[] }>("/products", { signal: controller.signal }),
    ]).then(([sales, products]) => {
      if (!controller.signal.aborted) setData({ ...sales, ...products });
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof ApiError ? cause.message : "Không kết nối được máy chủ. Vui lòng thử đọc lại.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  const sale = data?.sales[0];
  return <main id="top" ref={root} aria-busy={loading}>
    {sale ? <SaleHero sale={sale} /> : <section className="hero hero--product" data-enter><div className="wrap hero-text">
      <h1>{loading ? "Đợt sale thời trang" : error ? "Dữ liệu đợt sale" : "Chưa có đợt sale"}</h1>
      {loading && <p role="status">Đang đọc đợt sale và sản phẩm…</p>}
      {!loading && !error && <><p>Hiện chưa có đợt sale đang mở. Bạn vẫn có thể xem các sản phẩm bên dưới.</p><a className="btn btn--primary" href="#products">Xem sản phẩm</a></>}
      {error && <ErrorPanel message={error} retry={() => setRevision(v => v + 1)} />}
    </div></section>}
    {data && <section className="section catalog ground-brand" id="products" aria-labelledby="products-h"><div className="wrap">
      <h2 id="products-h">Sản phẩm thời trang</h2>
      {error && <ErrorPanel message={`Dữ liệu đã cũ. ${error}`} retry={() => setRevision(v => v + 1)} />}
      <p className="catalog-meta">Cập nhật lúc {time(data.now)}</p>
      {data.products.length === 0 ? <p>Chưa có sản phẩm.</p> : <ul className="rows rows--spec">{data.products.map(product => <li key={product.id}><span className="rows__name">{product.name}</span><span className="rows__value">{currency(product.price)}</span></li>)}</ul>}
      <button className="btn btn--secondary" disabled={loading} onClick={() => setRevision(v => v + 1)}>{loading ? "Đang cập nhật…" : "Làm mới dữ liệu"}</button>
    </div></section>}
    <section className="section statement" data-moment="word-highlight" aria-labelledby="limit-h"><div className="wrap">
      <h2 id="limit-h">Giới hạn mỗi tài khoản</h2>
      <p className="mo-wh__text">Trong mỗi đợt sale, một tài khoản mua tối đa <strong>một sản phẩm</strong>.</p>
      <a className="btn btn--secondary" href="#products">Xem sản phẩm</a>
    </div></section>
  </main>;
}

function SalePreview() {
  const { id = "" } = useParams();
  const [sale, setSale] = useState<SaleDto>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const root = usePageKit(sale !== undefined);
  useEffect(() => {
    const controller = new AbortController();
    setSale(undefined); setError("");
    void requestJson<{ sale: SaleDto }>(`/sales/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setSale(value.sale); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof ApiError ? cause.message : "Không đọc được đợt sale."); });
    return () => controller.abort();
  }, [id, revision]);
  return <main id="top" ref={root}>{sale ? <SaleHero sale={sale} detail /> : <section className="hero"><div className="wrap"><h1>Thông tin đợt sale</h1>{error ? <ErrorPanel message={error} retry={() => setRevision(v => v + 1)} /> : <p role="status">Đang đọc đợt sale…</p>}</div></section>}</main>;
}

export default function App() {
  return <><Header /><Routes><Route path="/" element={<Home />} /><Route path="/sales/:id" element={<SalePreview />} /><Route path="*" element={<main id="top"><section className="hero"><div className="wrap"><h1>Không tìm thấy trang</h1><Link to="/">Về trang chủ</Link></div></section></main>} /></Routes><Footer /></>;
}
