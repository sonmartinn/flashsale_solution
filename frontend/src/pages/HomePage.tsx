import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { ErrorPanel, SaleHero, usePageKit } from "../components/Layout.tsx";
import { ApiError } from "../services/api.ts";
import { currency, getHome, productAttributes, type HomeData } from "../services/catalog.ts";

export default function HomePage() {
  const location = useLocation();
  const [data, setData] = useState<HomeData>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date>();
  const [revision, setRevision] = useState(0);
  const root = usePageKit(data !== undefined);
  const ready = data !== undefined;
  useEffect(() => {
    if (!ready || location.hash !== "#products") return;
    const frame = requestAnimationFrame(() => document.getElementById("products")?.scrollIntoView());
    return () => cancelAnimationFrame(frame);
  }, [ready, location.hash]);
  const retry = () => setRevision(value => value + 1);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    void getHome(controller.signal).then(value => {
      if (!controller.signal.aborted) { setData(value); setUpdatedAt(new Date()); }
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
      {!loading && !error && <><p>Hiện chưa có đợt sale đang mở. Bạn vẫn có thể xem sản phẩm bên dưới.</p><Link className="btn btn--primary" to="/#products">Xem sản phẩm</Link></>}
      {error && <ErrorPanel message={error} retry={retry} disabled={loading} />}
    </div></section>}
    {data && <section className="section catalog ground-brand" id="products" aria-labelledby="products-h"><div className="wrap">
      <h2 id="products-h">Sản phẩm thời trang</h2>
      {error && <ErrorPanel message={`Dữ liệu đã cũ. ${error}`} retry={retry} disabled={loading} />}
      <p className="catalog-meta" role="status">{loading ? "Đang cập nhật…" : `Cập nhật lúc ${updatedAt?.toLocaleTimeString("vi-VN") ?? ""}`}</p>
      {data.products.length === 0 ? <p>Chưa có sản phẩm.</p> : <div className="grid catalog-grid">{data.products.map(product => <article className="card product-card span-4" key={product.id} aria-labelledby={`product-${product.id}`}>
        {product.images[0] && <img src={product.images[0]} alt={product.name} width="1200" height="900" loading="lazy" decoding="async" data-source="stand-in" data-subject="product" />}
        <div className="product-info">
          <h3 id={`product-${product.id}`}>{product.name}</h3>
          <p className="product-price">{currency(product.price)}</p>
          <dl className="product-attributes">{productAttributes(product.attributes).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        </div>
      </article>)}</div>}
      <button className="btn btn--secondary catalog-refresh" disabled={loading} onClick={retry}>{loading ? "Đang cập nhật…" : "Làm mới dữ liệu"}</button>
    </div></section>}
    <section className="section statement" data-moment="word-highlight" aria-labelledby="limit-h"><div className="wrap">
      <h2 id="limit-h">Giới hạn mỗi tài khoản</h2>
      <p className="mo-wh__text">Trong mỗi đợt sale, một tài khoản mua tối đa <strong>một sản phẩm</strong>.</p>
      {sale ? <Link className="btn btn--primary" to={`/sales/${encodeURIComponent(sale.id)}`}>Xem đợt sale</Link> : <Link className="btn btn--primary" to="/#products">Xem sản phẩm</Link>}
    </div></section>
  </main>;
}
