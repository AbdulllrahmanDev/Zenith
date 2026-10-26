export const MOUSE_TRIGGER_BUTTONS = ['middle', 'x1', 'x2', 'left', 'right'] as const;
export type MouseTriggerButton = (typeof MOUSE_TRIGGER_BUTTONS)[number];
export const DEFAULT_MOUSE_TRIGGER = 'middle';

export interface MouseTrigger {
  button: MouseTriggerButton;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

export const MOUSE_BUTTON_LABELS: Record<MouseTriggerButton, string> = {
  middle: 'Wheel',
  x1: 'Mouse 4',
  x2: 'Mouse 5',
  left: 'Left',
  right: 'Right',
};

export const MOUSE_BUTTON_NAMES: Record<MouseTriggerButton, string> = {
  middle: 'the mouse wheel button',
  x1: 'the back side-button',
  x2: 'the forward side-button',
  left: 'the left button',
  right: 'the right button',
};

const BUTTON_BY_EVENT_CODE: Record<number, MouseTriggerButton> = {
  0: 'left',
  1: 'middle',
  2: 'right',
  3: 'x1',
  4: 'x2',
};

export function parseMouseTrigger(value: unknown): MouseTrigger {
  const fallback: MouseTrigger = {
    button: DEFAULT_MOUSE_TRIGGER,
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
  };
  if (typeof value !== 'string') return fallback;
  const parts = value.split('+').map((s) => s.trim().toLowerCase());
  let button: MouseTriggerButton = DEFAULT_MOUSE_TRIGGER;
  let ctrl = false;
  let alt = false;
  let shift = false;
  let meta = false;

  for (const part of parts) {
    if (part === 'ctrl' || part === 'control') ctrl = true;
    else if (part === 'alt' || part === 'option') alt = true;
    else if (part === 'shift') shift = true;
    else if (part === 'win' || part === 'super' || part === 'meta') meta = true;
    else if (MOUSE_TRIGGER_BUTTONS.includes(part as MouseTriggerButton)) {
      button = part as MouseTriggerButton;
    }
  }

  return { button, ctrl, alt, shift, meta };
}

export function formatMouseTrigger(trigger: MouseTrigger): string {
  const parts: string[] = [];
  if (trigger.ctrl) parts.push('Ctrl');
  if (trigger.alt) parts.push('Alt');
  if (trigger.shift) parts.push('Shift');
  if (trigger.meta) parts.push('Win');
  parts.push(trigger.button);
  return parts.join('+');
}

export function mouseTriggerAllowsHold(value: unknown): boolean {
  const trigger = parseMouseTrigger(value);
  return trigger.button === 'middle' || trigger.button === 'x1' || trigger.button === 'x2';
}

export function mouseTriggerFromEvent(event: React.MouseEvent | MouseEvent): MouseTrigger {
  const button = BUTTON_BY_EVENT_CODE[event.button] ?? DEFAULT_MOUSE_TRIGGER;
  return {
    button,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
  };
}
