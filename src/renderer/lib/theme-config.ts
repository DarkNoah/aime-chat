import type { ThemeConfig } from '@/types/app';

type RgbColor = {
  red: number;
  green: number;
  blue: number;
};

const THEME_COLOR_PROPERTIES = [
  '--primary',
  '--primary-foreground',
  '--ring',
  '--chart-1',
  '--accent',
  '--accent-foreground',
  '--sidebar-primary',
  '--sidebar-primary-foreground',
  '--sidebar-accent',
  '--sidebar-accent-foreground',
  '--sidebar-ring',
] as const;

const THEME_BACKGROUND_PROPERTIES = [
  '--theme-sidebar-background-image',
  '--theme-sidebar-background-opacity',
  '--theme-sidebar-background-blur',
  '--theme-chat-background-image',
  '--theme-chat-background-opacity',
  '--theme-chat-background-blur',
] as const;

const parseHexColor = (color: string): RgbColor | null => {
  if (!/^#[0-9a-f]{6}$/i.test(color)) {
    return null;
  }
  return {
    red: Number.parseInt(color.slice(1, 3), 16),
    green: Number.parseInt(color.slice(3, 5), 16),
    blue: Number.parseInt(color.slice(5, 7), 16),
  };
};

const toHexColor = ({ red, green, blue }: RgbColor) =>
  `#${[red, green, blue]
    .map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();

const mixColors = (from: RgbColor, to: RgbColor, amount: number): RgbColor => ({
  red: from.red + (to.red - from.red) * amount,
  green: from.green + (to.green - from.green) * amount,
  blue: from.blue + (to.blue - from.blue) * amount,
});

const getRelativeLuminance = ({ red, green, blue }: RgbColor) => {
  const channels = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};

const getContrastRatio = (first: RgbColor, second: RgbColor) => {
  const firstLuminance = getRelativeLuminance(first);
  const secondLuminance = getRelativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
};

const WHITE = { red: 255, green: 255, blue: 255 };
const BLACK = { red: 0, green: 0, blue: 0 };
const NEAR_BLACK = { red: 20, green: 20, blue: 20 };
const DARK_SURFACE = { red: 37, green: 37, blue: 37 };
const LIGHT_SIDEBAR_SURFACE = { red: 250, green: 250, blue: 250 };
const MINIMUM_TEXT_CONTRAST = 4.5;

export const getHexContrastRatio = (first: string, second: string) => {
  const firstColor = parseHexColor(first);
  const secondColor = parseHexColor(second);
  return firstColor && secondColor
    ? getContrastRatio(firstColor, secondColor)
    : 0;
};

export const mixHexColors = (from: string, to: string, amount: number) => {
  const fromColor = parseHexColor(from);
  const toColor = parseHexColor(to);
  return fromColor && toColor
    ? toHexColor(mixColors(fromColor, toColor, amount))
    : undefined;
};

const hasMinimumSurfaceContrast = (primary: RgbColor, surfaces: RgbColor[]) =>
  surfaces.every((surface) => {
    const tintedSurface = mixColors(surface, primary, 0.1);
    return (
      getContrastRatio(primary, surface) >= MINIMUM_TEXT_CONTRAST &&
      getContrastRatio(primary, tintedSurface) >= MINIMUM_TEXT_CONTRAST
    );
  });

export const deriveThemeColors = (color: string, dark: boolean) => {
  const selected = parseHexColor(color);
  if (!selected) {
    return null;
  }

  const surfaces = dark ? [DARK_SURFACE] : [WHITE, LIGHT_SIDEBAR_SURFACE];
  const adjustmentTarget = dark ? WHITE : NEAR_BLACK;
  let primary = selected;
  for (let step = 0; step < 100; step += 1) {
    if (hasMinimumSurfaceContrast(primary, surfaces)) {
      break;
    }
    primary = mixColors(selected, adjustmentTarget, (step + 1) / 100);
  }

  const whiteContrast = getContrastRatio(primary, WHITE);
  const darkContrast = getContrastRatio(primary, BLACK);
  const foreground = whiteContrast >= darkContrast ? WHITE : BLACK;
  const primaryHex = toHexColor(primary);
  const foregroundHex = toHexColor(foreground);
  const tintAmount = dark ? 18 : 12;

  return {
    primary: primaryHex,
    primaryForeground: foregroundHex,
    // Cartesian OKLab mixing keeps achromatic surfaces from contributing an
    // arbitrary hue, which made teal accents drift toward pink in OKLCH.
    accent: `color-mix(in oklab, ${primaryHex} ${tintAmount}%, var(--background))`,
    accentForeground: 'var(--foreground)',
    sidebarAccent: `color-mix(in oklab, ${primaryHex} ${tintAmount}%, var(--sidebar))`,
    sidebarAccentForeground: 'var(--sidebar-foreground)',
  };
};

const clearProperties = (
  style: CSSStyleDeclaration,
  properties: readonly string[],
) => {
  properties.forEach((property) => style.removeProperty(property));
};

const setBackgroundProperties = (
  style: CSSStyleDeclaration,
  prefix: 'sidebar' | 'chat',
  background: ThemeConfig['sidebarBackground'] | undefined,
) => {
  const imageProperty = `--theme-${prefix}-background-image`;
  const opacityProperty = `--theme-${prefix}-background-opacity`;
  const blurProperty = `--theme-${prefix}-background-blur`;

  if (!background?.url) {
    style.removeProperty(imageProperty);
    style.removeProperty(opacityProperty);
    style.removeProperty(blurProperty);
    return;
  }

  style.setProperty(imageProperty, `url(${JSON.stringify(background.url)})`);
  style.setProperty(opacityProperty, String(background.opacity));
  style.setProperty(blurProperty, `${background.blur}px`);
};

export const applyThemeConfig = (
  root: HTMLElement,
  config: ThemeConfig | undefined,
  dark: boolean,
) => {
  const { style } = root;
  clearProperties(style, THEME_COLOR_PROPERTIES);
  clearProperties(style, THEME_BACKGROUND_PROPERTIES);
  root.toggleAttribute(
    'data-theme-sidebar-background',
    Boolean(config?.sidebarBackground?.url),
  );
  root.toggleAttribute(
    'data-theme-chat-background',
    Boolean(config?.chatBackground?.url),
  );

  const colors = config?.primaryColor
    ? deriveThemeColors(config.primaryColor, dark)
    : null;
  if (colors) {
    style.setProperty('--primary', colors.primary);
    style.setProperty('--primary-foreground', colors.primaryForeground);
    style.setProperty('--ring', colors.primary);
    style.setProperty('--chart-1', colors.primary);
    style.setProperty('--accent', colors.accent);
    style.setProperty('--accent-foreground', colors.accentForeground);
    style.setProperty('--sidebar-primary', colors.primary);
    style.setProperty('--sidebar-primary-foreground', colors.primaryForeground);
    style.setProperty('--sidebar-accent', colors.sidebarAccent);
    style.setProperty(
      '--sidebar-accent-foreground',
      colors.sidebarAccentForeground,
    );
    style.setProperty('--sidebar-ring', colors.primary);
  }

  setBackgroundProperties(style, 'sidebar', config?.sidebarBackground);
  setBackgroundProperties(style, 'chat', config?.chatBackground);
};
