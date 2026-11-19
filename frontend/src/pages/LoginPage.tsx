import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate, useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthProvider.tsx";
import { usePageKit } from "../components/Layout.tsx";
import { ApiError } from "../services/api.ts";
import { authenticate, safeReturnPath } from "../services/auth.ts";

const networkFailure = "Chưa hoàn tất được yêu cầu. Kiểm tra kết nối rồi gửi lại biểu mẫu.";

export default function LoginPage() {
  const { session, expired, store } = useAuth();
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get("returnTo"));
  const [register, setRegister] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error>();
  const request = useRef<AbortController | null>(null);
  const root = usePageKit(!session);

  useEffect(() => () => request.current?.abort(), []);

  if (session) return <Navigate replace to={returnTo} />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current) return;

    const fields = new FormData(event.currentTarget);
    const controller = new AbortController();
    const { generation } = store.getSnapshot();
    request.current = controller;
    setPending(true);
    setError(undefined);
    try {
      const next = await authenticate(register ? "register" : "login", {
        name: String(fields.get("name") ?? ""),
        email: String(fields.get("email") ?? ""),
        password: String(fields.get("password") ?? ""),
      }, controller.signal);
      if (!controller.signal.aborted && store.isCurrent(generation)) store.accept(next);
    } catch (cause) {
      if (!controller.signal.aborted && store.isCurrent(generation)) {
        setError(cause instanceof ApiError && cause.status < 500 ? cause : new Error(networkFailure));
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  const title = register ? "Tạo tài khoản" : "Đăng nhập";
  const emailError = error instanceof ApiError && error.code === "EMAIL_TAKEN";
  const credentialsError = error instanceof ApiError && error.code === "INVALID_CREDENTIALS";
  return <main id="top" ref={root}>
    <section className="task-screen" aria-labelledby="auth-heading">
      <div className="wrap">
        <div className="auth-panel">
          <h1 id="auth-heading">{title}</h1>
          {expired && <p className="auth-notice" role="status">Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.</p>}
          <form className="auth-form" aria-busy={pending} onSubmit={submit}>
            {register && <div className="auth-field">
              <label htmlFor="auth-name">Họ và tên</label>
              <input id="auth-name" name="name" autoComplete="name" required readOnly={pending} />
            </div>}
            <div className="auth-field">
              <label htmlFor="auth-email">Email</label>
              <input id="auth-email" name="email" type="email" autoComplete="email" required readOnly={pending}
                aria-invalid={emailError || credentialsError || undefined}
                aria-describedby={emailError || credentialsError ? "auth-error" : undefined} />
              {emailError && <p id="auth-error" className="field__error" role="alert">{error.message}</p>}
            </div>
            <div className="auth-field">
              <label htmlFor="auth-password">Mật khẩu</label>
              <input key={title} id="auth-password" name="password" type="password"
                autoComplete={register ? "new-password" : "current-password"} required readOnly={pending}
                aria-invalid={credentialsError || undefined} aria-describedby={credentialsError ? "auth-error" : undefined} />
              {credentialsError && <p id="auth-error" className="field__error" role="alert">Email hoặc mật khẩu không đúng</p>}
            </div>
            {error && !emailError && !credentialsError && <p className="field__error" role="alert">{error.message}</p>}
            <button type="submit" className="btn btn--primary" disabled={pending}>{pending ? "Đang gửi…" : title}</button>
          </form>
          <button type="button" className="btn btn--secondary" disabled={pending} onClick={() => {
            setRegister(value => !value);
            setError(undefined);
          }}>{register ? "Quay lại đăng nhập" : "Tạo tài khoản"}</button>
        </div>
      </div>
    </section>
  </main>;
}
