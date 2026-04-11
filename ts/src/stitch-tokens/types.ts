export type StitchColorMode = 'light' | 'dark';

export interface StitchPalette {
  primary: string;
  primaryContainer: string;
  primaryFixed: string;
  primaryFixedDim: string;
  onPrimary: string;
  onPrimaryContainer: string;
  onPrimaryFixed: string;
  onPrimaryFixedVariant: string;
  inversePrimary: string;
  surfaceTint: string;

  secondary: string;
  secondaryContainer: string;
  secondaryFixed: string;
  secondaryFixedDim: string;
  onSecondary: string;
  onSecondaryContainer: string;
  onSecondaryFixed: string;
  onSecondaryFixedVariant: string;

  tertiary: string;
  tertiaryContainer: string;
  tertiaryFixed: string;
  tertiaryFixedDim: string;
  onTertiary: string;
  onTertiaryContainer: string;
  onTertiaryFixed: string;
  onTertiaryFixedVariant: string;

  background: string;
  surface: string;
  surfaceBright: string;
  surfaceDim: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  surfaceVariant: string;
  inverseSurface: string;
  inverseOnSurface: string;
  onBackground: string;
  onSurface: string;
  onSurfaceVariant: string;

  outline: string;
  outlineVariant: string;

  error: string;
  errorContainer: string;
  onError: string;
  onErrorContainer: string;
}

export interface StitchTypography {
  displayFont: string;
  bodyFont: string;
  labelFont: string;
}

export interface StitchRoundness {
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

export interface StitchSpacing {
  baseUnit: number;
}

export interface StitchTokenSet {
  mode: StitchColorMode;
  palette: StitchPalette;
  typography: StitchTypography;
  roundness: StitchRoundness;
  spacing: StitchSpacing;
}
