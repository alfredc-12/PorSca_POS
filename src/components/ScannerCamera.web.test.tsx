/** @jest-environment jsdom */
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ScannerCamera } from './ScannerCamera.web';
import { DEFAULT_CAMERA_SETTINGS } from '@/src/domain/temporaryCamera';

const getUserMedia = jest.fn();
const detect = jest.fn();
const ready = jest.fn();
const error = jest.fn();
const barcode = jest.fn();
let root: Root;
let container: HTMLDivElement;
function stream() {
  const track = { stop: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn() };
  return { track, value: { getTracks: () => [track], getVideoTracks: () => [track] } };
}
async function renderCamera(deviceId = '', enabled = true) {
  await act(async () => root.render(<ScannerCamera settings={{ ...DEFAULT_CAMERA_SETTINGS, deviceId }} onReady={ready} onError={error} onBarcode={enabled ? barcode : undefined} />));
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis, 'BarcodeDetector', { configurable: true, value: class { detect = detect; } });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  getUserMedia.mockReset().mockResolvedValue(stream().value); detect.mockReset().mockResolvedValue([]); ready.mockReset(); error.mockReset(); barcode.mockReset();
  jest.useFakeTimers();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.useRealTimers(); jest.restoreAllMocks(); });

it('requests only video and releases the old camera when selecting another device', async () => {
  const first = stream(); const second = stream(); getUserMedia.mockResolvedValueOnce(first.value).mockResolvedValueOnce(second.value);
  await renderCamera(); expect(getUserMedia).toHaveBeenLastCalledWith(expect.objectContaining({ audio: false }));
  await renderCamera('usb-camera');
  expect(first.track.stop).toHaveBeenCalledTimes(1);
  expect(getUserMedia).toHaveBeenLastCalledWith({ audio: false, video: expect.objectContaining({ deviceId: { exact: 'usb-camera' } }) });
  act(() => container.querySelector('video')!.dispatchEvent(new Event('loadeddata')));
  expect(ready).toHaveBeenCalledTimes(1);
});
it('stops a late stream after closing and never reports it as ready', async () => {
  let finish!: (value: unknown) => void; const late = stream();
  getUserMedia.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  await renderCamera(); act(() => root.unmount());
  await act(async () => finish(late.value));
  expect(late.track.stop).toHaveBeenCalledTimes(1); expect(ready).not.toHaveBeenCalled();
  root = createRoot(container);
});
it('reports camera failures and does not silently choose a different device', async () => {
  getUserMedia.mockRejectedValue(new Error('NotAllowedError'));
  await renderCamera('missing-camera'); expect(error).toHaveBeenCalledWith('camera'); expect(getUserMedia).toHaveBeenCalledTimes(1);
});
it('decodes original video despite preview transforms and ignores late results after closing', async () => {
  await renderCamera();
  const video = container.querySelector('video')!;
  Object.defineProperties(video, { readyState: { value: 2 }, videoWidth: { value: 1280 }, videoHeight: { value: 720 } });
  await act(async () => root.render(<ScannerCamera settings={{ deviceId: '', mirror: true, flipVertical: true }} onReady={ready} onError={error} onBarcode={barcode} />));
  expect(video.style.transform).toBe('scaleX(-1) scaleY(-1)');
  detect.mockResolvedValueOnce([{ rawValue: '0012345678905' }]);
  await act(async () => jest.advanceTimersByTime(300));
  expect(detect).toHaveBeenCalledWith(video); expect(barcode).toHaveBeenCalledWith('0012345678905');
  let finish!: (value: unknown) => void;
  detect.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  await act(async () => jest.advanceTimersByTime(300));
  act(() => root.unmount()); barcode.mockClear();
  await act(async () => finish([{ rawValue: '0012345678999' }]));
  expect(barcode).not.toHaveBeenCalled(); root = createRoot(container);
});
it('pauses decoding when controls are open and reports decoder failures for recovery', async () => {
  await renderCamera('', false);
  const video = container.querySelector('video')!;
  Object.defineProperties(video, { readyState: { value: 2 }, videoWidth: { value: 1280 }, videoHeight: { value: 720 } });
  await act(async () => jest.advanceTimersByTime(1000)); expect(detect).not.toHaveBeenCalled();
  detect.mockRejectedValueOnce(new Error('decoder unavailable'));
  await renderCamera('', true); expect(error).toHaveBeenCalledWith('decoder');
});
