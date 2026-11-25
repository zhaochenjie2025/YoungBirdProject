// S39O-cs-ticker: 数字滚动 hook，把合计热量从旧值平滑滚到新值。
// 实现 requestAnimationFrame 逐帧缓出插值，用 ref 记住当前显示值；新值到来或卸载时取消上一帧循环，
//      监听 prefers-reduced-motion 变化，一旦开启就取消逐帧循环并直接落值。
// 原理 纯浏览器 API，无需第三方库；用 ref 而非闭包里的 state 记录起点，动画中途来新值也能接着滚；
//      监听媒体查询变化而非只在首帧读一次，是为了让用户在动画途中改系统设置也能立刻停下。
import { useEffect, useRef, useState } from 'react';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** 显示值缓出滚动到目标值；首次渲染直接显示目标值，不做入场动画。 */
export function useTicker(target: number, duration = 500): number {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = shownRef.current;
    if (from === target) return;

    const stop = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      shownRef.current = target;
      setShown(target);
    };

    // 减少动态效果：直接落值，避免滚动动画引起不适。
    if (typeof window !== 'undefined' && window.matchMedia(REDUCED_MOTION).matches) {
      stop();
      return;
    }

    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      const value = Math.round(from + (target - from) * eased);
      shownRef.current = value;
      setShown(value);
      rafRef.current = k < 1 ? requestAnimationFrame(step) : null;
    };
    rafRef.current = requestAnimationFrame(step);

    // 动画途中用户开启「减少动态效果」时立即停下并落值。
    const mql = window.matchMedia(REDUCED_MOTION);
    const onChange = () => {
      if (mql.matches) stop();
    };
    mql.addEventListener('change', onChange);

    return () => {
      mql.removeEventListener('change', onChange);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [target, duration]);

  return shown;
}
