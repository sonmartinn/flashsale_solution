import { Link, Route, Routes, useLocation } from "react-router";
import { AuthProvider, useAuth } from "./auth/AuthProvider.tsx";
import { Layout } from "./components/Layout.tsx";
import ProtectedRoute from "./components/ProtectedRoute.tsx";
import AdminPage from "./pages/AdminPage.tsx";
import HomePage from "./pages/HomePage.tsx";
import LoginPage from "./pages/LoginPage.tsx";
import OrdersPage from "./pages/OrdersPage.tsx";
import SalePage from "./pages/SalePage.tsx";
import { loginPath } from "./services/auth.ts";

function SessionLinks() {
  const { session, store } = useAuth();
  const { pathname, hash } = useLocation();
  return <>
    {session?.user.role === "admin" && <div className="nav__item"><Link className="nav__link" to="/admin" aria-current={pathname === "/admin" ? "page" : undefined}>Theo dõi</Link></div>}
    <div className="nav__item">
      {session
        ? <button type="button" className="nav__link nav-signout" onClick={() => store.logout()}>Đăng xuất</button>
        : <Link className="nav__link" to={loginPath(pathname + hash)}>Đăng nhập</Link>}
    </div>
  </>;
}

export default function App() {
  return <AuthProvider><Layout sessionLinks={<SessionLinks />}><Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/sales/:id" element={<SalePage />} />
    <Route path="/orders" element={<ProtectedRoute><OrdersPage /></ProtectedRoute>} />
    <Route path="/admin" element={<ProtectedRoute admin><AdminPage /></ProtectedRoute>} />
    <Route path="*" element={<main id="top"><section className="hero"><div className="wrap"><h1>Không tìm thấy trang</h1><Link to="/">Về trang chủ</Link></div></section></main>} />
  </Routes></Layout></AuthProvider>;
}
