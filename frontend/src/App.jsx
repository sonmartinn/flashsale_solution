import { NavLink, Route, Routes } from "react-router-dom";
import Placeholder from "./components/Placeholder.jsx";
import HomePage from "./pages/HomePage.jsx";

export default function App() {
  return (
    <>
      <header className="topbar">
        <strong>Flash Sale</strong>
        <nav>
          <NavLink to="/">Trang chủ</NavLink>
          <NavLink to="/orders">Đơn hàng</NavLink>
          <NavLink to="/admin">Theo dõi</NavLink>
          <NavLink to="/login">Đăng nhập</NavLink>
        </nav>
      </header>
      <main className="page">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/sales/:id" element={<Placeholder title="Trang sale" milestone="tuần 3" />} />
          <Route path="/orders" element={<Placeholder title="Đơn hàng của tôi" milestone="tuần 3" />} />
          <Route path="/admin" element={<Placeholder title="Trang theo dõi" milestone="tuần 4" />} />
          <Route path="/login" element={<Placeholder title="Đăng nhập" milestone="tuần 2" />} />
          <Route path="*" element={<Placeholder title="Không tìm thấy trang" />} />
        </Routes>
      </main>
    </>
  );
}
