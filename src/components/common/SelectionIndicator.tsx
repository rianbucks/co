'use client';

import { useLayoutEffect, useRef, useState } from 'react';

export default function SelectionIndicator({ active }: { active: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const update = () => {
      const selected = parent.querySelector<HTMLButtonElement>('button[aria-current="page"], button[aria-pressed="true"]');
      if (selected) setPosition({ left: selected.offsetLeft, top: selected.offsetTop, width: selected.offsetWidth, height: selected.offsetHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(parent);
    for (const button of parent.querySelectorAll('button')) observer.observe(button);
    return () => observer.disconnect();
  }, [active]);

  return <span ref={ref} aria-hidden="true" className="selection-indicator" data-ready={Boolean(position)}
    style={position ? { transform: `translateX(${position.left}px)`, top: position.top, width: position.width, height: position.height } : { visibility: 'hidden' }} />;
}
