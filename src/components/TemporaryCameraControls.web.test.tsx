/** @jest-environment jsdom */
import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { TemporaryCameraControls } from './TemporaryCameraControls.web';
import { DEFAULT_CAMERA_SETTINGS } from '@/src/domain/temporaryCamera';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const enumerateDevices = jest.fn();
const changed = jest.fn();
let root: Root;
let container: HTMLDivElement;
const devices = [{ kind: 'videoinput', deviceId: 'one', label: 'Built-in camera' }, { kind: 'videoinput', deviceId: 'two', label: 'USB camera' }, { kind: 'audioinput', deviceId: 'mic', label: 'Microphone' }];
function TestPanel({ busy = false }: { busy?: boolean }) {
  const [settings, setSettings] = useState(DEFAULT_CAMERA_SETTINGS);
  return <TemporaryCameraControls settings={settings} onChange={setSettings} onOpenChange={changed} busy={busy} />;
}
const key = (code = 'Space', target: EventTarget = window, repeat = false) => {
  const event = new KeyboardEvent('keydown', { code, key: code === 'Space' ? ' ' : code, bubbles: true, cancelable: true, repeat });
  target.dispatchEvent(event);
  target.dispatchEvent(new KeyboardEvent('keyup', { code, key: code === 'Space' ? ' ' : code, bubbles: true }));
  return event;
};
async function open() { await act(async () => { for (let i = 0; i < 5; i++) key(); }); }
const button = (name: string) => Array.from(container.querySelectorAll('button')).find((item) => item.textContent === name || item.getAttribute('aria-label') === name)!;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { enumerateDevices, addEventListener: jest.fn(), removeEventListener: jest.fn() } });
  enumerateDevices.mockReset().mockResolvedValue(devices); changed.mockClear();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  act(() => root.render(<TestPanel />));
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

it('shows the floating camera picker on five separate presses and pauses scanning', async () => {
  act(() => { for (let i = 0; i < 4; i++) key(); key('Space', window, true); });
  expect(container.querySelector('section')).toBeNull();
  await act(async () => { key(); });
  expect(container.querySelector('section')?.getAttribute('aria-label')).toBe('Temporary camera settings');
  expect(container.querySelectorAll('option')).toHaveLength(3);
  expect(document.activeElement).toBe(container.querySelector('select'));
  expect(changed).toHaveBeenLastCalledWith(true);
});
it('selects a connected camera and independently toggles mirror and vertical flip', async () => {
  await open();
  const select = container.querySelector('select')!;
  act(() => { select.value = 'two'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  const boxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  act(() => { boxes[0].click(); boxes[1].click(); });
  expect(select.value).toBe('two'); expect(boxes[0].checked).toBe(true); expect(boxes[1].checked).toBe(true);
  act(() => button('Reset').click());
  expect(select.value).toBe(''); expect(boxes[0].checked).toBe(false); expect(boxes[1].checked).toBe(false);
});
it('preserves Space in controls and Escape closes only the panel', async () => {
  await open();
  const select = container.querySelector('select')!;
  act(() => { for (let i = 0; i < 5; i++) expect(key('Space', select).defaultPrevented).toBe(false); });
  const outerEscape = jest.fn(); document.addEventListener('keyup', outerEscape);
  act(() => { key('Escape', select); });
  expect(container.querySelector('section')).toBeNull(); expect(changed).toHaveBeenLastCalledWith(false);
  expect(outerEscape).not.toHaveBeenCalled();
  document.removeEventListener('keyup', outerEscape);
  expect(document.activeElement).toBe(container.querySelector('[data-testid="temporary-camera-shortcut"]'));
});
it('recovers from unavailable device enumeration and blocks camera changes during lookup', async () => {
  enumerateDevices.mockRejectedValueOnce(new Error('denied'));
  await open(); expect(container.textContent).toContain('Camera list unavailable');
  await act(async () => button('Refresh cameras').click());
  expect(container.textContent).toContain('2 cameras available');
  act(() => root.render(<TestPanel busy />));
  expect(container.querySelector('select')!.disabled).toBe(true);
  expect(Array.from(container.querySelectorAll('input')).every((input) => input.disabled)).toBe(true);
});
it('removes the shortcut listener after the scanner closes', async () => {
  act(() => root.unmount()); changed.mockClear();
  act(() => { for (let i = 0; i < 5; i++) key(); });
  expect(changed).not.toHaveBeenCalled();
  root = createRoot(container);
});
