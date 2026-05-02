export const MAX_DISPLAY_DIGITS = 11;

export enum DisplayMode {
  All = "all",
  Fix = "fix",
  Sci = "sci",
  Eng = "eng",
}

export enum AngleMode {
  Deg = "deg",
  Rad = "rad",
}

export interface DisplaySettings {
  mode: DisplayMode;
  digits: number;
}
