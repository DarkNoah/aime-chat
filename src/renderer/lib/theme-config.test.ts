import type { ThemeConfig } from '@/types/app';
import {
  applyThemeConfig,
  deriveThemeColors,
  getHexContrastRatio,
  mixHexColors,
} from './theme-config';

const customTheme: ThemeConfig = {
  primaryColor: '#0F766E',
  sidebarBackground: {
    url: 'file:///tmp/sidebar%20background.png',
    opacity: 0.25,
    blur: 4,
  },
  chatBackground: {
    url: 'file:///tmp/chat.png',
    opacity: 0.15,
    blur: 2,
  },
};

describe('theme config CSS application', () => {
  it('does not add inline overrides for the default appearance', () => {
    const root = document.createElement('html');

    applyThemeConfig(root, undefined, false);

    expect(root.style.getPropertyValue('--primary')).toBe('');
    expect(root.style.getPropertyValue('--theme-chat-background-image')).toBe(
      '',
    );
    expect(root.hasAttribute('data-theme-sidebar-background')).toBe(false);
    expect(root.hasAttribute('data-theme-chat-background')).toBe(false);
  });

  it('applies the semantic accent group and both managed backgrounds', () => {
    const root = document.createElement('html');

    applyThemeConfig(root, customTheme, false);

    expect(root.style.getPropertyValue('--primary')).not.toBe('');
    expect(root.style.getPropertyValue('--primary-foreground')).not.toBe('');
    expect(root.style.getPropertyValue('--ring')).toBe(
      root.style.getPropertyValue('--primary'),
    );
    expect(root.style.getPropertyValue('--sidebar-primary')).toBe(
      root.style.getPropertyValue('--primary'),
    );
    expect(
      root.style.getPropertyValue('--theme-sidebar-background-image'),
    ).toContain('sidebar%20background.png');
    expect(root.getAttribute('data-theme-sidebar-background')).toBe('');
    expect(root.getAttribute('data-theme-chat-background')).toBe('');
  });

  it('fully removes overrides when the appearance is reset', () => {
    const root = document.createElement('html');
    applyThemeConfig(root, customTheme, true);

    applyThemeConfig(root, undefined, true);

    expect(root.style.getPropertyValue('--primary')).toBe('');
    expect(root.style.getPropertyValue('--sidebar-accent')).toBe('');
    expect(
      root.style.getPropertyValue('--theme-sidebar-background-image'),
    ).toBe('');
    expect(root.hasAttribute('data-theme-sidebar-background')).toBe(false);
  });

  it('adjusts extreme colors so they remain visible on each surface', () => {
    expect(deriveThemeColors('#FFFFFF', false)?.primary).not.toBe('#FFFFFF');
    expect(deriveThemeColors('#000000', true)?.primary).not.toBe('#000000');
  });

  it('mixes surface tints in OKLab so neutral backgrounds do not shift hue', () => {
    const colors = deriveThemeColors('#0F766E', false);

    expect(colors?.accent).toMatch(/^color-mix\(in oklab,/);
    expect(colors?.sidebarAccent).toMatch(/^color-mix\(in oklab,/);
    expect(colors?.accent).not.toContain('in oklch');
    expect(colors?.sidebarAccent).not.toContain('in oklch');
  });

  it.each([
    ['#777777', false, '#FFFFFF'],
    ['#7A7A7A', false, '#FFFFFF'],
    ['#111111', true, '#252525'],
    ['#F5F5F5', true, '#252525'],
  ])(
    'keeps %s at WCAG AA text contrast in %s mode',
    (selected, dark, surface) => {
      const colors = deriveThemeColors(selected, dark);
      expect(colors).not.toBeNull();
      expect(
        getHexContrastRatio(colors!.primary, surface),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        getHexContrastRatio(colors!.primary, colors!.primaryForeground),
      ).toBeGreaterThanOrEqual(4.5);
      const sidebarSurface = dark ? '#252525' : '#FAFAFA';
      const tintedSurface = mixHexColors(sidebarSurface, colors!.primary, 0.1);
      expect(tintedSurface).toBeDefined();
      expect(
        getHexContrastRatio(colors!.primary, tintedSurface!),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );
});
