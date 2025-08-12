/**
 * Color space conversion utilities for vectorization
 */

export interface RGBColor {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
}

export interface CMYKColor {
  c: number; // 0-100 (percentage)
  m: number; // 0-100 (percentage)
  y: number; // 0-100 (percentage)
  k: number; // 0-100 (percentage)
}

export interface HSVColor {
  h: number; // 0-360 (degrees)
  s: number; // 0-100 (percentage)
  v: number; // 0-100 (percentage)
}

export type ColorSpace = 'rgb' | 'cmyk' | 'grayscale' | 'auto';

/**
 * Convert RGB color to CMYK color space
 */
export function rgbToCmyk(rgb: RGBColor): CMYKColor {
  // Normalize RGB values to 0-1 range
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  // Find the maximum value
  const k = 1 - Math.max(r, Math.max(g, b));

  // Handle pure black case
  if (k === 1) {
    return { c: 0, m: 0, y: 0, k: 100 };
  }

  // Calculate CMY values
  const c = (1 - r - k) / (1 - k);
  const m = (1 - g - k) / (1 - k);
  const y = (1 - b - k) / (1 - k);

  // Convert to percentages and round
  return {
    c: Math.round(c * 100),
    m: Math.round(m * 100),
    y: Math.round(y * 100),
    k: Math.round(k * 100)
  };
}

/**
 * Convert CMYK color to RGB color space
 */
export function cmykToRgb(cmyk: CMYKColor): RGBColor {
  // Normalize CMYK values to 0-1 range
  const c = cmyk.c / 100;
  const m = cmyk.m / 100;
  const y = cmyk.y / 100;
  const k = cmyk.k / 100;

  // Calculate RGB values
  const r = 255 * (1 - c) * (1 - k);
  const g = 255 * (1 - m) * (1 - k);
  const b = 255 * (1 - y) * (1 - k);

  return {
    r: Math.round(Math.max(0, Math.min(255, r))),
    g: Math.round(Math.max(0, Math.min(255, g))),
    b: Math.round(Math.max(0, Math.min(255, b)))
  };
}

/**
 * Convert RGB to grayscale using luminance weights
 */
export function rgbToGrayscale(rgb: RGBColor): number {
  // Use standard luminance formula
  return Math.round(0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b);
}

/**
 * Convert RGB to HSV color space
 */
export function rgbToHsv(rgb: RGBColor): HSVColor {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  let s = max === 0 ? 0 : delta / max;
  let v = max;

  if (delta !== 0) {
    switch (max) {
      case r:
        h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / delta + 2) / 6;
        break;
      case b:
        h = ((r - g) / delta + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    v: Math.round(v * 100)
  };
}

/**
 * Parse hex color string to RGB
 */
export function hexToRgb(hex: string): RGBColor | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

/**
 * Convert RGB to hex color string
 */
export function rgbToHex(rgb: RGBColor): string {
  const toHex = (n: number) => {
    const hex = Math.round(Math.max(0, Math.min(255, n))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

/**
 * Generate SVG color string based on color space
 */
export function generateSVGColor(rgb: RGBColor, colorSpace: ColorSpace): string {
  switch (colorSpace) {
    case 'rgb':
      return `rgb(${rgb.r},${rgb.g},${rgb.b})`;
    
    case 'cmyk': {
      const cmyk = rgbToCmyk(rgb);
      // Use CSS4 device-cmyk() with RGB fallback
      return `device-cmyk(${cmyk.c/100} ${cmyk.m/100} ${cmyk.y/100} ${cmyk.k/100}, rgb(${rgb.r},${rgb.g},${rgb.b}))`;
    }
    
    case 'grayscale': {
      const gray = rgbToGrayscale(rgb);
      return `rgb(${gray},${gray},${gray})`;
    }
    
    case 'auto':
    default:
      return rgbToHex(rgb);
  }
}

/**
 * Get recommended color space based on image characteristics
 */
export function getRecommendedColorSpace(
  hasTransparency: boolean = false,
  colorCount: number = 0,
  dominantColors: RGBColor[] = []
): ColorSpace {
  // If very few colors, might be line art - RGB is fine
  if (colorCount <= 4) {
    return 'rgb';
  }
  
  // If many colors, check if they're print-friendly (high CMYK components)
  if (dominantColors.length > 0) {
    const avgCmykComponents = dominantColors
      .map(rgb => rgbToCmyk(rgb))
      .reduce((avg, cmyk) => ({
        c: avg.c + cmyk.c,
        m: avg.m + cmyk.m,
        y: avg.y + cmyk.y,
        k: avg.k + cmyk.k
      }), { c: 0, m: 0, y: 0, k: 0 });
    
    const avgTotal = (avgCmykComponents.c + avgCmykComponents.m + 
                     avgCmykComponents.y + avgCmykComponents.k) / (dominantColors.length * 4);
    
    // If high CMYK component usage, recommend CMYK
    if (avgTotal > 50) {
      return 'cmyk';
    }
  }
  
  return 'rgb'; // Default for digital use
}

/**
 * Generate ICC color profile metadata for SVG
 */
export function generateColorProfileMetadata(colorSpace: ColorSpace): string {
  const profiles = {
    rgb: {
      name: 'sRGB IEC61966-2.1',
      whitePoint: 'D65',
      primaries: 'sRGB'
    },
    cmyk: {
      name: 'Generic CMYK Profile',
      whitePoint: 'D50',
      primaries: 'CMYK'
    },
    grayscale: {
      name: 'Gray Gamma 2.2',
      whitePoint: 'D65',
      primaries: 'Gray'
    }
  };
  
  const profile = profiles[colorSpace as keyof typeof profiles];
  if (!profile) return '';
  
  return `<!-- Color Profile: ${profile.name}, White Point: ${profile.whitePoint} -->`;
}

/**
 * Optimize colors for specific color space
 */
export function optimizeColorsForSpace(colors: RGBColor[], targetSpace: ColorSpace): RGBColor[] {
  switch (targetSpace) {
    case 'cmyk':
      // Convert to CMYK and back to ensure CMYK-printable colors
      return colors.map(rgb => cmykToRgb(rgbToCmyk(rgb)));
    
    case 'grayscale':
      // Convert all colors to grayscale
      return colors.map(rgb => {
        const gray = rgbToGrayscale(rgb);
        return { r: gray, g: gray, b: gray };
      });
    
    case 'rgb':
    case 'auto':
    default:
      // Keep RGB colors as-is
      return colors;
  }
}