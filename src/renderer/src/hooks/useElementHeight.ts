import { useEffect, useState, type RefObject } from 'react';

/**
 * 요소의 실제 픽셀 높이를 ResizeObserver로 추적한다.
 * 가상 테이블의 scroll.y를 가용 영역에 정확히 맞춰 화면 밖으로 넘치는 잘림을 막는다.
 */
export const useElementHeight = (ref: RefObject<HTMLElement | null>): number => {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.height ?? 0;
      setHeight(next);
    });
    observer.observe(element);
    setHeight(element.clientHeight);
    return () => observer.disconnect();
  }, [ref]);

  return height;
};
