/* 3D-Modelle für die Präsentation: ersetzt die flachen SVG-Abbildungen durch drehbare Three.js-Szenen.
   Ohne three.js (oder ohne WebGL) bleibt alles bei den SVG-Abbildungen. Physik: dieselbe paraxiale Strahlrechnung wie in 2D. */
(() => {
  if (!window.THREE) return;
  try { const c = document.createElement('canvas'); if (!(c.getContext('webgl') || c.getContext('experimental-webgl'))) return; } catch (e) { return; }
  const T = THREE, $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const C = { ray: 0xffc94a, glass: 0x8fdcf5, hit: 0x4fd18b, miss: 0xff5d5d, sclera: 0xe3ebf1, retina: 0xf0a43a, muscle: 0xe0707a, nerve: 0xe8c46a, iris: 0x2f8fbf, vitreous: 0x1b3448 };
  const LENS_X = -0.68, PE = 1 / (1 - LENS_X), GLASS_X = -1.8, X0 = -3.3, ANG = [...Array(8)].map((_, i) => i / 8 * Math.PI * 2);
  const views = [];

  /* ---------- helpers ---------- */
  function trace(h, u, x0, elems, xEnd) {
    let x = x0, y = h; const pts = [[x, y]];
    for (const e of elems) { y += u * (e.x - x); x = e.x; pts.push([x, y]); u -= y * e.P; }
    const xf = u !== 0 ? x - y / u : Infinity, yEnd = y + u * (xEnd - x); pts.push([xEnd, yEnd]);
    return { pts, xf, yEnd, xLast: x, yLast: y };
  }
  const v3 = (x, r, a) => new T.Vector3(x, r * Math.cos(a), r * Math.sin(a));
  function tube(points, color, r, opacity) {
    const path = new T.CurvePath(); for (let i = 0; i < points.length - 1; i++) path.add(new T.LineCurve3(points[i], points[i + 1]));
    return new T.Mesh(new T.TubeGeometry(path, Math.max(8, points.length * 10), r, 6, false),
      new T.MeshBasicMaterial({ color, transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false }));
  }
  function glowRay(points, color = C.ray, faint = false) {
    const g = new T.Group(); g.add(tube(points, color, faint ? .007 : .016, faint ? .5 : 1)); if (!faint) g.add(tube(points, color, .045, .2));
    // light pulse running along the ray
    const lens = [0]; for (let i = 1; i < points.length; i++) lens.push(lens[i - 1] + points[i].distanceTo(points[i - 1]));
    if (!faint) { const p = new T.Mesh(new T.SphereGeometry(.03, 10, 8), new T.MeshBasicMaterial({ color: 0xffffff })); p.userData = { points, lens }; g.add(p); g.userData.pulse = p; }
    return g;
  }
  function stepPulses(group, t) {
    group.traverse(o => { const p = o.userData && o.userData.pulse; if (!p) return; const { points, lens } = p.userData, L = lens[lens.length - 1], d = (t * 1.6 % 1) * L;
      let i = 1; while (i < lens.length - 1 && lens[i] < d) i++; const k = (d - lens[i - 1]) / (lens[i] - lens[i - 1] || 1); p.position.lerpVectors(points[i - 1], points[i], Math.min(1, k)); });
  }
  function dot(color, r = .055) { const g = new T.Group(); g.add(new T.Mesh(new T.SphereGeometry(r, 20, 14), new T.MeshBasicMaterial({ color }))); g.add(new T.Mesh(new T.SphereGeometry(r * 2.6, 20, 14), new T.MeshBasicMaterial({ color, transparent: true, opacity: .22, blending: T.AdditiveBlending, depthWrite: false }))); return g; }
  const glassMat = (op = .5) => new T.MeshPhongMaterial({ color: C.glass, transparent: true, opacity: op, shininess: 160, specular: 0xffffff, emissive: 0x0b3a4c, side: T.DoubleSide, depthWrite: false });
  function lensMesh(D, R, k) {
    const pts = [], n = 28, e = .03 + Math.max(0, -D) * k, b = D * k, t = r => Math.max(.02, e + b * (1 - (r / R) ** 2));
    for (let i = 0; i <= n; i++) pts.push(new T.Vector2(R * i / n, -t(R * i / n) / 2));
    for (let i = n; i >= 0; i--) pts.push(new T.Vector2(R * i / n, t(R * i / n) / 2));
    const m = new T.Mesh(new T.LatheGeometry(pts, 72), glassMat(.5)); m.rotation.z = -Math.PI / 2;
    const rim = new T.Mesh(new T.TorusGeometry(R, .012, 8, 72), new T.MeshBasicMaterial({ color: C.glass })); rim.rotation.y = Math.PI / 2;
    const g = new T.Group(); g.add(m, rim); return g;
  }

  /* ---------- the eye ---------- */
  function makeEye(L = 2) {
    const g = new T.Group(), cx = -1 + L / 2, sx = L / 2;
    const shell = (r, color, op, phiS, phiL, extra = {}) => {
      const m = new T.Mesh(new T.SphereGeometry(r, 72, 48, phiS, phiL), new T.MeshStandardMaterial(Object.assign({ color, roughness: .55, side: T.DoubleSide, transparent: op < 1, opacity: op }, extra)));
      m.scale.set(sx, 1, 1); m.position.x = cx; return m;
    };
    g.add(shell(1, C.sclera, 1, Math.PI, Math.PI));                                  // Lederhaut, aufgeschnitten
    g.add(shell(.962, 0x7a3a52, 1, Math.PI, Math.PI));                               // Aderhaut
    g.add(shell(.95, C.retina, 1, Math.PI, Math.PI * .62, { emissive: 0x4a2400 }));  // Netzhaut (hinten)
    const vit = shell(.94, C.vitreous, .28, Math.PI, Math.PI); vit.material.depthWrite = false; g.add(vit);
    const cornea = new T.Mesh(new T.SphereGeometry(.5, 48, 24, 0, Math.PI * 2, 0, .95), glassMat(.32));
    cornea.rotation.z = Math.PI / 2; cornea.position.x = -1.1 + .5; g.add(cornea);
    const iris = new T.Mesh(new T.RingGeometry(.15, .42, 64), new T.MeshStandardMaterial({ color: C.iris, side: T.DoubleSide, roughness: .4, emissive: 0x06283a }));
    iris.rotation.y = Math.PI / 2; iris.position.x = -.84; g.add(iris);
    const lens = new T.Mesh(new T.SphereGeometry(.3, 48, 32), glassMat(.6)); lens.scale.x = .45; lens.position.x = LENS_X; g.add(lens);
    const cil = new T.Mesh(new T.TorusGeometry(.36, .055, 16, 64), new T.MeshStandardMaterial({ color: C.muscle, roughness: .5 }));
    cil.rotation.y = Math.PI / 2; cil.position.x = LENS_X; g.add(cil);
    const nerve = new T.Mesh(new T.CylinderGeometry(.09, .1, .6, 24), new T.MeshStandardMaterial({ color: C.nerve, roughness: .6 }));
    nerve.rotation.z = Math.PI / 2; nerve.position.set(-1 + L + .26, -.16, 0); g.add(nerve);
    const fov = dot(C.ray, .03); fov.position.set(-1 + L - .04, 0, 0); g.add(fov);
    return { group: g, back: -1 + L, lens, cil };
  }

  /* ---------- views ---------- */
  function mount(svg, opt) {
    if (!svg) return null;
    const W = svg.clientWidth || 400, H = svg.clientHeight || 200;
    const wrap = document.createElement('div'); wrap.className = 'm3d';
    wrap.style.cssText = `position:relative;width:${W}px;height:${H}px;flex:none;min-width:0;cursor:grab;transform-style:preserve-3d`;
    svg.style.display = 'none'; svg.parentNode.insertBefore(wrap, svg);
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(2.5, (devicePixelRatio || 1) * 1.5)); renderer.setSize(W, H);
    wrap.appendChild(renderer.domElement);
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(opt.fov || 30, W / H, .1, 100);
    scene.add(new T.AmbientLight(0xffffff, .55));
    const key = new T.DirectionalLight(0xffffff, .85); key.position.set(-3, 4, 5); scene.add(key);
    const rim = new T.PointLight(0x4fb3d9, 1.6, 12); rim.position.set(3, -2, 3); scene.add(rim);
    const v = Object.assign({ wrap, W, H, renderer, scene, camera, slide: wrap.closest('.slide'), center: new T.Vector3(...(opt.center || [-.6, 0, 0])), dist: 5, elev: .9, yaw: .38, amp: .28, userYaw: 0, userPitch: 0, labels: [], phase: Math.random() * 6, update: () => {} }, opt);
    v.center = new T.Vector3(...(opt.center || [-.6, 0, 0]));
    wrap.addEventListener('pointermove', e => { const r = wrap.getBoundingClientRect(); v.userYaw = ((e.clientX - r.left) / r.width - .5) * 1.4; v.userPitch = ((e.clientY - r.top) / r.height - .5) * 1.2; });
    wrap.addEventListener('pointerleave', () => { v.userYaw = 0; v.userPitch = 0; });
    views.push(v); return v;
  }
  function label(v, text, anchor, at) {
    const el = document.createElement('div'); el.className = 'l3d'; el.textContent = text; v.wrap.appendChild(el);
    const a = new T.Vector3(...anchor), p = new T.Vector3(...(at || anchor));
    if (at) v.scene.add(new T.Line(new T.BufferGeometry().setFromPoints([a, p]), new T.LineBasicMaterial({ color: 0x9fb4c4, transparent: true, opacity: .7 })));
    v.labels.push({ el, p });
  }
  function rays(v, R, glassP) {
    if (v.rayGroup) v.scene.remove(v.rayGroup);
    const g = new T.Group(), elems = [];
    if (glassP) elems.push({ x: GLASS_X, P: glassP }); elems.push({ x: LENS_X, P: PE });
    let res;
    for (const a of ANG) {
      res = trace(.3, 0, X0, elems, R - .03);
      g.add(glowRay(res.pts.map(([x, h]) => v3(x, h, a))));
      if (res.xf > R && res.xf < R + 1.5) g.add(glowRay([v3(R - .03, res.yEnd, a), v3(res.xf, 0, a)], C.ray, true));
    }
    if (Math.abs(res.xf - R) < .05) { const d = dot(C.hit); d.position.x = R - .04; g.add(d); }
    else {
      const m = dot(C.miss); m.position.x = res.xf; g.add(m);
      const disc = new T.Mesh(new T.CircleGeometry(Math.abs(res.yEnd), 40), new T.MeshBasicMaterial({ color: C.miss, transparent: true, opacity: .55, side: T.DoubleSide, depthWrite: false }));
      disc.rotation.y = Math.PI / 2; disc.position.x = R - .06; g.add(disc);
    }
    v.scene.add(g); v.rayGroup = g;
  }
  const glassPower = R => { const L = R - LENS_X, d = LENS_X - GLASS_X, k = 1 - PE * L; return k / (L + d * k); };

  /* Folie 2: Aufbau */
  (() => {
    const v = mount($('#anatomy'), { center: [-.3, 0, 0], dist: 5.1, elev: 1, yaw: .42, fov: 32 }); if (!v) return;
    const eye = makeEye(2); v.scene.add(eye.group);
    [['Hornhaut', [-1.08, .25, 0], [-1.8, 1.05, 0]], ['Iris', [-.84, .32, 0], [-1.15, 1.45, 0]], ['Pupille', [-.84, 0, 0], [-2, -.35, 0]],
     ['Linse', [-.68, -.2, 0], [-1.25, -1.25, 0]], ['Ziliarmuskel', [-.68, -.38, 0], [-.35, -1.55, 0]], ['Glaskörper', [.15, .35, -.2]],
     ['Netzhaut', [.72, .62, -.1], [1.15, 1.35, 0]], ['Gelber Fleck', [.96, 0, 0], [1.75, .55, 0]], ['Blinder Fleck', [.97, -.16, 0], [1.55, -.75, 0]],
     ['Sehnerv', [1.5, -.16, 0], [2.05, -1.2, 0]], ['Lederhaut', [.15, -.99, -.05], [.75, -1.5, 0]]].forEach(l => label(v, ...l));
    const ph = dot(0xffffff, .05); ph.visible = false; v.scene.add(ph);
    const trail = tube([new T.Vector3(X0, 0, 0), new T.Vector3(.96, 0, 0)], C.ray, .01, .35); trail.visible = false; v.scene.add(trail);
    let t0 = -1;
    const go = () => { t0 = performance.now(); ph.visible = true; trail.visible = true; };
    $('#photonBtn').addEventListener('click', go);
    new MutationObserver(() => { if (v.slide.classList.contains('active')) setTimeout(go, 900); }).observe(v.slide, { attributes: true, attributeFilter: ['class'] });
    v.update = () => { if (t0 < 0) return; const k = Math.min(1, (performance.now() - t0) / 3200); ph.position.x = X0 + k * (.96 - X0); };
  })();

  /* Folie 3: Akkommodation */
  (() => {
    const v = mount($('#accom'), { center: [-.9, 0, 0], dist: 4.5, elev: .7, yaw: .3, amp: .22 }); if (!v) return;
    const eye = makeEye(2); v.scene.add(eye.group);
    const src = dot(C.ray, .06); src.position.x = -2.4; v.scene.add(src);
    let near = null, cur = .45;
    const build = () => {
      const n = $('#nearBtn').className === 'btn'; if (n === near) return; near = n; src.visible = n;
      if (v.rayGroup) v.scene.remove(v.rayGroup); const g = new T.Group();
      for (const a of ANG) {
        const r = n ? trace(0, .25 / (LENS_X + 2.4), -2.4, [{ x: LENS_X, P: PE + 1 / (LENS_X + 2.4) }], .97) : trace(.25, 0, X0, [{ x: LENS_X, P: PE }], .97);
        g.add(glowRay(r.pts.map(([x, h]) => v3(x, h, a))));
      }
      const d = dot(C.hit); d.position.x = .96; g.add(d); v.scene.add(g); v.rayGroup = g;
    };
    build(); new MutationObserver(build).observe($('#accomTxt'), { childList: true, subtree: true, characterData: true });
    v.update = () => { const target = near ? .8 : .42; cur += (target - cur) * .08; eye.lens.scale.x = cur; const s = near ? .84 : 1; eye.cil.scale.y += (s - eye.cil.scale.y) * .08; eye.cil.scale.x = eye.cil.scale.y; };
  })();

  /* Folie 4: umgekehrtes Bild */
  (() => {
    const v = mount($('#invert'), { center: [-.9, 0, 0], dist: 5.3, elev: .6, yaw: .45 }); if (!v) return;
    v.scene.add(makeEye(2).group);
    const tree = (s) => { const g = new T.Group(); const trunk = new T.Mesh(new T.CylinderGeometry(.06, .08, .5, 12), new T.MeshStandardMaterial({ color: 0x8a5a2b })); trunk.position.y = .25;
      const crown = new T.Mesh(new T.ConeGeometry(.35, .8, 20), new T.MeshStandardMaterial({ color: 0x3fae5a, roughness: .6 })); crown.position.y = .85; g.add(trunk, crown); g.scale.setScalar(s); return g; };
    const obj = tree(1); obj.position.set(-3, -.45, 0); v.scene.add(obj);
    const img = tree(.707); img.scale.y = -.707; img.position.set(.84, .318, 0); v.scene.add(img);
    const top = new T.Vector3(-3, .8, 0), bot = new T.Vector3(-3, -.45, 0), c = new T.Vector3(LENS_X, 0, 0);
    const end = p => c.clone().add(c.clone().sub(p).multiplyScalar(1.64 / 2.32));
    v.scene.add(glowRay([top, c, end(top)])); v.scene.add(glowRay([bot, c, end(bot)], C.glass));
  })();

  /* Folie 5: drei Augen */
  $$('.rd').forEach(svg => { const R = +svg.dataset.r === 365 ? 1 : +svg.dataset.r > 365 ? 1.35 : .7; const v = mount(svg, { center: [-1, 0, 0], dist: 4.6, elev: .7, yaw: .35, amp: .25 }); if (!v) return; v.scene.add(makeEye(R + 1).group); rays(v, R, 0); });

  /* Folie 7: Brille */
  $$('.cd').forEach(svg => {
    const R = +svg.dataset.r > 365 ? 1.35 : .7, P = glassPower(R);
    const v = mount(svg, { center: [-1.05, 0, 0], dist: 5.2, elev: .7, yaw: .4, amp: .25 }); if (!v) return;
    v.scene.add(makeEye(R + 1).group);
    const gl = lensMesh(P > 0 ? 3 : -3, .6, .06); gl.position.x = GLASS_X; v.scene.add(gl);
    let on = null, k = 0;
    const sync = () => { const o = $('#glassBtn').textContent.includes('absetzen'); if (o === on) return; on = o; rays(v, R, o ? P : 0); };
    sync(); new MutationObserver(sync).observe($('#glassBtn'), { childList: true, characterData: true, subtree: true });
    v.update = () => { k += ((on ? 1 : 0) - k) * .12; gl.position.y = (1 - k) * 2.6; gl.rotation.y = (1 - k) * 2.5; gl.visible = k > .02; };
  });

  /* Folie 6: Glasblock + Linse mit Regler */
  (() => {
    const v = mount($('#refr'), { center: [0, .2, 0], dist: 5.2, elev: .9, yaw: .5, amp: .3, fov: 34 }); if (!v) return;
    const box = new T.Mesh(new T.BoxGeometry(1.2, 1.7, .9), glassMat(.35)); box.position.x = .3; v.scene.add(box);
    v.scene.add(new T.LineSegments(new T.EdgesGeometry(box.geometry), new T.LineBasicMaterial({ color: C.glass })).translateX(.3));
    const ta = Math.tan(35 * Math.PI / 180), tb = Math.tan(Math.asin(Math.sin(35 * Math.PI / 180) / 1.5)), V = (x, y) => new T.Vector3(x, y, 0);
    const hit = V(-.3, .4), out = V(.9, .4 - 1.2 * tb);
    v.scene.add(glowRay([V(-2, .4 + 1.7 * ta), hit, out, V(2, out.y - 1.1 * ta)]));
    v.scene.add(new T.Line(new T.BufferGeometry().setFromPoints([V(-1.1, .4), V(.5, .4)]), new T.LineDashedMaterial({ color: 0x9fb4c4, dashSize: .08, gapSize: .06 })).computeLineDistances());
    label(v, 'Luft', [-1.6, -.6, 0]); label(v, 'Glas', [.3, -.6, .46]); label(v, 'Lot', [-1.05, .55, 0]);
  })();
  (() => {
    const v = mount($('#dioSvg'), { center: [0, 0, 0], dist: 5.8, elev: .9, yaw: .5, amp: .3 }); if (!v) return;
    let lens = null, D0 = null;
    const build = () => {
      const D = +$('#dio').value; if (D === D0) return; D0 = D;
      if (lens) v.scene.remove(lens); lens = lensMesh(D, .9, .05); v.scene.add(lens);
      if (v.rayGroup) v.scene.remove(v.rayGroup); const g = new T.Group(), P = D * .13;
      for (const [h, as] of [[.6, ANG], [.3, ANG.filter((_, i) => i % 2)]]) for (const a of as) {
        const r = trace(h, 0, -3.2, [{ x: 0, P }], 3.2);
        g.add(glowRay(r.pts.map(([x, y]) => v3(x, y, a))));
        if (D < 0 && r.xf > -3.4) g.add(glowRay([v3(0, h, a), v3(r.xf, 0, a)], C.ray, true));
      }
      if (D !== 0) { const f = 1 / P; if (Math.abs(f) < 3.3) { const d = dot(D > 0 ? C.hit : C.miss); d.position.x = f; g.add(d); } }
      v.scene.add(g); v.rayGroup = g;
    };
    build(); $('#dio').addEventListener('input', build);
  })();

  /* ---------- render loop: only the visible slide ---------- */
  const tmp = new T.Vector3();
  function frame(now) {
    const t = now / 1000;
    for (const v of views) {
      if (!v.slide.classList.contains('active') && v.drawn) continue;
      v.update(t);
      const yaw = v.yaw + Math.sin(t * .35 + v.phase) * v.amp + v.userYaw, pitch = v.elev + v.userPitch * 1.5;
      v.camera.position.set(v.center.x + v.dist * Math.sin(yaw), v.center.y + pitch, v.center.z + v.dist * Math.cos(yaw));
      v.camera.lookAt(v.center);
      if (v.rayGroup) stepPulses(v.rayGroup, t); v.scene.children.forEach(c => stepPulses(c, t));
      v.renderer.render(v.scene, v.camera); v.drawn = true;
      for (const l of v.labels) { tmp.copy(l.p).project(v.camera); l.el.style.left = ((tmp.x + 1) / 2 * v.W) + 'px'; l.el.style.top = ((1 - tmp.y) / 2 * v.H) + 'px'; }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
