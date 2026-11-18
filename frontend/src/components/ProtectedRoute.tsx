import type { PropsWithChildren } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "../auth/AuthProvider.tsx";
import { loginPath } from "../services/auth.ts";

/** Chỉ quyết định hiển thị; API vẫn kiểm tra token và quyền ở mọi route được bảo vệ. */
export default function ProtectedRoute({ children, admin = false }: PropsWithChildren<{ admin?: boolean }>) {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) return <Navigate to={loginPath(location.pathname)} replace />;
  if (admin && session.user.role !== "admin") return <main id="top"><section className="task-screen" aria-labelledby="denied-h"><div className="wrap">
    <h1 id="denied-h">Không đủ quyền</h1>
    <p>Tài khoản này không có quyền xem trang theo dõi. Chọn Flash Sale để về trang chủ.</p>
  </div></section></main>;
  return children;
}
