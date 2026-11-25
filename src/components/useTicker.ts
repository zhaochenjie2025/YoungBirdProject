// S39O-cs-ticker: 数字滚动 hook，把合计热量从旧值平滑滚到新值。
// 实现 requestAnimationFrame 逐帧缓出插值，用 ref 记住当前显示值；新值到来或卸载时取消上一帧循环，
//      系统开启「减少动态效果」时直接落值，不做任何逐帧动画。
// 原理 纯浏览器 API，无需第三方库；只改文本内容、不碰布局，因此不会触发重排；
//      用 ref 而非闭包里的 state 记录起点，动画中途来新值也能从当前显示值接着滚。
import { useEffect, useRef, useState } from 'react';

/** 显示值缓出滚动到目标值；首次渲染直接显示目标值，不做入场动画。 */
export function useTicker(target: number, duration = 500): number {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    const from = shownRef.current;
    if (from === target) return;

    // 减少动态效果：直接落值，避免滚动动画引起不适。
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      shownRef.current = target;
      setShown(target);
      return;
    }

    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      const value = Math.round(from + (target - from) * eased);
      shownRef.current = value;
      setShown(value);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return shown;
}
