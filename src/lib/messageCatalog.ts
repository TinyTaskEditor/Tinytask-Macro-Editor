export const MESSAGE_LABELS: Record<number, string> = {
  0x0100: 'WM_KEYDOWN',
  0x0101: 'WM_KEYUP',
  0x0104: 'WM_SYSKEYDOWN',
  0x0105: 'WM_SYSKEYUP',
  0x0200: 'WM_MOUSEMOVE',
  0x0201: 'WM_LBUTTONDOWN',
  0x0202: 'WM_LBUTTONUP',
  0x0204: 'WM_RBUTTONDOWN',
  0x0205: 'WM_RBUTTONUP',
  0x0207: 'WM_MBUTTONDOWN',
  0x0208: 'WM_MBUTTONUP',
  0x020a: 'WM_MOUSEWHEEL',
}

export const formatMessageLabel = (message: number) =>
  MESSAGE_LABELS[message] ?? 'UNKNOWN'

