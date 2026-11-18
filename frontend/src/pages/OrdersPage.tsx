import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth/AuthProvider.tsx";
import { ErrorPanel, usePageKit } from "../components/Layout.tsx";
import { StaleSessionError } from "../services/auth.ts";
import { currency } from "../services/catalog.ts";
import { listMyOrders, MY_ORDERS_LIMIT, orderStatusLabel } from "../services/orders.ts";
import type { MyOrderDto } from "../services/types.ts";

interface OrdersSnapshot { orders: MyOrderDto[]; updatedAt: Date }

const readFailed = "Không đọc được đơn hàng.";

/** Danh sách của MỘT phiên: OrdersPage đổi key theo generation nên dữ liệu riêng không sang tài khoản khác. */
function OrdersList() {
  const { store } = useAuth();
  const [snapshot, setSnapshot] = useState<OrdersSnapshot>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const root = usePageKit(snapshot !== undefined || error !== "");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void listMyOrders(store, controller.signal).then(orders => {
      if (!controller.signal.aborted) setSnapshot({ orders, updatedAt: new Date() });
    }).catch((cause: unknown) => {
      // Phiên cũ: bỏ qua, OrdersPage đã đổi key; 401 đã xóa phiên và ProtectedRoute đưa về đăng nhập.
      if (controller.signal.aborted || cause instanceof StaleSessionError) return;
      setError(readFailed);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [store, revision]);

  const retry = () => setRevision(value => value + 1);
  const orders = snapshot?.orders;
  return <main id="top" ref={root} aria-busy={loading}>
    <section className="task-screen orders" aria-labelledby="orders-h"><div className="wrap">
      <div className="orders__head">
        <h1 id="orders-h">Đơn của tôi</h1>
        {snapshot && <div className="orders__meta">
          <p role="status">{loading ? "Đang đọc đơn hàng…" : `Cập nhật lúc ${snapshot.updatedAt.toLocaleTimeString("vi-VN")}`}</p>
          <button type="button" className="btn btn--secondary" disabled={loading} onClick={retry}>Làm mới đơn hàng</button>
        </div>}
      </div>
      {!snapshot && loading && <p role="status">Đang đọc đơn hàng…</p>}
      {!snapshot && error && <ErrorPanel message={error} retry={retry} disabled={loading} />}
      {snapshot && error && <p className="field__error" role="alert">Dữ liệu đã cũ. {error} Danh sách dưới đây là lần đọc lúc {snapshot.updatedAt.toLocaleTimeString("vi-VN")}.</p>}
      {orders && orders.length === 0 && <div className="orders__empty">
        <h2>Bạn chưa có đơn hàng</h2>
        <p>Về trang chủ để xem đợt sale đang mở.</p>
        <Link className="btn btn--primary" to="/">Về trang chủ</Link>
      </div>}
      {orders && orders.length > 0 && <>
        <p className="orders__count">{orders.length >= MY_ORDERS_LIMIT ? `Hiển thị ${MY_ORDERS_LIMIT} đơn mới nhất.` : `${orders.length} đơn, mới nhất trước.`}</p>
        <ol className="order-list">{orders.map(order => <li className="order" key={order.id}>
          {order.product.images[0] ? <img src={order.product.images[0]} alt="" width="1200" height="900" loading="lazy" decoding="async" /> : <span className="order__noimg" aria-hidden="true" />}
          <div className="order__body">
            <p className="order__name">{order.product.name}</p>
            <dl className="order__facts">
              <div><dt>Giá đã trả</dt><dd>{currency(order.price)}</dd></div>
              <div><dt>Thời điểm</dt><dd><time dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleString("vi-VN")}</time></dd></div>
              <div><dt>Trạng thái</dt><dd className={order.status === "success" ? "order__status" : "order__status order__status--cancelled"}>{orderStatusLabel(order.status)}</dd></div>
              <div><dt>Mã đơn</dt><dd className="order__id">{order.id}</dd></div>
            </dl>
          </div>
          <Link className="btn btn--secondary order__link" to={`/sales/${encodeURIComponent(order.saleId)}`} aria-label={`Xem đợt sale của ${order.product.name}`}>Xem đợt sale</Link>
        </li>)}</ol>
      </>}
    </div></section>
  </main>;
}

export default function OrdersPage() {
  const { generation } = useAuth();
  return <OrdersList key={generation} />;
}
