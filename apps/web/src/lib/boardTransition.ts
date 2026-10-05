export function openBoardWithTransition(cardId: string, navigate: () => void) {
  const card = document.querySelector<HTMLElement>('[data-card-id="' + cardId + '"]');
  const viewport = document.querySelector<HTMLElement>('.canvas-container');
  if (!card || !viewport || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    navigate();
    return;
  }
  document.querySelector('[data-board-transition]')?.remove();
  const from = card.getBoundingClientRect(),
    to = viewport.getBoundingClientRect();
  const snapshot = card.cloneNode(true) as HTMLElement;
  const width = card.offsetWidth,
    height = card.offsetHeight;
  snapshot.dataset.boardTransition = 'true';
  snapshot.removeAttribute('data-card-id');
  snapshot.setAttribute('aria-hidden', 'true');
  snapshot.inert = true;
  Object.assign(snapshot.style, {
    position: 'fixed',
    left: from.left + 'px',
    top: from.top + 'px',
    width: width + 'px',
    height: height + 'px',
    minHeight: '0',
    transformOrigin: 'top left',
    pointerEvents: 'none',
    zIndex: '20000',
  });
  document.body.append(snapshot);
  const animation = snapshot.animate(
    [
      { transform: `scale(${from.width / width}, ${from.height / height})`, opacity: 1, offset: 0 },
      {
        transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / width}, ${to.height / height})`,
        opacity: 1,
        offset: 0.64,
      },
      {
        transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / width}, ${to.height / height})`,
        opacity: 0,
        offset: 1,
      },
    ],
    { duration: 280, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' },
  );
  navigate();
  void animation.finished.catch(() => {}).finally(() => snapshot.remove());
}
