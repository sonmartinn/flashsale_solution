import { useEffect, useState } from "react";
import { Link, Route, Routes, useParams } from "react-router";
import { ErrorPanel, Layout, SaleHero, usePageKit } from "./components/Layout.tsx";
import HomePage from "./pages/HomePage.tsx";
import { ApiError } from "./services/api.ts";
import { getSale } from "./services/catalog.ts";
import type { SaleDto } from "./services/types.ts";

function SalePreview() {
  const { id = "" } = useParams();
  const [sale, setSale] = useState<SaleDto>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const root = usePageKit(sale !== undefined);
  useEffect(() => {
    const controller = new AbortController();
    setSale(undefined); setError("");
    void getSale(id, controller.signal)
      .then(value => { if (!controller.signal.aborted) setSale(value.sale); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof ApiError ? cause.message : "Không đọc được đợt sale."); });
    return () => controller.abort();
  }, [id, revision]);
  return <main id="top" ref={root}>{sale ? <SaleHero sale={sale} detail /> : <section className="hero"><div className="wrap"><h1>Thông tin đợt sale</h1>{error ? <ErrorPanel message={error} retry={() => setRevision(value => value + 1)} /> : <p role="status">Đang đọc đợt sale…</p>}</div></section>}</main>;
}

export default function App() {
  return <Layout><Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/sales/:id" element={<SalePreview />} />
    <Route path="*" element={<main id="top"><section className="hero"><div className="wrap"><h1>Không tìm thấy trang</h1><Link to="/">Về trang chủ</Link></div></section></main>} />
  </Routes></Layout>;
}
