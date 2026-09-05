import { useWindowDimensions } from 'react-native';

const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getResponsiveMetrics(width: number, height: number) {
  const widthScale = width / BASE_WIDTH;
  const heightScale = height / BASE_HEIGHT;
  const scale = clamp(Math.min(widthScale, heightScale * 1.08), 0.86, 1.14);

  return {
    width,
    height,
    scale,
    narrow: width < 360,
    veryNarrow: width < 335,
    short: height < 720,
    tall: height > 900,
    wide: width >= 430,
    horizontalPadding: clamp(width * 0.041, 12, 22),
    sectionGap: clamp(height * 0.018, 12, 20),
    controlHeight: clamp(height * 0.066, 50, 60),
    tabBarHeight: clamp(height * 0.095, 68, 88),
    s: (value: number) => Math.round(value * scale),
    font: (value: number) => Math.round(value * clamp(scale, 0.92, 1.08) * 10) / 10,
    widthValue: (fraction: number, min: number, max: number) => clamp(width * fraction, min, max),
    heightValue: (fraction: number, min: number, max: number) => clamp(height * fraction, min, max),
  };
}

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  return getResponsiveMetrics(width, height);
}
