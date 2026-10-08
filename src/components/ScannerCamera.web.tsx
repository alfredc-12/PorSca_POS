import React, { useEffect, useRef } from 'react';
import type { ScannerCameraProps } from './ScannerCamera';

type Detector = Pick<import('barcode-detector').BarcodeDetector, 'detect'>;
const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code'] as const;
let detectorPromise: Promise<Detector> | undefined;

function getDetector(): Promise<Detector> {
  if (!detectorPromise) detectorPromise = (async () => {
    const NativeDetector = (globalThis as typeof globalThis & { BarcodeDetector?: typeof import('barcode-detector').BarcodeDetector }).BarcodeDetector;
    const Constructor = NativeDetector ?? (await import('barcode-detector')).BarcodeDetector;
    return new Constructor({ formats: [...formats] });
  })().catch((error) => { detectorPromise = undefined; throw error; });
  return detectorPromise;
}

/** Own the browser stream so a specific USB/webcam device can be selected. */
export function ScannerCamera({ settings, onReady, onError, onBarcode }: ScannerCameraProps) {
  const video = useRef<HTMLVideoElement>(null);
  const callbacks = useRef({ onReady, onError, onBarcode });
  useEffect(() => { callbacks.current = { onReady, onError, onBarcode }; }, [onReady, onError, onBarcode]);
  const deviceId = settings.deviceId;
  useEffect(() => {
    let active = true;
    let stream: MediaStream | undefined;
    const element = video.current;
    const ended = () => { if (active) callbacks.current.onError('camera'); };
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API unavailable');
        const next = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }), width: { ideal: 1280 }, height: { ideal: 720 } } });
        if (!active || !element) { next.getTracks().forEach((track) => track.stop()); return; }
        stream = next;
        stream.getVideoTracks().forEach((track) => track.addEventListener('ended', ended));
        element.srcObject = stream;
        await element.play();
      } catch {
        if (active) callbacks.current.onError('camera');
      }
    })();
    return () => {
      active = false;
      stream?.getVideoTracks().forEach((track) => track.removeEventListener('ended', ended));
      stream?.getTracks().forEach((track) => track.stop());
      if (element) element.srcObject = null;
    };
  }, [deviceId]);

  const enabled = Boolean(onBarcode);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const scan = async () => {
      const element = video.current;
      try {
        if (element && element.readyState >= 2 && element.videoWidth && element.videoHeight) {
          const detector = await getDetector();
          if (!active) return;
          // CSS transforms affect only the preview; decode the original video.
          const results = await detector.detect(element);
          if (active && results[0]) callbacks.current.onBarcode?.(results[0].rawValue);
        }
      } catch {
        if (active) { callbacks.current.onError('decoder'); return; }
      }
      if (active) timer = setTimeout(() => void scan(), 300);
    };
    void scan();
    return () => { active = false; clearTimeout(timer); };
  }, [enabled, deviceId]);

  return <video ref={video} data-testid="browser-scanner-camera" autoPlay muted playsInline aria-label="Barcode camera preview" onLoadedData={() => callbacks.current.onReady()} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `scaleX(${settings.mirror ? -1 : 1}) scaleY(${settings.flipVertical ? -1 : 1})` }} />;
}
