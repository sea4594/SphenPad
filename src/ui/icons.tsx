export const IconUndo = () => <span style={{ fontSize: 18 }}>↶</span>;
export const IconRedo = () => <span style={{ fontSize: 18 }}>↷</span>;
export const IconPause = () => (
	<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
		<rect x="5" y="4" width="3.8" height="12" rx="1.1" fill="currentColor" />
		<rect x="11.2" y="4" width="3.8" height="12" rx="1.1" fill="currentColor" />
	</svg>
);
export const IconPlay = () => <span style={{ fontSize: 18 }}>▶</span>;
export const IconExit = () => (
	<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
		<path d="M8 3.5h7a1.5 1.5 0 0 1 1.5 1.5v10A1.5 1.5 0 0 1 15 16.5H8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
		<path d="M11.2 10H2.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
		<path d="M5.8 6.9 2.7 10l3.1 3.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
	</svg>
);
export const IconSettings = () => (
	<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
		<path
			d="M11.7 2.4a1 1 0 0 0-1-.8H9.3a1 1 0 0 0-1 .8l-.3 1.5a6.8 6.8 0 0 0-1.5.9L5 3.9a1 1 0 0 0-1.3.1l-1 1a1 1 0 0 0-.1 1.3l.9 1.5a6.8 6.8 0 0 0-.9 1.5l-1.5.3a1 1 0 0 0-.8 1v1.4a1 1 0 0 0 .8 1l1.5.3a6.8 6.8 0 0 0 .9 1.5l-.9 1.5a1 1 0 0 0 .1 1.3l1 1a1 1 0 0 0 1.3.1l1.5-.9a6.8 6.8 0 0 0 1.5.9l.3 1.5a1 1 0 0 0 1 .8h1.4a1 1 0 0 0 1-.8l.3-1.5a6.8 6.8 0 0 0 1.5-.9l1.5.9a1 1 0 0 0 1.3-.1l1-1a1 1 0 0 0 .1-1.3l-.9-1.5a6.8 6.8 0 0 0 .9-1.5l1.5-.3a1 1 0 0 0 .8-1v-1.4a1 1 0 0 0-.8-1l-1.5-.3a6.8 6.8 0 0 0-.9-1.5l.9-1.5a1 1 0 0 0-.1-1.3l-1-1a1 1 0 0 0-1.3-.1l-1.5.9a6.8 6.8 0 0 0-1.5-.9l-.3-1.5Z"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.4"
			strokeLinejoin="round"
		/>
		<circle cx="10" cy="10" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
	</svg>
);

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
				borderRadius: 0,
			}}
		/>
		{props.multi ? (
			<span
				style={{
					position: "absolute",
					inset: "0 4px 4px 0",
					border: "1.6px solid currentColor",
					borderRadius: 0,
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
			borderRadius: 0,
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