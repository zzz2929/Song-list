// 主题注册表与切换逻辑。样式本体在 design/tokens.css(每个主题一组令牌)。
export const THEMES = [
  {
    id: 'studio',
    name: '深夜录音棚',
    dark: true,
    desc: '近黑 + 霓虹绿,默认主题',
    swatches: ['#0f1014', '#181a20', '#1ed760', '#e8eaed'],
  },
  {
    id: 'galaxy',
    name: 'Midnight Galaxy',
    dark: true,
    desc: '深蓝紫夜空 + 紫罗兰',
    swatches: ['#14162a', '#1d2040', '#8b7cf6', '#ebebf7'],
  },
  {
    id: 'tech',
    name: 'Tech Innovation',
    dark: false,
    desc: '冷白 + 电光蓝,明亮清晰',
    swatches: ['#f5f7fa', '#ffffff', '#2563eb', '#0f172a'],
  },
  {
    id: 'vinyl',
    name: '黑胶暖调',
    dark: false,
    desc: '米白 + 琥珀铜,温润耐看',
    swatches: ['#faf9f7', '#ffffff', '#b45309', '#292524'],
  },
];

const STORAGE_KEY = 'sl.theme';

export function currentTheme() {
  const id = localStorage.getItem(STORAGE_KEY);
  return THEMES.some((t) => t.id === id) ? id : THEMES[0].id;
}

// 应用主题到 <html>:data-theme 驱动令牌切换,dark 类驱动 Element Plus 暗色变量
export function applyTheme(id) {
  const theme = THEMES.find((t) => t.id === id) || THEMES[0];
  document.documentElement.dataset.theme = theme.id;
  document.documentElement.classList.toggle('dark', theme.dark);
  localStorage.setItem(STORAGE_KEY, theme.id);
  return theme;
}
