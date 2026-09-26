import { startTransition } from "react";
import { useNavigate } from "react-router-dom";

// eslint-disable-next-line react-refresh/only-export-components
export function getActiveMainPage(): HTMLElement | null {
  const visibleLayer = document.querySelector<HTMLElement>('[data-main-page-visible="true"]');
  return visibleLayer?.querySelector<HTMLElement>(".page") ?? null;
}

// eslint-disable-next-line react-refresh/only-export-components
export function scrollActiveMainPageToTop(behavior: ScrollBehavior = "smooth"): boolean {
  const page = getActiveMainPage();
  if (!page || page.scrollTop <= 2) return false;
  page.scrollTo({ top: 0, behavior });
  return true;
}

export function AppBrand() {
  const nav = useNavigate();

  const handleClick = () => {
    if (!scrollActiveMainPageToTop("smooth")) {
      startTransition(() => nav("/"));
    }
  };

  return (
    <button className="brandWrap" onClick={handleClick} type="button">
      <img className="brandIcon" src={`${import.meta.env.BASE_URL}sphen-icon-192.png`} alt="" aria-hidden="true" />
    </button>
  );
}