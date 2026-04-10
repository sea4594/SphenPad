import { startTransition } from "react";
import { useNavigate } from "react-router-dom";

export function AppBrand() {
  const nav = useNavigate();

  const getActivePage = () => {
    const visibleLayer = document.querySelector<HTMLElement>('[data-main-page-visible="true"]');
    return visibleLayer?.querySelector<HTMLElement>(".page") ?? null;
  };

  const handleClick = () => {
    const page = getActivePage();
    if (page && page.scrollTop > 10) {
      page.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      startTransition(() => nav("/"));
    }
  };

  return (
    <button className="brandWrap" onClick={handleClick} type="button">
      <img className="brandIcon" src={`${import.meta.env.BASE_URL}sphen-icon-192.png`} alt="" aria-hidden="true" />
    </button>
  );
}