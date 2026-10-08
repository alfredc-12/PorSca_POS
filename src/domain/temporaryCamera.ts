export type TemporaryCameraSettings = { deviceId: string; mirror: boolean; flipVertical: boolean };
export const DEFAULT_CAMERA_SETTINGS: TemporaryCameraSettings = { deviceId: '', mirror: false, flipVertical: false };

/** Five distinct, consecutive Space presses within three seconds. */
export function createCameraShortcut(now = Date.now) {
  let count = 0;
  let started = 0;
  return (event: { code: string; repeat?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; shiftKey?: boolean }, interactive = false) => {
    if (interactive || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.code !== 'Space') { count = 0; return false; }
    if (event.repeat) return false;
    const time = now();
    if (!count || time - started > 3000) { count = 0; started = time; }
    count += 1;
    if (count !== 5) return false;
    count = 0;
    return true;
  };
}
