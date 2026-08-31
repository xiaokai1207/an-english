// An English · App entry: boot, TTS warm-up, hash routing

(function boot() {
  Store.load();
  TTS.init();

  if (!document.getElementById('modal')) {
    const modal = document.createElement('div');
    modal.id = 'modal';
    modal.className = 'modal';
    modal.style.display = 'none';
    document.body.appendChild(modal);
  }

  // iOS only allows speech after a user gesture; unlock on first touch.
  const unlock = () => {
    TTS.warmUp();
    SFX.ensure();
  };
  document.addEventListener('touchstart', unlock, { once: true, passive: true });
  document.addEventListener('click', unlock, { once: true });

  window.addEventListener('hashchange', () => {
    FollowRead.cancel();
    render();
  });
  // Switching away mid-recording should release the microphone right away.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) FollowRead.cancel();
  });
  render();
})();
