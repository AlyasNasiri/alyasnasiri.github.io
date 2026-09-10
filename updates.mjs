export function observeUpdates(registration, { beforeReload = () => true } = {}) {
  let waiting = registration?.waiting || null;
  let control = null;
  let button = null;
  let message = null;
  let requested = false;

  const remove = () => {
    clearPending();
    requested = false;
    control?.remove();
    control = null;
    button = null;
    message = null;
  };
  const clearPending = () => {
    if (!waiting) return;
    waiting.removeEventListener('statechange', onWorkerState);
    navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  };
  const restore = (text) => {
    requested = false;
    if (!button || !message) return;
    button.disabled = false;
    button.textContent = 'Update now';
    message.textContent = text;
  };
  const finishReload = async () => {
    if (!requested) return;
    clearPending();
    let approved;
    try { approved = await beforeReload(); }
    catch (_) { restore('Update activated, but reload was postponed. Your work remains open.'); return; }
    if (approved === false) { restore('Update activated, but reload was postponed. Your work remains open.'); return; }
    location.reload();
  };
  const onControllerChange = () => { finishReload(); };
  const onWorkerState = () => {
    if (waiting?.state === 'redundant') {
      clearPending();
      restore('Update is no longer available.');
    }
  };
  const show = (worker) => {
    if (!worker || control) return;
    waiting = worker;
    control = document.createElement('div');
    control.id = 'app-update-control';
    control.setAttribute('aria-live', 'polite');
    message = document.createElement('span');
    message.textContent = 'Update available.';
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'quiet-button';
    button.textContent = 'Update now';
    button.addEventListener('click', async () => {
      if (requested) return;
      requested = true;
      button.disabled = true;
      button.textContent = 'Preparing update…';
      let approved;
      try { approved = await beforeReload(); }
      catch (_) { restore('Update was not applied. Your work remains open.'); return; }
      if (approved === false) { restore('Update postponed. Your work remains open.'); return; }
      const target = registration.waiting || waiting;
      if (!target || target.state === 'redundant') { restore('Update is no longer available.'); return; }
      waiting = target;
      if (target.state === 'activated' || navigator.serviceWorker.controller === target) {
        await finishReload();
        return;
      }
      target.addEventListener('statechange', onWorkerState);
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange, { once: true });
      try { target.postMessage({ type: 'SKIP_WAITING' }); }
      catch (_) { clearPending(); restore('Update was not applied. Your work remains open.'); }
    });
    control.append(message, button);
    document.body.append(control);
  };
  const inspect = () => { if (registration.waiting) show(registration.waiting); };
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => { if (worker.state === 'installed') inspect(); });
  });
  inspect();
  return { dispose: remove };
}
