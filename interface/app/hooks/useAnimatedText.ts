"use client";

import { animate } from "framer-motion";
import { useEffect, useState } from "react";

type UseAnimatedTextOptions = {
  delimiter?: string;
  duration?: number;
};

const DEFAULT_OPTIONS: UseAnimatedTextOptions = {
  delimiter: "",
  duration: 2.4,
};

export function useAnimatedText(text: string, options: UseAnimatedTextOptions = {}): string {
  const { delimiter, duration } = { ...DEFAULT_OPTIONS, ...options };
  const segments = text.split(delimiter);

  const [cursor, setCursor] = useState(0);
  const [startingCursor, setStartingCursor] = useState(0);
  const [prevText, setPrevText] = useState(text);

  if (prevText !== text) {
    const prevSegments = prevText.split(delimiter);
    const nextSegments = text.split(delimiter);
    const hasPrefix = nextSegments.slice(0, prevSegments.length).join(delimiter) === prevText;

    setPrevText(text);
    setStartingCursor(hasPrefix ? cursor : 0);
  }

  useEffect(() => {
    if (!text) {
      setCursor(0);
      return;
    }

    const totalSegments = segments.length;
    const safeStart = Math.min(startingCursor, totalSegments);

    setCursor(safeStart);

    const controls = animate(safeStart, totalSegments, {
      duration,
      ease: "linear",
      onUpdate(latest) {
        setCursor(Math.min(totalSegments, Math.floor(latest)));
      },
    });

    return () => controls.stop();
  }, [duration, segments.length, startingCursor, text]);

  return segments.slice(0, cursor).join(delimiter);
}

