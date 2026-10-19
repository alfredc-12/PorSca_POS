import { TemporaryCameraSettings } from '@/src/domain/temporaryCamera';

export type TemporaryCameraControlsProps = { settings: TemporaryCameraSettings; onChange: (settings: TemporaryCameraSettings) => void; onOpenChange: (open: boolean) => void; busy: boolean };

// The temporary keyboard panel is for browser development only.
export function TemporaryCameraControls(_props: TemporaryCameraControlsProps) { return null; }
