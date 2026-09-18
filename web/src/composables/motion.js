import gsap from 'gsap';

/**
 * 页面入场动效: 顶层元素逐个上浮淡入
 * 仅在用户未开启"减少动态效果"时生效;返回清理函数。
 */
export function pageEnter(selector = '.anim-in') {
  const mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const targets = gsap.utils.toArray(selector);
    if (!targets.length) return;
    gsap.from(targets, {
      y: 12,
      autoAlpha: 0,
      duration: 0.32,
      ease: 'power2.out',
      stagger: 0.05,
      clearProps: 'all',
    });
  });
  return () => mm.revert();
}

/**
 * 列表条目交错入场(用于歌单列表等少量条目)
 */
export function listEnter(targets, { stagger = 0.04 } = {}) {
  const mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const list = gsap.utils.toArray(targets);
    if (!list.length) return;
    gsap.from(list, {
      x: -10,
      autoAlpha: 0,
      duration: 0.35,
      ease: 'power2.out',
      stagger,
      clearProps: 'all',
    });
  });
  return () => mm.revert();
}
