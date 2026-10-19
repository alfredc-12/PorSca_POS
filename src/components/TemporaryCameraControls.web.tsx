import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { createCameraShortcut, DEFAULT_CAMERA_SETTINGS } from '@/src/domain/temporaryCamera';
import { colors, radius } from '@/src/theme/tokens';
import type { TemporaryCameraControlsProps } from './TemporaryCameraControls';

export function TemporaryCameraControls({ settings, onChange, onOpenChange, busy }: TemporaryCameraControlsProps) {
  const host = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLSelectElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const focusPending = useRef(true);
  const [open, setOpen] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  const request = useRef(0);
  const swallowEscape = useRef(false);
  const reload = useCallback(async () => {
    const current = ++request.current;
    setLoading(true); setError('');
    try {
      if (!navigator.mediaDevices?.enumerateDevices) throw new Error('Device list unavailable');
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (active.current && current === request.current) setCameras(devices.filter((device) => device.kind === 'videoinput' && device.deviceId));
    } catch {
      if (active.current && current === request.current) setError('Camera list unavailable. Check camera permission, then refresh.');
    } finally { if (active.current && current === request.current) setLoading(false); }
  }, []);
  useEffect(() => { active.current = true; host.current?.focus(); return () => { active.current = false; request.current += 1; }; }, []);
  useEffect(() => {
    if (!open) return;
    const changed = () => void reload();
    navigator.mediaDevices?.addEventListener?.('devicechange', changed);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', changed);
  }, [open, reload]);
  useEffect(() => {
    if (!open) { focusPending.current = true; return; }
    if (!focusPending.current) return;
    if (loading || busy) closeButton.current?.focus();
    else { picker.current?.focus(); focusPending.current = false; }
  }, [open, loading, busy]);
  useEffect(() => {
    const shortcut = createCameraShortcut();
    const keydown = (event: KeyboardEvent) => {
      if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); swallowEscape.current = true; setOpen(false); onOpenChange(false); host.current?.focus(); return; }
      const interactive = event.target instanceof Element && Boolean(event.target.closest('input, select, textarea, button, a, [role="button"], [contenteditable="true"]'));
      const toggle = shortcut(event, interactive);
      if (event.code === 'Space' && !interactive && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) event.preventDefault();
      if (toggle) { setOpen(!open); onOpenChange(!open); if (!open) void reload(); }
    };
    const keyup = (event: KeyboardEvent) => { if (swallowEscape.current && event.key === 'Escape') { event.stopPropagation(); swallowEscape.current = false; } };
    window.addEventListener('keydown', keydown, true); window.addEventListener('keyup', keyup, true);
    return () => { window.removeEventListener('keydown', keydown, true); window.removeEventListener('keyup', keyup, true); };
  }, [open, onOpenChange, reload]);
  const close = () => { setOpen(false); onOpenChange(false); host.current?.focus(); };
  return <div ref={host} tabIndex={-1} data-testid="temporary-camera-shortcut" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', outline: 'none' }}>
    {open ? <section aria-label="Temporary camera settings" style={{ position: 'absolute', right: 16, bottom: 84, width: 320, maxWidth: 'calc(100% - 32px)', maxHeight: 'calc(100% - 110px)', overflowY: 'auto', pointerEvents: 'auto', boxSizing: 'border-box', padding: 16, borderRadius: radius.md, background: colors.surface, color: colors.text, boxShadow: '0 8px 28px rgba(0,0,0,0.25)', fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Camera settings</h2>
        <button ref={closeButton} type="button" aria-label="Close camera settings" onClick={close} style={iconButton}><Ionicons name="close" size={22} color={colors.text} /></button>
      </div>
      <p style={{ margin: '0 0 12px', color: colors.textMuted, lineHeight: 1.5 }}>Temporary controls · Scanning pauses while open.</p>
      <label htmlFor="temporary-camera-picker" style={{ display: 'block', fontWeight: 700, marginBottom: 8 }}>Camera</label>
      <select ref={picker} id="temporary-camera-picker" value={settings.deviceId} disabled={busy || loading} onChange={(event) => onChange({ ...settings, deviceId: event.currentTarget.value })} style={{ width: '100%', minHeight: 48, padding: 10, border: `1px solid ${colors.outline}`, borderRadius: radius.sm, background: colors.surface, color: colors.text, fontSize: 16, outlineColor: colors.primary }}>
        <option value="">Automatic camera</option>
        {settings.deviceId && !cameras.some((camera) => camera.deviceId === settings.deviceId) ? <option value={settings.deviceId}>Selected camera (unavailable)</option> : null}
        {cameras.map((camera, index) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `Camera ${index + 1}`}</option>)}
      </select>
      <div role="status" style={{ marginTop: 8, color: error ? colors.danger : colors.textMuted, lineHeight: 1.5 }}>{error || (loading ? 'Loading cameras…' : cameras.length ? `${cameras.length} camera${cameras.length === 1 ? '' : 's'} available` : 'No cameras detected. Connect a camera and refresh.')}</div>
      <label style={toggleStyle}><input type="checkbox" checked={settings.mirror} disabled={busy} onChange={(event) => onChange({ ...settings, mirror: event.currentTarget.checked })} style={checkboxStyle} />Mirror horizontally</label>
      <label style={toggleStyle}><input type="checkbox" checked={settings.flipVertical} disabled={busy} onChange={(event) => onChange({ ...settings, flipVertical: event.currentTarget.checked })} style={checkboxStyle} />Flip vertically</label>
      <div style={{ display: 'flex', gap: 8 }}><button type="button" disabled={loading} onClick={() => void reload()} style={actionButton}>Refresh cameras</button><button type="button" disabled={busy} onClick={() => onChange({ ...DEFAULT_CAMERA_SETTINGS })} style={actionButton}>Reset</button></div>
      <p style={{ margin: '12px 0 0', color: colors.textMuted, lineHeight: 1.5 }}>Close to resume scanning. Settings reset when you leave the scanner.</p>
    </section> : null}
  </div>;
}

const iconButton: React.CSSProperties = { minWidth: 48, minHeight: 48, border: 0, borderRadius: radius.sm, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', outlineColor: colors.primary };
const actionButton: React.CSSProperties = { flex: 1, minHeight: 48, border: `1px solid ${colors.outline}`, borderRadius: radius.sm, background: colors.surface, color: colors.primaryPressed, fontWeight: 700, cursor: 'pointer', outlineColor: colors.primary };
const toggleStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, cursor: 'pointer' };
const checkboxStyle: React.CSSProperties = { width: 20, height: 20, accentColor: colors.primary, outlineColor: colors.primary };
