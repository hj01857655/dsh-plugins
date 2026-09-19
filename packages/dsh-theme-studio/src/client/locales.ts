/**
 * Locale dictionaries for dsh-theme-studio.
 *
 * @module client/locales
 */

export const NS = 'theme-studio'

export const zh: Record<string, string> = {
  nav: '主题工作室',
  title: '主题工作室',
  subtitle: '自定义 dsh 界面外观',

  presetSection: '预设主题',
  presetHint: '选择一个预设配色方案',
  noPreset: '无（使用默认）',

  accentSection: '强调色',
  accentHint: '自定义界面强调色，覆盖预设中的强调色',
  accentPlaceholder: '#4B8BBE',

  densitySection: '密度',
  densityCompact: '紧凑',
  densityComfortable: '舒适',
  densitySpacious: '宽松',

  radiusSection: '圆角',
  radiusSharp: '锐利',
  radiusRounded: '圆角',
  radiusSoft: '柔和',

  fontSection: '字体',
  fontSystem: '系统',
  fontMono: '等宽',
  fontSerif: '衬线',

  customCssSection: '自定义 CSS',
  customCssHint: '直接覆盖 CSS 自定义属性，每行一个 `--property: value;`',
  customCssPlaceholder: '--accent: #ff0000;\n--border: 1px solid red;',

  preview: '预览',
  apply: '应用',
  reset: '重置为默认',
  resetConfirm: '确定要重置所有主题设置吗？',
  applied: '主题已应用',
  resetted: '已重置为默认主题',

  card: '卡片',
  button: '按钮',
  badge: '标签',
  text: '这是一段示例文本，用于预览主题效果。',
}

export const en: Record<string, string> = {
  nav: 'Theme Studio',
  title: 'Theme Studio',
  subtitle: 'Customize the dsh UI appearance',

  presetSection: 'Preset Themes',
  presetHint: 'Choose a pre-built color scheme',
  noPreset: 'None (use default)',

  accentSection: 'Accent Color',
  accentHint: 'Custom accent color, overrides the preset',
  accentPlaceholder: '#4B8BBE',

  densitySection: 'Density',
  densityCompact: 'Compact',
  densityComfortable: 'Comfortable',
  densitySpacious: 'Spacious',

  radiusSection: 'Border Radius',
  radiusSharp: 'Sharp',
  radiusRounded: 'Rounded',
  radiusSoft: 'Soft',

  fontSection: 'Font Family',
  fontSystem: 'System',
  fontMono: 'Monospace',
  fontSerif: 'Serif',

  customCssSection: 'Custom CSS',
  customCssHint: 'Override CSS custom properties directly, one `--property: value;` per line',
  customCssPlaceholder: '--accent: #ff0000;\n--border: 1px solid red;',

  preview: 'Preview',
  apply: 'Apply',
  reset: 'Reset to Default',
  resetConfirm: 'Reset all theme settings to default?',
  applied: 'Theme applied',
  resetted: 'Reset to default theme',

  card: 'Card',
  button: 'Button',
  badge: 'Badge',
  text: 'This is sample text to preview the theme.',
}
