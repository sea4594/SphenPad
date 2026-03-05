export const IconUndo = () => <span style={{ fontSize: 18 }}>↶</span>;
export const IconRedo = () => <span style={{ fontSize: 18 }}>↷</span>;
export const IconPause = () => <span style={{ fontSize: 18 }}>⏸</span>;
export const IconPlay = () => <span style={{ fontSize: 18 }}>▶</span>;
export const IconSettings = () => <span style={{ fontSize: 18 }}>⚙</span>;

export const IconSelectMode = (props: { multi: boolean }) => (
	<span
		style={{
			position: "relative",
			width: 18,
			height: 18,
			display: "inline-block",
		}}
	>
		<span
			style={{
				position: "absolute",
				inset: props.multi ? "4px 0 0 4px" : "2px",
				border: "1.6px solid currentColor",
				borderRadius: 2,
			}}
		/>
		{props.multi ? (
			<span
				style={{
					position: "absolute",
					inset: "0 4px 4px 0",
					border: "1.6px solid currentColor",
					borderRadius: 2,
					opacity: 0.86,
				}}
			/>
		) : null}
	</span>
);

export const IconToolBig = () => <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>9</span>;

export const IconToolCenter = () => (
	<span style={{ fontSize: 11, lineHeight: 1, display: "inline-block", transform: "translateY(1px)" }}>12</span>
);

export const IconToolCorner = () => (
	<span style={{ position: "relative", width: 18, height: 18, display: "inline-block", fontSize: 8, lineHeight: 1 }}>
		<span style={{ position: "absolute", top: 0, left: 0 }}>1</span>
		<span style={{ position: "absolute", top: 0, right: 0 }}>2</span>
		<span style={{ position: "absolute", bottom: 0, left: 0 }}>3</span>
	</span>
);

export const IconToolHighlight = () => (
	<span
		style={{
			width: 16,
			height: 16,
			borderRadius: 4,
			display: "inline-block",
			border: "1px solid rgba(255,255,255,.65)",
			background: "linear-gradient(135deg, #ff6b6b, #ffd166, #57d38c, #4cc9f0, #b197fc)",
		}}
	/>
);

export const IconToolLine = () => (
	<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
		<path d="M2 10 L8 10 L8 4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
		<circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
		<path d="M12 10 L18 10 L18 16" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
	</svg>
);