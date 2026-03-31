export type CaptureMode = 'full-page' | 'visible-area' | 'selection';
export type ImageFormat = 'png' | 'jpeg';
export type OutputFormat = 'png' | 'jpeg' | 'pdf';

export interface StartCaptureMessage {
  type: 'START_CAPTURE';
  mode: CaptureMode;
  format: ImageFormat;
  quality: number;
}

export interface CaptureProgressMessage {
  type: 'CAPTURE_PROGRESS';
  current: number;
  total: number;
}

export interface CaptureCompleteMessage {
  type: 'CAPTURE_COMPLETE';
  filename: string;
}

export interface CaptureErrorMessage {
  type: 'CAPTURE_ERROR';
  error: string;
}

export interface StitchImagesMessage {
  type: 'STITCH_IMAGES';
  images: string[];
  pageWidth: number;
  pageHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  format: ImageFormat;
  quality: number;
}

export interface StitchResultMessage {
  type: 'STITCH_RESULT';
  dataUrl: string;
}

export interface StitchErrorMessage {
  type: 'STITCH_ERROR';
  error: string;
}

export type PopupToBackground = StartCaptureMessage;
export type BackgroundToPopup = CaptureProgressMessage | CaptureCompleteMessage | CaptureErrorMessage;
export type BackgroundToOffscreen = StitchImagesMessage;
export type OffscreenToBackground = StitchResultMessage | StitchErrorMessage;

export type Message =
  | StartCaptureMessage
  | CaptureProgressMessage
  | CaptureCompleteMessage
  | CaptureErrorMessage
  | StitchImagesMessage
  | StitchResultMessage
  | StitchErrorMessage;
