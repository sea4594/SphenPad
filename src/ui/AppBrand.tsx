import { useNavigate } from "react-router-dom";

export function AppBrand() {
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
    <button className="brandWrap" onClick={handleClick} type="button">
      <img className="brandIcon" src={`${import.meta.env.BASE_URL}sphen-icon-192.png`} alt="" aria-hidden="true" />
      <div className="brand">SphenPad</div>
    </button>
  );
}