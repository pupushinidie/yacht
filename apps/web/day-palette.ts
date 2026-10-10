import type { DayPalette } from "./day-theme";

/**
 * 白天版调色表（快艇骰子，月夜甲板的藏青 → 白天碧海白帆的米白）。
 * 深色底、面板、按钮 → 白底浅色；深色像素描边保留；浅色字 → 深色字。
 * 掷骰区（藏青绒布）、计分表（米色纸）、特效、标签这些美术色两套主题一样，放在 keep 里不换。
 */
export const palette: DayPalette = {
  files: ["app-pixel.css", "yacht.css"],
  colors: {
    "#0c1120": "#ffffff", // 底色、输入框
    "#101729": "#f8f9fc", // 底色的棋盘纹
    "#16203a": "#f5f7fb", // 面板
    "#1d2a48": "#e8edf5", // 面板 2、分隔线
    "#263759": "#e1e7f1", // 普通按钮、分隔线
    "#18233d": "#fbf3df", // 管理员区
    "#3a2c10": "#fcefc6", // 金色字的底（选中项、状态牌）
    "#04060c": "#1c2638", // 像素描边
    "#3d5482": "#ffffff", // 面板亮边
    "#080c17": "#c9d3e3", // 面板暗边
    "#5a78ad": "#ffffff", // 按钮亮边
    "#0b1120": "#aebad0", // 按钮暗边
    // 牌桌（yacht.css）
    "#0d1b30": "#fffaf0", // 牌桌面板（状态条、玩家、记录）
    "#18324f": "#efe6d2", // 牌桌面板 2（轮到的人）
    "#2a4a6e": "#ffffff", // 牌桌面板亮边
    "#06101e": "#8a7354", // 牌桌面板描边（柚木色）
    "#2a2210": "#fff1c2", // 轮到你时的状态条
    "#3a2a10": "#fde9b0", // 托管提示条
  },
  text: {
    "#eef3fb": "#1d2433",
    "#93a3bd": "#5b6a86",
    "#ffe39a": "#8a5a00", // 金色字（轮到你、倒计时、名次）
    "#59d2db": "#16706b", // 青绿字（同时掷、亮出）
    "#ff8a80": "#c62828", // 错误
    "#ff6b5c": "#c62828", // 倒计时快到了
    "#5d6f92": "#9aa8c0", // 输入框占位字
  },
  background: {
    "#eef3fb": "#1d2a48", // 左上角标志中间那一条，白底上看不见，换成深蓝
  },
  values: {
    // 不能点的按钮：夜间是压暗，白底上压暗成了泥色，改成褪成浅灰
    "grayscale(0.6) brightness(0.7)": "grayscale(0.85) brightness(1.15)",
  },
  textShadows: {
    // 大标题的投影：夜间是黑色，白底上换成浅金色
    "calc(var(--px) * 2) calc(var(--px) * 2) 0 var(--edge)": "calc(var(--px) * 2) calc(var(--px) * 2) 0 #f0d890",
  },
  textVarColors: {
    "--gold": "#94650a",
    "--gold-2": "#94650a",
    "--ok": "#1f8a45",
    "--bad": "#d1303f",
  },
  // 掷骰区、计分表、特效、标签、背景两套主题一样（掷骰区是深底，字色在 theme-day.css 里也不换）
  keep: [
    ".yt-backdrop", ".yt-lantern", ".yt-tray", ".yt-tray-", ".yt-die", ".yt-die-", ".yt-cup", ".yt-yacht-fx", ".yt-burst", ".yt-gulu",
    ".yt-sheet", ".yt-sheet-", ".yt-rowhead", ".yt-subhead", ".yt-corner", ".yt-totalhead", ".yt-colhead", ".yt-cell", ".yt-cell-",
    ".yt-scratch", ".yt-sub", ".yt-sub-", ".yt-total", ".yt-bonus-fx", ".yt-toast", ".yt-tag", ".yt-badge",
  ],
};
