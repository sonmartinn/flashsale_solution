import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api.js";

const formatPrice = (value) => `${value.toLocaleString("vi-VN")}₫`;

export default function HomePage() {
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.get("/sales/active"), api.get("/products")])
      .then(([activeSales, allProducts]) => {
        setSales(activeSales);
        setProducts(allProducts);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="error">Không tải được dữ liệu: {error}</p>;

  return (
    <>
      <h1>Đang flash sale</h1>
      {sales.length === 0 && <p className="muted">Chưa có đợt sale nào.</p>}
      <div className="grid">
        {sales.map((sale) => (
          <Link key={sale._id} to={`/sales/${sale._id}`} className="card">
            <strong>{sale.productId.name}</strong>
            <span className="price">{formatPrice(sale.salePrice)}</span>
            <span className="muted">
              Còn {sale.remainingQty}/{sale.totalQty}
            </span>
          </Link>
        ))}
      </div>

      <h2>Sản phẩm</h2>
      <div className="grid">
        {products.map((product) => (
          <div key={product._id} className="card">
            <strong>{product.name}</strong>
            <span>{formatPrice(product.price)}</span>
          </div>
        ))}
      </div>
    </>
  );
}
