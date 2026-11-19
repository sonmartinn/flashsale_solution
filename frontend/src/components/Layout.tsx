import { useEffect, useRef, type PropsWithChildren, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { currency } from "../services/catalog.ts";
import { stockLabel } from "../services/sale-state.ts";
import type { SaleDto } from "../services/types.ts";

interface KitModule {
  init?(): void;
  mountAll?(root: HTMLElement): Promise<unknown>;
  unmountAll?(root: HTMLElement): void;
}
const kit = (path: string): Promise<KitModule> => import(/* @vite-ignore */ `/assets/${path}`);

/** Giữ motion và moment theo vòng đời route, hủy cả lần mount đang chờ. */
export function usePageKit(ready: boolean) {
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
      if (!active) moments.unmountAll?.(element);
    })();
    return () => { active = false; mounted?.unmountAll?.(element); };
  }, [ready]);
  return root;
}

export function Layout({ children, sessionLinks }: PropsWithChildren<{ sessionLinks?: ReactNode }>) {
  const location = useLocation();
  const header = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Kit gắn menu một lần trên header sống xuyên các route.
    void kit("system.js");
    void kit("layout/layout.js");
  }, []);
  useEffect(() => {
    header.current?.classList.remove("is-open");
    toggle.current?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("nav-locked");
    if (location.hash) {
      const frame = requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView());
      return () => cancelAnimationFrame(frame);
    }
    window.scrollTo(0, 0);
  }, [location.pathname, location.hash]);
  // Kit xử lý click/Escape; thêm giới hạn Tab để focus không đi sau menu toàn màn hình.
  useEffect(() => {
    const trap = (event: KeyboardEvent) => {
      const element = header.current;
      if (event.key !== "Tab" || !element?.classList.contains("is-open")) return;
      const controls = [...element.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')]
        .filter(control => control.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => document.removeEventListener("keydown", trap);
  }, []);
  return <>
    <header ref={header} className="nav nav--split">
      <div className="wrap nav__bar">
        <a className="skip-link" href="#top">Đến nội dung</a>
        <Link className="nav__logo" to="/"><span className="mark" data-mark="ring" aria-hidden="true" />Flash Sale</Link>
        <nav id="main-menu" className="nav__links" aria-label="Điều hướng chính">
          <div className="nav__item"><Link className="nav__link" to="/#products">Sản phẩm</Link></div>
          <div className="nav__item"><Link className="nav__link" to="/orders" aria-current={location.pathname === "/orders" ? "page" : undefined}>Đơn của tôi</Link></div>
          {sessionLinks}
        </nav>
        <div className="nav__actions"><Link className="btn btn--primary" to="/">Đợt sale</Link></div>
        <button ref={toggle} className="nav__toggle btn btn--secondary" type="button" aria-expanded="false" aria-controls="main-menu" aria-label="Mở hoặc đóng menu">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 5h14M2 13h14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
      </div>
    </header>
    {children}
    <footer className="footer closing footer--dark ground-inverse" id="contact">
      <div className="wrap">
        <div className="closing__cta close--type">
          <h2>Chọn sản phẩm thời trang</h2><Link className="btn btn--primary btn--xl btn--wide" to="/#products">Xem sản phẩm</Link>
        </div>
        <div className="closing__links">
          <p className="nav__logo"><span className="mark" data-mark="ring" aria-hidden="true" />Flash Sale</p>
          <div className="legal"><span>Flash Sale · {new Date().getFullYear()}</span><a href="/credits.html">Ảnh từ Pexels</a></div>
        </div>
      </div>
    </footer>
  </>;
}

export function SaleHero({ sale, detail = false, children }: PropsWithChildren<{ sale: SaleDto; detail?: boolean }>) {
  const stock = stockLabel(sale);
  const originalPrice = sale.product.price;
  const hasDiscount = sale.salePrice >= 0 && originalPrice > sale.salePrice;
  const discountPercent = hasDiscount ? Math.floor((originalPrice - sale.salePrice) * 100 / originalPrice) : 0;
  return <section className={detail ? "hero hero--product sale-detail" : "hero hero--product"} data-enter aria-labelledby="hero-h">
    <div className="wrap"><div className="hero-text hero__in">
      <div className="hero__head">
        <div><h1 id="hero-h">{sale.product.name}</h1><p className="hero__lead">Mỗi tài khoản mua tối đa một sản phẩm trong đợt sale.</p></div>
        <div className="btn-row sale-offer">
          <p className="sale-price">
            <span className="sale-price__current"><span className="sr-only">Giá sale </span>{currency(sale.salePrice)}</span>
            {hasDiscount && <span className="sale-price__original"><span className="sr-only">Giá gốc </span><del>{currency(originalPrice)}</del></span>}
            {discountPercent > 0 && <span className="sale-price__discount">Giảm {discountPercent}%</span>}
          </p>
          <p className={stock.negative ? "stock stock--negative" : "stock"}>{stock.text}</p>
          {children}
          {!detail && <Link className="btn btn--primary" to={`/sales/${encodeURIComponent(sale.id)}`}>Xem đợt sale</Link>}
        </div>
      </div>
      {sale.product.images[0] && <div className="hero__stage"><img src={sale.product.images[0]} alt={sale.product.name} width="1920" height="1080" fetchPriority="high" data-source="stand-in" data-subject="product" /></div>}
    </div></div>
  </section>;
}

export function ErrorPanel({ message, retry, disabled = false }: { message: string; retry: () => void; disabled?: boolean }) {
  return <div role="alert" className="read-error"><p>{message}</p><button className="btn btn--secondary" disabled={disabled} onClick={retry}>Thử đọc lại</button></div>;
}
