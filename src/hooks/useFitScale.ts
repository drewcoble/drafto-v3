import { useEffect, useRef, useState } from "react";

interface UseFitScaleOptions {
  minScale?: number;
  maxScale?: number;
}

// Measures `contentRef`'s natural (unscaled) size and computes the scale
// factor needed to fit it entirely within `containerRef`'s available size,
// re-measuring on any resize of either via ResizeObserver - covers both the
// container resizing (window/display resolution change) and the content
// resizing (e.g. DraftBoard.tsx's roster rows changing as picks come in),
// with no extra dependency tracking needed since ResizeObserver reacts to
// both generically.
//
// Meant to be paired with `transform: scale(...)` on the content element:
// it renders at whatever size it naturally wants (its own font-sizes,
// paddings, gaps, unscaled) and gets uniformly scaled up/down to exactly
// fill the container, rather than needing every size value in the tree
// individually recomputed against a shared variable. Transforms don't
// affect layout-box metrics (scrollWidth/scrollHeight) or ResizeObserver's
// reported size, so re-measuring after a scale is already applied still
// reads the content's true unscaled size - no feedback loop.
export function useFitScale({
  minScale = 0.4,
  maxScale = 2.5,
}: UseFitScaleOptions = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const recompute = () => {
      const containerRect = container.getBoundingClientRect();
      const naturalWidth = content.scrollWidth;
      const naturalHeight = content.scrollHeight;
      if (naturalWidth === 0 || naturalHeight === 0) return;
      const fitScale = Math.min(
        containerRect.width / naturalWidth,
        containerRect.height / naturalHeight,
      );
      setScale(Math.min(maxScale, Math.max(minScale, fitScale)));
    };

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(container);
    observer.observe(content);
    return () => observer.disconnect();
  }, [minScale, maxScale]);

  return { containerRef, contentRef, scale };
}
