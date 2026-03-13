export function AppBrand() {
  return (
    <div className="brandWrap">
      <img className="brandIcon" src={`${import.meta.env.BASE_URL}sphen-icon-192.png`} alt="" aria-hidden="true" />
      <div className="brand">SphenPad</div>
    </div>
  );
}