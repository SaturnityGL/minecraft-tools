function touchPair(pointers) {
  const pts = [...pointers.values()].filter(p => p.type === 'touch').slice(0, 2);
  if (pts.length < 2) return null;
  return {
    cx: (pts[0].x + pts[1].x) / 2,
    cy: (pts[0].y + pts[1].y) / 2,
    d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
  };
}

export function createPointerController({ doc, state, ctx, sample, restoreTool, resolveTool, onStrokeStart, select, takePick }) {
  let stroke = null;
  let lastPos = null;
  const resets = [];

  function finishStroke() {
    const s = stroke;
    stroke = null;
    if (s && typeof s.tool.end === 'function') s.tool.end(ctx);
    if (doc.inStroke) doc.endStroke();
  }

  function strokeMove(x, y) {
    if (!stroke || !lastPos) return;
    const dist = Math.hypot(x - lastPos.x, y - lastPos.y);
    const steps = Math.max(1, Math.ceil(dist / 2));
    for (let i = 1; i <= steps; i++) {
      const px = lastPos.x + (x - lastPos.x) * i / steps;
      const py = lastPos.y + (y - lastPos.y) * i / steps;
      const hit = stroke.view.pick(px, py);
      if (!hit || !hit.face) continue;
      const last = stroke.lastHit;
      if (last && last.x === hit.x && last.y === hit.y) continue;
      stroke.tool.move(ctx, hit);
      stroke.lastHit = hit;
    }
    lastPos = { x, y };
  }

  function attach(canvas, view) {
    const pointers = new Map();
    let mode = null;
    let eyedropViaTool = false;
    let gesture = null;

    resets.push(() => {
      pointers.clear();
      mode = null;
      gesture = null;
    });

    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId);
      canvas.focus({ preventScroll: true });
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
      const touches = [...pointers.values()].filter(p => p.type === 'touch').length;
      if (touches >= 2) {
        finishStroke();
        if (mode === 'select') select.up();
        mode = 'gesture';
        gesture = touchPair(pointers);
        return;
      }
      if (pointers.size > 1) return;
      if (e.button === 1) e.preventDefault();
      if (e.button !== 0 || (state.touchRotate && e.pointerType === 'touch')) {
        mode = 'nav';
        return;
      }
      const hit = view.pick(e.clientX, e.clientY);
      const picking = takePick();
      if (picking) {
        if (hit && hit.face) picking(doc.getPixel(hit.x, hit.y));
        else picking(null);
        mode = 'idle';
        return;
      }
      if (state.tool === 'select' && !e.altKey) {
        mode = select.down(view, e) ? 'select' : 'nav';
        return;
      }
      if (!hit || !hit.face) {
        mode = 'nav';
        return;
      }
      if (e.altKey || state.tool === 'eyedropper') {
        mode = 'eyedrop';
        eyedropViaTool = !e.altKey;
        sample(hit);
        return;
      }
      const tool = resolveTool();
      if (!tool) {
        mode = 'idle';
        return;
      }
      if (state.lock === 'color') state.lockColor = doc.getPixel(hit.x, hit.y);
      doc.beginStroke();
      stroke = { tool, view, lastHit: hit };
      lastPos = { x: e.clientX, y: e.clientY };
      mode = 'paint';
      onStrokeStart(tool);
      tool.begin(ctx, hit);
    });

    canvas.addEventListener('pointermove', e => {
      const p = pointers.get(e.pointerId);
      if (!p) {
        canvas.style.cursor = view.pick(e.clientX, e.clientY) ? 'crosshair' : 'grab';
        return;
      }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (mode === 'gesture') {
        const now = touchPair(pointers);
        if (now && gesture) view.gesture(gesture, now);
        gesture = now;
      } else if (mode === 'nav') {
        view.drag(dx, dy);
      } else if (mode === 'paint') {
        strokeMove(e.clientX, e.clientY);
      } else if (mode === 'select') {
        select.move(view, e);
      } else if (mode === 'eyedrop') {
        const hit = view.pick(e.clientX, e.clientY);
        if (hit && hit.face) sample(hit);
      }
    });

    function release(id) {
      if (!pointers.has(id)) {
        if (mode === 'paint' && pointers.size === 0) finishStroke();
        return;
      }
      pointers.delete(id);
      if (mode === 'paint') finishStroke();
      if (mode === 'select') {
        select.up();
        mode = null;
      }
      if (mode === 'gesture' && pointers.size < 2) {
        mode = null;
        gesture = null;
      }
      if (pointers.size === 0) {
        if (mode === 'eyedrop' && eyedropViaTool && state.tool === 'eyedropper') restoreTool();
        mode = null;
        lastPos = null;
      }
    }

    canvas.addEventListener('pointerup', e => release(e.pointerId));
    canvas.addEventListener('pointercancel', e => release(e.pointerId));
    canvas.addEventListener('lostpointercapture', e => release(e.pointerId));
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      view.wheel(e);
    }, { passive: false });
  }

  function cancelAll() {
    finishStroke();
    for (const reset of resets) reset();
  }

  return { attach, finishStroke, cancelAll };
}
