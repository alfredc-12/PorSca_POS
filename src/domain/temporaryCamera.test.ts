import { createCameraShortcut } from './temporaryCamera';

const space = { code: 'Space' };
it('opens only on the fifth distinct Space and resets after activation', () => {
  const press = createCameraShortcut(() => 0);
  expect([press(space), press(space), press(space), press(space)]).toEqual([false, false, false, false]);
  expect(press({ ...space, repeat: true })).toBe(false);
  expect(press(space)).toBe(true);
  expect(press(space)).toBe(false);
});
it('requires consecutive presses within three seconds', () => {
  let time = 0;
  const press = createCameraShortcut(() => time);
  press(space); press(space); press(space); press({ code: 'KeyA' });
  expect(press(space)).toBe(false);
  time = 3001;
  expect(press(space)).toBe(false);
  expect([press(space), press(space), press(space), press(space)]).toEqual([false, false, false, true]);
});
it.each(['ctrlKey', 'altKey', 'metaKey', 'shiftKey'] as const)('ignores %s shortcuts', (modifier) => {
  const press = createCameraShortcut(() => 0);
  for (let i = 0; i < 5; i++) expect(press({ ...space, [modifier]: true })).toBe(false);
});
it('leaves typing and standard control activation alone', () => {
  const press = createCameraShortcut(() => 0);
  for (let i = 0; i < 5; i++) expect(press(space, true)).toBe(false);
  expect(press(space)).toBe(false);
});
