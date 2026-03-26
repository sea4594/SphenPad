import { useNavigate } from "react-router-dom";

export function AppBrand({ compact }: { compact?: boolean }) {
  const nav = useNavigate();

  const handleClick = () => {
    const page = document.querySelector<HTMLElement>('.page');
    if (page && page.scrollTop > 10) {
      page.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      nav('/');
    }
  };

  return (
    <button className={`brandWrap ${compact ? "is-compact" : ""}`} onClick={handleClick} type="button">
      <img className="brandIcon" src={`${import.meta.env.BASE_URL}sphen-icon-192.png`} alt="" aria-hidden="true" />
      {compact ? null : <div className="brand">SphenPad</div>}
    </button>
  );
}