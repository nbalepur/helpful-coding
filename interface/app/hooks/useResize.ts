"use client";

import { useState, useRef, useCallback, useEffect, RefObject } from "react";

export interface UseResizeOptions {
  isSwapped: boolean;
  onLayoutAfterResize?: () => void;
}

export function useResize(
  containerRef: RefObject<HTMLDivElement | null>,
  options: UseResizeOptions
) {
  const { isSwapped, onLayoutAfterResize } = options;

  const [leftColumnWidth, setLeftColumnWidth] = useState(0);
  const [isResizing, setIsResizing] = useState(false);
  const [isEditorResizing, setIsEditorResizing] = useState(false);
  const [editorHeight, setEditorHeight] = useState(0);

  const leftPaneRef = useRef<HTMLDivElement | null>(null);
  const pendingLeftWidthRef = useRef<number>(0);
  const rafScheduledRef = useRef<boolean>(false);
  const lastConstrainedWidthRef = useRef<number>(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleEditorMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsEditorResizing(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const containerWidth = rect.width;
      const resizeHandleWidth = 4;
      const relativeX = e.clientX - rect.left;
      let newLeftWidth = relativeX - resizeHandleWidth / 2;
      if (isSwapped) {
        newLeftWidth = containerWidth - relativeX - resizeHandleWidth / 2;
      }
      const minWidthPercent = 25;
      const minWidth = (containerWidth * minWidthPercent) / 100;
      const rightMinWidth = (containerWidth * 30) / 100;
      const maxWidth = Math.max(minWidth, containerWidth - rightMinWidth - resizeHandleWidth);
      const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newLeftWidth));

      lastConstrainedWidthRef.current = constrainedWidth;
      pendingLeftWidthRef.current = constrainedWidth;

      if (!rafScheduledRef.current) {
        rafScheduledRef.current = true;
        requestAnimationFrame(() => {
          rafScheduledRef.current = false;
          if (leftPaneRef.current) {
            try {
              leftPaneRef.current.style.width = `${pendingLeftWidthRef.current}px`;
            } catch {
              // no-op
            }
          }
        });
      }
    },
    [isResizing, isSwapped, containerRef]
  );

  const handleEditorMouseMove = useCallback((e: MouseEvent) => {
    if (!isEditorResizing) return;
    const containerHeight = window.innerHeight - 32;
    const padding = 16;
    const relativeY = e.clientY - padding;
    const newEditorHeight = relativeY;
    const minHeightPercent = 20;
    const maxHeightPercent = 70;
    const minHeight = (containerHeight * minHeightPercent) / 100;
    const maxHeight = (containerHeight * maxHeightPercent) / 100;
    const constrainedHeight = Math.max(minHeight, Math.min(maxHeight, newEditorHeight));
    setEditorHeight(constrainedHeight);
  }, [isEditorResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    setIsEditorResizing(false);
    if (lastConstrainedWidthRef.current > 0) {
      setLeftColumnWidth(lastConstrainedWidthRef.current);
    }
    try {
      onLayoutAfterResize?.();
    } catch {
      // no-op
    }
  }, [onLayoutAfterResize]);

  useEffect(() => {
    if (isResizing || isEditorResizing) {
      const mouseMoveHandler = isResizing ? handleMouseMove : handleEditorMouseMove;
      document.addEventListener("mousemove", mouseMoveHandler);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = isResizing ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    } else {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mousemove", handleEditorMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mousemove", handleEditorMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, isEditorResizing, handleMouseMove, handleEditorMouseMove, handleMouseUp]);

  return {
    leftColumnWidth,
    setLeftColumnWidth,
    isResizing,
    isEditorResizing,
    editorHeight,
    setEditorHeight,
    leftPaneRef,
    handleMouseDown,
    handleEditorMouseDown,
    handleMouseUp,
  };
}
