import { useEffect, useMemo, useRef, useState } from "react";

type YouTubePlayerProps = {
  videoId: string;
  startSeconds: number;
  onProgress: (seconds: number) => void;
};

declare global {
  interface Window {
    YT?: {
      Player?: new (
        element: HTMLElement,
        options: {
          videoId: string;
          width?: string;
          height?: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: () => void;
            onStateChange?: () => void;
            onError?: () => void;
          };
        }
      ) => {
        getCurrentTime?: () => number;
        seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
        destroy?: () => void;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
    __sphenYouTubeApiPromise?: Promise<void>;
  }
}

function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (window.__sphenYouTubeApiPromise) return window.__sphenYouTubeApiPromise;

  window.__sphenYouTubeApiPromise = new Promise<void>((resolve, reject) => {
    const done = () => {
      if (window.YT?.Player) resolve();
      else reject(new Error("YouTube API loaded without Player API"));
    };

    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      done();
    };

    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]') as HTMLScriptElement | null;
    if (existing) {
      if (window.YT?.Player) {
        done();
        return;
      }
      existing.addEventListener("load", done, { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load YouTube API")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => reject(new Error("Failed to load YouTube API"));
    document.head.appendChild(script);
  }).catch((error) => {
    window.__sphenYouTubeApiPromise = undefined;
    throw error;
  });

  return window.__sphenYouTubeApiPromise;
}

export function YouTubePlayer(props: YouTubePlayerProps) {
  const { videoId, startSeconds, onProgress } = props;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const onProgressRef = useRef(onProgress);
  const playerRef = useRef<{
    getCurrentTime?: () => number;
    seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
    destroy?: () => void;
  } | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const readyTimerRef = useRef<number | null>(null);
  const [fallbackMode, setFallbackMode] = useState(false);
  const [roundedStart] = useState(() => Math.max(0, Math.floor(startSeconds)));

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  const fallbackSrc = useMemo(
    () => `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=0&playsinline=1&rel=0&modestbranding=1&start=${roundedStart}`,
    [roundedStart, videoId]
  );

  useEffect(() => {
    const reportProgress = () => {
      const seconds = playerRef.current?.getCurrentTime?.();
      if (!Number.isFinite(seconds)) return;
      onProgressRef.current(Math.max(0, seconds as number));
    };

    let cancelled = false;
    void loadYouTubeIframeApi()
      .then(() => {
        if (cancelled) return;
        const host = hostRef.current;
        if (!host || !window.YT?.Player) {
          setFallbackMode(true);
          return;
        }

        // Let YouTube replace an imperative child rather than the React-owned
        // host itself. This avoids occasional stale/black iframes when React
        // and the iframe API both try to own the same DOM node.
        const mount = document.createElement("div");
        mount.style.width = "100%";
        mount.style.height = "100%";
        host.replaceChildren(mount);

        const fallBack = () => {
          if (cancelled) return;
          if (readyTimerRef.current !== null) { window.clearTimeout(readyTimerRef.current); readyTimerRef.current = null; }
          try { playerRef.current?.destroy?.(); } catch { /* no-op */ }
          playerRef.current = null;
          setFallbackMode(true);
        };

        const player = new window.YT.Player(mount, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 0,
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            enablejsapi: 1,
            start: roundedStart,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (readyTimerRef.current !== null) { window.clearTimeout(readyTimerRef.current); readyTimerRef.current = null; }
              if (roundedStart > 0) player.seekTo?.(roundedStart, true);
              reportProgress();
            },
            onStateChange: reportProgress,
            onError: fallBack,
          },
        });

        playerRef.current = player;
        // If the API creates an iframe but never reaches Ready, it presents as
        // a persistent black rectangle. Fall back to a plain privacy-enhanced
        // embed instead of leaving the player stuck.
        readyTimerRef.current = window.setTimeout(fallBack, 8000);
        progressTimerRef.current = window.setInterval(reportProgress, 5000);
      })
      .catch(() => {
        if (cancelled) return;
        setFallbackMode(true);
      });

    return () => {
      cancelled = true;
      if (progressTimerRef.current !== null) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      if (readyTimerRef.current !== null) {
        window.clearTimeout(readyTimerRef.current);
        readyTimerRef.current = null;
      }
      const seconds = playerRef.current?.getCurrentTime?.();
      if (Number.isFinite(seconds)) onProgressRef.current(Math.max(0, seconds as number));
      try {
        playerRef.current?.destroy?.();
      } catch {
        // No-op.
      }
      playerRef.current = null;
    };
  }, [roundedStart, videoId]);

  if (fallbackMode) {
    return <iframe src={fallbackSrc} title="Puzzle video" loading="eager" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />;
  }

  return <div className="youtubePlayerHost" ref={hostRef} />;
}
