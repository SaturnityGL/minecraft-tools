export function createDrawer(root) {
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const panels = new Map(tabs.map(t => [t, document.getElementById(t.getAttribute('aria-controls'))]));
  let active = null;

  function show(tab) {
    active = tab;
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      panels.get(t).hidden = !on;
    }
    root.classList.toggle('is-open', tab !== null);
  }

  function find(name) {
    return tabs.find(t => t.dataset.drawer === name) || null;
  }

  for (const t of tabs) {
    t.addEventListener('click', () => show(active === t ? null : t));
  }

  root.addEventListener('keydown', e => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    tabs[next].focus();
  });

  show(null);

  return {
    open(name) {
      const t = find(name);
      if (t) show(t);
    },
    close() {
      show(null);
    },
    get active() {
      return active ? active.dataset.drawer : null;
    }
  };
}
