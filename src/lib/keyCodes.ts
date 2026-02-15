const VIRTUAL_KEYS: Record<number, string> = {
  0x08: 'Backspace',
  0x09: 'Tab',
  0x0d: 'Enter',
  0x10: 'Shift',
  0x11: 'Ctrl',
  0x12: 'Alt',
  0x13: 'Pause',
  0x14: 'Caps Lock',
  0x1b: 'Esc',
  0x20: 'Space',
  0x21: 'Page Up',
  0x22: 'Page Down',
  0x23: 'End',
  0x24: 'Home',
  0x25: 'Arrow Left',
  0x26: 'Arrow Up',
  0x27: 'Arrow Right',
  0x28: 'Arrow Down',
  0x2c: 'Print Screen',
  0x2d: 'Insert',
  0x2e: 'Delete',
  0x30: '0',
  0x31: '1',
  0x32: '2',
  0x33: '3',
  0x34: '4',
  0x35: '5',
  0x36: '6',
  0x37: '7',
  0x38: '8',
  0x39: '9',
  0x41: 'A',
  0x42: 'B',
  0x43: 'C',
  0x44: 'D',
  0x45: 'E',
  0x46: 'F',
  0x47: 'G',
  0x48: 'H',
  0x49: 'I',
  0x4a: 'J',
  0x4b: 'K',
  0x4c: 'L',
  0x4d: 'M',
  0x4e: 'N',
  0x4f: 'O',
  0x50: 'P',
  0x51: 'Q',
  0x52: 'R',
  0x53: 'S',
  0x54: 'T',
  0x55: 'U',
  0x56: 'V',
  0x57: 'W',
  0x58: 'X',
  0x59: 'Y',
  0x5a: 'Z',
  0x5b: 'Left Win',
  0x5c: 'Right Win',
  0x5d: 'Menu',
  0x60: 'Numpad 0',
  0x61: 'Numpad 1',
  0x62: 'Numpad 2',
  0x63: 'Numpad 3',
  0x64: 'Numpad 4',
  0x65: 'Numpad 5',
  0x66: 'Numpad 6',
  0x67: 'Numpad 7',
  0x68: 'Numpad 8',
  0x69: 'Numpad 9',
  0x6a: 'Numpad *',
  0x6b: 'Numpad +',
  0x6c: 'Numpad Separator',
  0x6d: 'Numpad -',
  0x6e: 'Numpad .',
  0x6f: 'Numpad /',
  0x70: 'F1',
  0x71: 'F2',
  0x72: 'F3',
  0x73: 'F4',
  0x74: 'F5',
  0x75: 'F6',
  0x76: 'F7',
  0x77: 'F8',
  0x78: 'F9',
  0x79: 'F10',
  0x7a: 'F11',
  0x7b: 'F12',
  0x90: 'Num Lock',
  0x91: 'Scroll Lock',
}

const lookupVirtualKey = (code: number): string | undefined => {
  if (VIRTUAL_KEYS[code]) {
    return VIRTUAL_KEYS[code]
  }

  if (code >= 0x41 && code <= 0x5a) {
    return String.fromCharCode(code)
  }

  if (code >= 0x30 && code <= 0x39) {
    return String.fromCharCode(code)
  }

  return undefined
}

export const describeVirtualKey = (code: number): string => {
  const candidates = [code, code & 0xffff, code & 0xff]

  for (const candidate of candidates) {
    const label = lookupVirtualKey(candidate)
    if (label) {
      return label
    }
  }

  const fallback = candidates[2] || candidates[1] || code
  return `VK_${fallback.toString(16).toUpperCase().padStart(2, '0')}`
}

