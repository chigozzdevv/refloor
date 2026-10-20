export function watchDoorDragCancellation(
  events: {
    canvas: EventTarget;
    window: EventTarget;
    document: EventTarget;
    hidden: () => boolean;
  },
  cancel: () => void,
) {
  const visibility = () => {
    if (events.hidden()) cancel();
  };
  events.canvas.addEventListener('lostpointercapture', cancel);
  events.window.addEventListener('blur', cancel);
  events.window.addEventListener('pointercancel', cancel);
  events.document.addEventListener('visibilitychange', visibility);
  return () => {
    events.canvas.removeEventListener('lostpointercapture', cancel);
    events.window.removeEventListener('blur', cancel);
    events.window.removeEventListener('pointercancel', cancel);
    events.document.removeEventListener('visibilitychange', visibility);
    cancel();
  };
}
