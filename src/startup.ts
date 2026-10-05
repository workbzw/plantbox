/** Give the first scene a presentation opportunity before optional heavy work. */
export function afterPaint(callback: () => void) {
  let second = 0;
  const first = requestAnimationFrame(() => {
    second = requestAnimationFrame(callback);
  });
  return () => {
    cancelAnimationFrame(first);
    cancelAnimationFrame(second);
  };
}
