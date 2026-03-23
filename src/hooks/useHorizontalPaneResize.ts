import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';

interface HorizontalPaneResizeOptions {
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
  keyboardStep?: number;
  minSecondaryWidth?: number;
  stackedBreakpoint?: number;
}

const DEFAULT_KEYBOARD_STEP = 24;
const DEFAULT_MIN_SECONDARY_WIDTH = 360;

export function useHorizontalPaneResize({
  initialWidth,
  minWidth,
  maxWidth,
  keyboardStep = DEFAULT_KEYBOARD_STEP,
  minSecondaryWidth = DEFAULT_MIN_SECONDARY_WIDTH,
  stackedBreakpoint,
}: HorizontalPaneResizeOptions) {
  const [paneWidth, setPaneWidth] = useState(initialWidth);
  const [isStacked, setIsStacked] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragAbortRef = useRef<AbortController | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const pendingWidthRef = useRef<number | null>(null);
  const paneWidthRef = useRef(initialWidth);

  const getContainerWidth = useCallback(() => {
    return containerRef.current?.getBoundingClientRect().width ?? 0;
  }, []);

  const resolveStackedState = useCallback(() => {
    if (!stackedBreakpoint) {
      return false;
    }

    return window.innerWidth <= stackedBreakpoint;
  }, [stackedBreakpoint]);

  const getMaxAllowedWidth = useCallback(() => {
    const containerWidth = getContainerWidth();
    if (!containerWidth) {
      return maxWidth;
    }

    if (resolveStackedState()) {
      return initialWidth;
    }

    return Math.max(minWidth, Math.min(maxWidth, containerWidth - minSecondaryWidth));
  }, [getContainerWidth, initialWidth, maxWidth, minSecondaryWidth, minWidth, resolveStackedState]);

  const clampWidth = useCallback((nextWidth: number) => {
    return Math.min(Math.max(nextWidth, minWidth), getMaxAllowedWidth());
  }, [getMaxAllowedWidth, minWidth]);

  const applyPaneWidth = useCallback((nextWidth: number) => {
    const clampedWidth = clampWidth(nextWidth);
    paneWidthRef.current = clampedWidth;
    setPaneWidth((currentWidth) => (currentWidth === clampedWidth ? currentWidth : clampedWidth));
  }, [clampWidth]);

  const schedulePaneWidth = useCallback((nextWidth: number) => {
    pendingWidthRef.current = nextWidth;
    if (dragFrameRef.current !== null) {
      return;
    }

    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null;
      if (pendingWidthRef.current !== null) {
        applyPaneWidth(pendingWidthRef.current);
        pendingWidthRef.current = null;
      }
    });
  }, [applyPaneWidth]);
  const stopDragging = useCallback(() => {
    dragAbortRef.current?.abort();
    dragAbortRef.current = null;
    setIsDragging(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }

    if (pendingWidthRef.current !== null) {
      applyPaneWidth(pendingWidthRef.current);
      pendingWidthRef.current = null;
    }
  }, [applyPaneWidth]);

  const syncContainerLayout = useCallback(() => {
    const nextIsStacked = resolveStackedState();
    setIsStacked((currentState) => (currentState === nextIsStacked ? currentState : nextIsStacked));

    if (!nextIsStacked) {
      applyPaneWidth(paneWidthRef.current);
    }
  }, [applyPaneWidth, resolveStackedState]);

  const handleResizeMouseDown = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (isStacked) {
      return;
    }

    stopDragging();

    const startX = event.clientX;
    const startWidth = paneWidthRef.current;
    const controller = new AbortController();
    dragAbortRef.current = controller;
    setIsDragging(true);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      schedulePaneWidth(startWidth + deltaX);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove, { signal: controller.signal });
    document.addEventListener('mouseup', stopDragging, { signal: controller.signal, once: true });
  }, [isStacked, schedulePaneWidth, stopDragging]);

  const handleResizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }

    if (isStacked) {
      return;
    }

    event.preventDefault();
    const delta = event.key === 'ArrowLeft' ? -keyboardStep : keyboardStep;
    applyPaneWidth(paneWidthRef.current + delta);
  }, [applyPaneWidth, isStacked, keyboardStep]);

  useEffect(() => {
    applyPaneWidth(initialWidth);
  }, [applyPaneWidth, initialWidth]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    syncContainerLayout();

    const observer = new ResizeObserver(() => {
      syncContainerLayout();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      stopDragging();
    };
  }, [stopDragging, syncContainerLayout]);

  const paneStyle = useMemo<CSSProperties | undefined>(() => {
    if (isStacked) {
      return undefined;
    }

    return { width: paneWidth, flexBasis: paneWidth };
  }, [isStacked, paneWidth]);

  return {
    containerRef,
    isDragging,
    isStacked,
    paneStyle,
    paneWidth,
    handleResizeKeyDown,
    handleResizeMouseDown,
  };
}

export default useHorizontalPaneResize;
