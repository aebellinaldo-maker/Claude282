/* cinema.js – the continuous 3D film behind the slides of "Das Auge und die Brille".
   One hero object (a glossy eye) that turns, slices open and explodes; a swarm of chrome cubes that assembles into
   shapes; neon light rays; a neon chain; bloom, colour worlds per slide and transition VFX (zoom blur, chroma,
   glitch, light orb). Without WebGL the page keeps its 2D version. Ray physics = the same paraxial model as 2D. */
(() => {
  'use strict';
  const T = window.THREE;
  if (!T) return;
  let renderer;
  try { renderer = new T.WebGLRenderer({ antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' }); } catch (e) { return; }
  if (!renderer.getContext()) return;

  const PI = Math.PI, TAU = PI * 2;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isGL2 = renderer.capabilities.isWebGL2;
  const C = h => new T.Color(h).convertSRGBToLinear();
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  document.documentElement.classList.add('webgl');
  const canvas = renderer.domElement; canvas.id = 'cinema'; canvas.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(canvas, document.body.firstChild);
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = .82;
  renderer.outputEncoding = T.sRGBEncoding; renderer.localClippingEnabled = true;

  /* ---------- camera: the 1280x720 stage maps exactly onto the z=0 plane ---------- */
  const FOV = 35, CZ = 10, TAN = Math.tan(FOV / 2 * PI / 180), SH = 2 * CZ * TAN, SW = SH * 16 / 9;
  const P = (px, py, z = 0) => new T.Vector3((px / 1280 - .5) * SW, (.5 - py / 720) * SH, z);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(FOV, 16 / 9, .1, 200); camera.position.set(0, 0, CZ);
  let VW = 1, VH = 1, SC = 1, DPR = Math.min(2, window.devicePixelRatio || 1);

  /* ---------- render targets + post (bloom, zoom blur, chroma, glitch, flash, vignette, grain) ---------- */
  const rtP = { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, encoding: T.sRGBEncoding };
  const rtMain = (isGL2 && T.WebGLMultisampleRenderTarget) ? new T.WebGLMultisampleRenderTarget(4, 4, rtP) : new T.WebGLRenderTarget(4, 4, rtP);
  rtMain.texture.encoding = T.sRGBEncoding;
  const mkRT = () => new T.WebGLRenderTarget(4, 4, { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, depthBuffer: false, stencilBuffer: false });
  const LV = [[mkRT(), mkRT()], [mkRT(), mkRT()], [mkRT(), mkRT()]];
  const VS = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
  const postCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), postScene = new T.Scene();
  const quad = new T.Mesh(new T.PlaneBufferGeometry(2, 2)); quad.frustumCulled = false; postScene.add(quad);
  const shader = (uniforms, fs) => new T.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false });
  const UB = { tDiffuse: { value: null }, uTh: { value: .86 } };
  const UL = { tDiffuse: { value: null }, uDir: { value: new T.Vector2() } };
  const UC = {
    tMain: { value: rtMain.texture }, tB1: { value: LV[0][0].texture }, tB2: { value: LV[1][0].texture }, tB3: { value: LV[2][0].texture },
    uBloom: { value: .72 }, uZoom: { value: 0 }, uChroma: { value: 0 }, uFlash: { value: 0 }, uFlashCol: { value: new T.Color(1, 1, 1) },
    uGlitch: { value: 0 }, uBlack: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 16 / 9 }, uCenter: { value: new T.Vector2(.5, .5) }
  };
  const brightMat = shader(UB, `uniform sampler2D tDiffuse;uniform float uTh;varying vec2 vUv;
    void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;float l=max(c.r,max(c.g,c.b));gl_FragColor=vec4(c*smoothstep(uTh,uTh+.18,l),1.0);}`);
  const blurMat = shader(UL, `uniform sampler2D tDiffuse;uniform vec2 uDir;varying vec2 vUv;
    void main(){vec3 s=texture2D(tDiffuse,vUv).rgb*.227027;
    s+=texture2D(tDiffuse,vUv+uDir*1.3846).rgb*.316216;s+=texture2D(tDiffuse,vUv-uDir*1.3846).rgb*.316216;
    s+=texture2D(tDiffuse,vUv+uDir*3.2308).rgb*.07027;s+=texture2D(tDiffuse,vUv-uDir*3.2308).rgb*.07027;
    gl_FragColor=vec4(s,1.0);}`);
  const compMat = shader(UC, `uniform sampler2D tMain,tB1,tB2,tB3;uniform float uBloom,uZoom,uChroma,uFlash,uGlitch,uBlack,uTime,uAspect;
    uniform vec3 uFlashCol;uniform vec2 uCenter;varying vec2 vUv;
    float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
    void main(){
      vec2 uv=vUv;
      if(uGlitch>.001){float band=floor(uv.y*26.0);float tt=floor(uTime*24.0);if(hash(vec2(band,tt))>1.0-uGlitch*.55)uv.x+=(hash(vec2(band,tt+7.0))-.5)*.14*uGlitch;}
      vec2 d=uv-uCenter;vec3 col;
      if(uChroma>.0001){col=vec3(texture2D(tMain,uv+d*uChroma*7.0).r,texture2D(tMain,uv).g,texture2D(tMain,uv-d*uChroma*7.0).b);}
      else col=texture2D(tMain,uv).rgb;
      if(uZoom>.001){vec3 acc=col;for(int i=1;i<12;i++){float t=float(i)/12.0;acc+=texture2D(tMain,uv-d*t*uZoom*.32).rgb;}col=acc/12.0;}
      col+=(texture2D(tB1,uv).rgb*.85+texture2D(tB2,uv).rgb*1.1+texture2D(tB3,uv).rgb*1.45)*uBloom;
      vec2 q=vUv-.5;q.x*=uAspect;col*=mix(1.0,smoothstep(1.1,.25,length(q)),.6);
      col+=uFlashCol*uFlash;col=mix(col,vec3(0.0),uBlack);
      col+=(hash(vUv*vec2(1733.0,977.0)+fract(uTime*.37))-.5)*.028;
      gl_FragColor=vec4(col,1.0);}`);
  function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(postScene, postCam); }
  function render() {
    renderer.setRenderTarget(rtMain); renderer.render(scene, camera);
    UB.tDiffuse.value = rtMain.texture; pass(brightMat, LV[0][0]);
    for (let k = 0; k < 3; k++) {
      const [a, b] = LV[k];
      if (k > 0) { UL.tDiffuse.value = LV[k - 1][0].texture; UL.uDir.value.set(0, 0); pass(blurMat, a); }
      UL.tDiffuse.value = a.texture; UL.uDir.value.set(1.35 / a.width, 0); pass(blurMat, b);
      UL.tDiffuse.value = b.texture; UL.uDir.value.set(0, 1.35 / a.height); pass(blurMat, a);
    }
    pass(compMat, null);
  }

  /* ---------- background: base colour + two soft glows (one follows the hero, like a backlight) ---------- */
  const bgU = { uBase: { value: new T.Color('#02050a') }, uGlow: { value: new T.Color('#000000') }, uGlow2: { value: new T.Color('#000000') },
    uG1: { value: new T.Vector3(.7, .5, .45) }, uG2: { value: new T.Vector3(.15, .15, .6) }, uAspect: { value: 16 / 9 }, uTime: { value: 0 } };
  const bg = new T.Mesh(new T.PlaneBufferGeometry(2, 2), new T.ShaderMaterial({
    uniforms: bgU, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.9999,1.0);}',
    fragmentShader: `uniform vec3 uBase,uGlow,uGlow2,uG1,uG2;uniform float uAspect,uTime;varying vec2 vUv;
      float h(vec2 p){return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5);}
      void main(){vec2 p=vec2(vUv.x*uAspect,vUv.y);
        float g1=exp(-pow(distance(p,vec2(uG1.x*uAspect,uG1.y))/uG1.z,2.0));
        float g2=exp(-pow(distance(p,vec2(uG2.x*uAspect,uG2.y))/uG2.z,2.0));
        vec3 c=uBase+uGlow*g1+uGlow2*g2;c+=(h(vUv*731.0+uTime)-.5)*.008;gl_FragColor=vec4(c,1.0);}`
  }));
  bg.frustumCulled = false; bg.renderOrder = -1e4; scene.add(bg);

  /* ---------- studio environment for glossy reflections ---------- */
  (() => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#2c3743'); gr.addColorStop(.45, '#0b1016'); gr.addColorStop(1, '#030405');
    g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
    const soft = (x, y, w, h, col, a) => { const r = g.createRadialGradient(x, y, 0, x, y, Math.max(w, h)); r.addColorStop(0, col); r.addColorStop(.5, col); r.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = a; g.fillStyle = r; g.beginPath(); g.ellipse(x, y, w, h, 0, 0, TAU); g.fill(); g.globalAlpha = 1; };
    soft(830, 165, 70, 40, '#ffffff', 1); soft(640, 300, 36, 70, '#fff1dc', .8); soft(250, 210, 50, 90, '#9fdcff', .9); soft(470, 110, 130, 24, '#ffffff', .55); soft(1000, 260, 30, 80, '#ffb070', .7);
    const tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding; tex.mapping = T.EquirectangularReflectionMapping;
    const pm = new T.PMREMGenerator(renderer); scene.environment = pm.fromEquirectangular(tex).texture; pm.dispose(); tex.dispose();
  })();
  scene.add(new T.AmbientLight(0xffffff, .16));
  const key = new T.DirectionalLight(C('#ffffff'), 1.15); key.position.set(-4, 5, 7); scene.add(key);
  const fill = new T.DirectionalLight(C('#8fb8ff'), .3); fill.position.set(4, -3, 4); scene.add(fill);
  const rim = new T.PointLight(C('#ff8a3d'), 3, 18, 2); scene.add(rim);

  /* ---------- shared bits ---------- */
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.18, 'rgba(255,255,255,.6)'); r.addColorStop(.45, 'rgba(255,255,255,.15)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new T.CanvasTexture(c); })();
  const col = c => (typeof c === 'string' ? C(c) : c);
  function sprite(color, size, opacity = 1) { const s = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: col(color), transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false })); s.scale.setScalar(size); s.userData.base = size; return s; }
  const glassMat = (op = .32) => new T.MeshPhysicalMaterial({ color: C('#c8f2ff'), roughness: .04, metalness: 0, clearcoat: 1, clearcoatRoughness: .03, transparent: true, opacity: op, envMapIntensity: 1.5, side: T.DoubleSide, depthWrite: false });
  const chromeMat = new T.MeshPhysicalMaterial({ color: C('#15171c'), metalness: 1, roughness: .17, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: 1.9 });
  const rayMat = new T.MeshBasicMaterial({ color: C('#ffc443'), toneMapped: false });
  const rayFaint = new T.MeshBasicMaterial({ color: C('#ffc443'), toneMapped: false, transparent: true, opacity: .35, depthWrite: false });
  const neon = c => new T.MeshBasicMaterial({ color: col(c), toneMapped: false, transparent: true, depthWrite: false });
  const v3 = (x, h, a) => new T.Vector3(x, h * Math.cos(a), h * Math.sin(a));
  const ANG8 = [...Array(8)].map((_, i) => i / 8 * TAU + .2);

  /* ---------- paraxial ray model (identical to the 2D diagrams) ---------- */
  function trace(h, u, x0, elems, xEnd) {
    let x = x0, y = h; const pts = [[x, y]];
    for (const e of elems) { y += u * (e.x - x); x = e.x; pts.push([x, y]); u -= y * e.P; }
    const xf = Math.abs(u) > 1e-9 ? x - y / u : Infinity, yEnd = y + u * (xEnd - x); pts.push([xEnd, yEnd]);
    return { pts, xf, yEnd };
  }
  const LENS = -.68, PE = 1 / (1 - LENS), GX = -1.8;
  const glassPower = R => { const L = R - LENS, d = LENS - GX, k = 1 - PE * L; return k / (L + d * k); };
  function tube(pts, r, mat) {
    const path = new T.CurvePath();
    for (let i = 0; i < pts.length - 1; i++) if (pts[i].distanceToSquared(pts[i + 1]) > 1e-8) path.add(new T.LineCurve3(pts[i], pts[i + 1]));
    const geo = new T.TubeGeometry(path, Math.max(16, pts.length * 18), r, 6, false);
    const m = new T.Mesh(geo, mat); m.userData.n = geo.index ? geo.index.count : geo.attributes.position.count; return m;
  }

  /* a group of neon rays that draws itself, carries light pulses and retracts when killed */
  const bundles = [];
  class Bundle {
    constructor(parent) { this.g = new T.Group(); parent.add(this.g); this.tubes = []; this.pulses = []; this.marks = []; this.p = 0; this.dir = 1; bundles.push(this); }
    ray(pts, r = .018, mat = rayMat, pulse = true) {
      const m = tube(pts, r, mat); m.geometry.setDrawRange(0, 0); this.g.add(m); this.tubes.push(m);
      if (pulse) { const s = sprite('#ffffff', r * 10); const lens = [0]; for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1])); s.userData.path = { pts, lens, off: Math.random() }; s.visible = false; this.g.add(s); this.pulses.push(s); }
    }
    mark(pos, color, size) { const s = sprite(color, size); s.position.copy(pos); s.scale.setScalar(.001); this.g.add(s); this.marks.push(s); return s; }
    add(o) { this.g.add(o); return o; }
    kill() { this.dir = -2.2; }
    update(t, dt) {
      this.p = clamp(this.p + this.dir * dt / .95, -1, 1);
      const e = this.p <= 0 ? 0 : 1 - Math.pow(1 - this.p, 3);
      for (const m of this.tubes) m.geometry.setDrawRange(0, Math.floor(m.userData.n * e / 3) * 3);
      for (const s of this.pulses) {
        const { pts, lens, off } = s.userData.path, L = lens[lens.length - 1], d = ((t * .5 + off) % 1) * L;
        let i = 1; while (i < lens.length - 1 && lens[i] < d) i++;
        s.position.lerpVectors(pts[i - 1], pts[i], clamp((d - lens[i - 1]) / Math.max(1e-6, lens[i] - lens[i - 1]), 0, 1));
        s.visible = e > .97;
      }
      for (const s of this.marks) s.scale.setScalar(Math.max(.001, s.userData.base * e * (1 + .2 * Math.sin(t * 5))));
      this.g.children.forEach(o => { if (o.userData.fadeMat) o.material.opacity = o.userData.op0 * e; });
      if (this.dir < 0 && this.p <= -.05) this.dispose();
    }
    dispose() {
      const k = bundles.indexOf(this); if (k >= 0) bundles.splice(k, 1);
      if (this.g.parent) this.g.parent.remove(this.g);
      this.g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.isSprite || (o.userData && o.userData.ownMat)) o.material.dispose(); });
    }
  }

  /* ---------- the hero: a glossy eye that can turn, slice open and explode ---------- */
  function eyeCanvas() {
    const c = document.createElement('canvas'); c.width = 2048; c.height = 1024; const g = c.getContext('2d');
    let gr = g.createLinearGradient(0, 0, 2048, 0);
    gr.addColorStop(0, '#e3d2c8'); gr.addColorStop(.25, '#efe9e3'); gr.addColorStop(.5, '#e1cfc6'); gr.addColorStop(.75, '#cfae9f'); gr.addColorStop(1, '#e3d2c8');
    g.fillStyle = gr; g.fillRect(0, 0, 2048, 1024);
    gr = g.createLinearGradient(0, 0, 0, 1024); gr.addColorStop(0, 'rgba(190,120,110,.45)'); gr.addColorStop(.3, 'rgba(0,0,0,0)'); gr.addColorStop(.7, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(190,120,110,.45)');
    g.fillStyle = gr; g.fillRect(0, 0, 2048, 1024);
    const ix = 512, iy = 512, IR = 130;
    const vein = (x, y, w, n, a) => {
      g.strokeStyle = `rgba(${150 + Math.random() * 50 | 0},${25 + Math.random() * 25 | 0},${35 + Math.random() * 20 | 0},${a})`; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < n; k++) {
        const dx = ix - x, dy = iy - y, d = Math.hypot(dx, dy); if (d < 235) break;
        x += dx / d * 20 + (Math.random() - .5) * 26; y += dy / d * 20 + (Math.random() - .5) * 26; g.lineTo(x, y);
        if (w > .9 && Math.random() < .15) { g.stroke(); vein(x, y, w * .6, n - k, a * .8); g.lineWidth = w; g.beginPath(); g.moveTo(x, y); }
      }
      g.stroke();
    };
    for (let i = 0; i < 24; i++) vein(40 + Math.random() * 250, 160 + Math.random() * 700, 1.3 + Math.random() * 2, 30, .3 + Math.random() * .3);
    for (let i = 0; i < 24; i++) vein(720 + Math.random() * 280, 160 + Math.random() * 700, 1.3 + Math.random() * 2, 30, .3 + Math.random() * .3);
    for (let i = 0; i < 12; i++) vein(260 + Math.random() * 500, Math.random() < .5 ? 70 + Math.random() * 110 : 840 + Math.random() * 110, 1.1 + Math.random() * 1.5, 30, .25 + Math.random() * .3);
    gr = g.createRadialGradient(ix, iy, IR * .95, ix, iy, IR * 1.4); gr.addColorStop(0, 'rgba(40,52,64,.55)'); gr.addColorStop(1, 'rgba(40,52,64,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(ix, iy, IR * 1.4, 0, TAU); g.fill();
    gr = g.createRadialGradient(ix, iy, 10, ix, iy, IR);
    gr.addColorStop(0, '#2a1d0c'); gr.addColorStop(.3, '#8a6326'); gr.addColorStop(.42, '#2c7aa0'); gr.addColorStop(.72, '#56bde3'); gr.addColorStop(.9, '#1f6788'); gr.addColorStop(1, '#0b2330');
    g.fillStyle = gr; g.beginPath(); g.arc(ix, iy, IR, 0, TAU); g.fill();
    for (let i = 0; i < 1100; i++) {
      const a = Math.random() * TAU, r0 = 40 + Math.random() * 30, r1 = 75 + Math.random() * 55, cc = Math.random(), wob = (Math.random() - .5) * .08, m = (r0 + r1) / 2;
      g.strokeStyle = cc < .15 ? 'rgba(255,196,110,.35)' : cc < .3 ? 'rgba(10,40,55,.45)' : `rgba(${150 + Math.random() * 90 | 0},${225 + Math.random() * 30 | 0},255,${.12 + Math.random() * .28})`;
      g.lineWidth = .5 + Math.random() * 1.3; g.beginPath(); g.moveTo(ix + Math.cos(a) * r0, iy + Math.sin(a) * r0);
      g.quadraticCurveTo(ix + Math.cos(a + wob) * m, iy + Math.sin(a + wob) * m, ix + Math.cos(a) * r1, iy + Math.sin(a) * r1); g.stroke();
    }
    for (let i = 0; i < 40; i++) { const a = Math.random() * TAU, r = 62 + Math.random() * 55; g.fillStyle = 'rgba(8,30,42,.35)'; g.beginPath(); g.ellipse(ix + Math.cos(a) * r, iy + Math.sin(a) * r, 3 + Math.random() * 6, 1.5 + Math.random() * 2.5, a, 0, TAU); g.fill(); }
    g.strokeStyle = 'rgba(255,190,100,.4)'; g.lineWidth = 5; g.beginPath(); g.arc(ix, iy, 64, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(5,18,26,.95)'; g.lineWidth = 9; g.beginPath(); g.arc(ix, iy, IR - 3, 0, TAU); g.stroke();
    return c;
  }
  const cutPlane = new T.Plane(new T.Vector3(0, 0, -1), 99);
  const hero = new T.Group(); scene.add(hero);
  const heroFrame = new T.Group(); scene.add(heroFrame); // unrotated frame for rays: x = optical axis in side view
  const eyeTex = new T.CanvasTexture(eyeCanvas()); eyeTex.encoding = T.sRGBEncoding; eyeTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const pupilU = { value: .05 };
  const eyeMat = new T.MeshPhysicalMaterial({ map: eyeTex, roughness: .34, metalness: 0, clearcoat: .9, clearcoatRoughness: .07, envMapIntensity: 1, clippingPlanes: [cutPlane] });
  eyeMat.onBeforeCompile = sh => {
    sh.uniforms.uPupil = pupilU;
    sh.fragmentShader = 'uniform float uPupil;\n' + sh.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\n{vec2 dd=vec2((vUv.x-.25)*2.0,vUv.y-.5);float pp=1.0-smoothstep(uPupil-.004,uPupil+.003,length(dd));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.002),pp);}');
  };
  hero.add(new T.Mesh(new T.SphereGeometry(1, 96, 64), eyeMat));
  hero.add(new T.Mesh(new T.SphereGeometry(.985, 72, 48), new T.MeshPhysicalMaterial({ color: C('#3a1226'), roughness: .6, side: T.BackSide, clippingPlanes: [cutPlane] })));
  const retGeo = new T.SphereGeometry(.972, 72, 48, 0, TAU, 0, 1.95); retGeo.rotateX(-PI / 2);
  hero.add(new T.Mesh(retGeo, new T.MeshPhysicalMaterial({ color: C('#f08a3a'), emissive: C('#7a2c00'), emissiveIntensity: .35, roughness: .42, clearcoat: .4, side: T.BackSide, clippingPlanes: [cutPlane] })));
  hero.add(new T.Mesh(new T.SphereGeometry(.955, 64, 40), new T.MeshPhysicalMaterial({ color: C('#2a5878'), transparent: true, opacity: .16, roughness: .1, side: T.BackSide, depthWrite: false, clippingPlanes: [cutPlane] })));
  const parts = [];
  const part = (obj, z, ex) => { obj.position.z = z; obj.userData.z0 = z; obj.userData.ex = ex; hero.add(obj); parts.push(obj); return obj; };
  const corGeo = new T.SphereGeometry(.56, 64, 24, 0, TAU, 0, .62); corGeo.rotateX(PI / 2);
  part(new T.Mesh(corGeo, new T.MeshPhysicalMaterial({ color: 0x000000, roughness: .02, clearcoat: 1, clearcoatRoughness: .02, envMapIntensity: 2, transparent: true, blending: T.AdditiveBlending, depthWrite: false })), .5, .7);
  part(new T.Mesh(corGeo, glassMat(.1)), .5, .7);
  let irisR = .156;
  const irisMesh = part(new T.Mesh(new T.RingGeometry(irisR, .4, 72), new T.MeshPhysicalMaterial({ color: C('#2f8fbf'), roughness: .35, clearcoat: .5, emissive: C('#06283a'), side: T.DoubleSide })), .82, .45);
  const lensH = part(new T.Mesh(new T.SphereGeometry(.31, 48, 32), glassMat(.4)), .68, .3); lensH.scale.z = .45;
  const cilH = part(new T.Mesh(new T.TorusGeometry(.42, .055, 16, 72), new T.MeshPhysicalMaterial({ color: C('#d8566a'), roughness: .35, clearcoat: .6 })), .68, .3);
  const zonGeo = new T.BufferGeometry(); { const a = []; for (let i = 0; i < 28; i++) { const t = i / 28 * TAU; a.push(Math.cos(t) * .3, Math.sin(t) * .3, 0, Math.cos(t + .05) * .37, Math.sin(t + .05) * .37, 0); } zonGeo.setAttribute('position', new T.Float32BufferAttribute(a, 3)); }
  part(new T.LineSegments(zonGeo, new T.LineBasicMaterial({ color: C('#cfe6f2'), transparent: true, opacity: .8 })), .68, .3);
  const nervGeo = new T.CylinderGeometry(.11, .13, .9, 24); nervGeo.rotateX(PI / 2); nervGeo.translate(0, -.16, 0);
  part(new T.Mesh(nervGeo, new T.MeshPhysicalMaterial({ color: C('#e8c46a'), roughness: .45, clearcoat: .5 })), -1.4, -.4);
  const foveaS = sprite('#ffc94a', .16); foveaS.position.set(0, 0, -.94); hero.add(foveaS);
  const blindS = new T.Mesh(new T.CircleGeometry(.06, 24), new T.MeshBasicMaterial({ color: 0x050505 })); blindS.position.set(0, -.16, -.95); hero.add(blindS);
  const cutRing = new T.Mesh(new T.TorusGeometry(1, .011, 6, 180), neon('#7fe3ff')); scene.add(cutRing);

  /* ---------- labels with lines (exploded view) ---------- */
  const labelsRoot = document.getElementById('labels'), lineSvg = labelsRoot && labelsRoot.querySelector('svg');
  const LBL = [
    ['Hornhaut (Cornea)', ex => [0, .26, 1.0 + .7 * ex], -40, -118], ['Iris', ex => [0, .36, .82 + .45 * ex], 6, -158],
    ['Pupille', ex => [0, 0, .84 + .45 * ex], -150, 18], ['Linse', ex => [0, -.22, .68 + .3 * ex], -112, 120],
    ['Ziliarmuskel', ex => [0, -.44, .68 + .3 * ex], 8, 150], ['Zonulafasern', ex => [0, .31, .68 + .3 * ex], 70, -176],
    ['Glaskörper', () => [0, .3, 0], 52, -86], ['Netzhaut (Retina)', () => [0, .62, -.72], 92, -112],
    ['Gelber Fleck', () => [0, 0, -.95], 128, -40], ['Blinder Fleck', () => [0, -.16, -.95], 132, 38],
    ['Sehnerv', ex => [0, -.16, -1.6 - .4 * ex], 64, 112], ['Lederhaut (Sklera)', () => [0, -.98, -.25], -24, 118]
  ];
  const lblEls = labelsRoot ? LBL.map(([text], k) => {
    const d = document.createElement('div'); d.className = 'l3d'; d.textContent = text; d.style.transitionDelay = (k * 70) + 'ms'; labelsRoot.appendChild(d);
    const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line'); ln.style.transitionDelay = (k * 70) + 'ms'; lineSvg.appendChild(ln); return { d, ln };
  }) : [];
  const tmpP = new T.Vector3();
  const toStage = v => { tmpP.copy(v).project(camera); const vx = (tmpP.x + 1) / 2 * VW, vy = (1 - tmpP.y) / 2 * VH; return [(vx - VW / 2) / SC + 640, (vy - VH / 2) / SC + 360]; };

  /* ---------- photon on the light path ---------- */
  const ph = { on: false, t0: 0, fired: 0, core: sprite('#ffffff', .3), halo: sprite('#ffc94a', 1.3, .85), trail: [], hist: [] };
  scene.add(ph.core, ph.halo); ph.core.visible = ph.halo.visible = false;
  for (let i = 0; i < 16; i++) { const s = sprite('#ffcf6a', .55 * (1 - i / 16), .55 * (1 - i / 16)); s.visible = false; scene.add(s); ph.trail.push(s); }
  const bursts = []; for (let i = 0; i < 10; i++) { const s = sprite('#ffe2a0', 1); s.visible = false; scene.add(s); bursts.push({ s, t: 9 }); }
  function burstAt(pos, color, size = 1.4) { const b = bursts.reduce((a, x) => (x.t > a.t ? x : a)); b.t = 0; b.s.position.copy(pos); b.s.material.color.copy(C(color)); b.s.userData.base = size; b.s.visible = true; }
  const PH_Z0 = 3.2, PH_Z1 = -.94;
  const photonStops = ex => [1.06 + .7 * ex, .93 + .58 * ex, .82 + .45 * ex, .68 + .3 * ex, 0, -.94];
  function photonStart() { ph.on = true; ph.t0 = performance.now(); ph.fired = 0; ph.hist.length = 0; dispatchEvent(new CustomEvent('cinema:chipreset')); }

  /* ---------- retina close-up: rods and cones, photons raining in ---------- */
  const retinaG = new T.Group(); scene.add(retinaG); retinaG.position.copy(P(905, 470)); retinaG.rotation.x = .6;
  const rodGeo = new T.CylinderGeometry(.026, .032, .5, 8, 1); rodGeo.translate(0, .25, 0);
  const coneGeo = new T.CylinderGeometry(.01, .058, .3, 10, 1); coneGeo.translate(0, .15, 0);
  const recMat = new T.MeshPhysicalMaterial({ color: 0xffffff, roughness: .3, metalness: .15, clearcoat: .6, envMapIntensity: 1 });
  const recPts = [];
  for (let r = -15; r <= 15; r++) for (let q = -24; q <= 24; q++) { const x = q * .115 + (r & 1) * .0575, z = r * .1; if ((x / 2.55) ** 2 + (z / 1.45) ** 2 > 1) continue; recPts.push([x + (Math.random() - .5) * .02, z + (Math.random() - .5) * .02]); }
  const isCone = recPts.map(([x, z]) => (Math.hypot(x, z) < .35 ? Math.random() < .85 : Math.random() < .12));
  const nCones = isCone.filter(Boolean).length;
  const rods = new T.InstancedMesh(rodGeo, recMat, recPts.length - nCones), cones = new T.InstancedMesh(coneGeo, recMat, nCones);
  rods.frustumCulled = cones.frustumCulled = false; retinaG.add(rods, cones);
  const recs = []; const tmpM = new T.Matrix4(), tmpQ = new T.Quaternion(), tmpS = new T.Vector3(), tmpV = new T.Vector3(), tmpE = new T.Euler(), tmpC = new T.Color();
  const rodBase = C('#7a6cc0'), coneCols = [C('#ff5a4a'), C('#48d16a'), C('#4a7dff')];
  { let nr = 0, nc = 0; recPts.forEach(([x, z], k) => {
    if (isCone[k]) { const c = coneCols[(Math.random() * 3) | 0]; tmpM.compose(tmpV.set(x, 0, z), tmpQ.identity(), tmpS.set(1, 1, 1)); cones.setMatrixAt(nc, tmpM); cones.setColorAt(nc, c); recs.push({ m: cones, n: nc++, x, z, top: .3, base: c.clone(), heat: 0 }); }
    else { const h = .85 + Math.random() * .3; tmpM.compose(tmpV.set(x, 0, z), tmpQ.identity(), tmpS.set(1, h, 1)); rods.setMatrixAt(nr, tmpM); rods.setColorAt(nr, rodBase); recs.push({ m: rods, n: nr++, x, z, top: .5 * h, base: rodBase.clone(), heat: 0 }); }
  }); }
  const membrane = new T.Mesh(new T.CircleGeometry(1, 64), new T.MeshPhysicalMaterial({ color: C('#2a0812'), emissive: C('#3a081a'), roughness: .5, clearcoat: .3 }));
  membrane.rotation.x = -PI / 2; membrane.scale.set(2.7, 1.6, 1); retinaG.add(membrane);
  const rain = []; for (let i = 0; i < 30; i++) { const s = sprite('#ffd27a', .2); retinaG.add(s); rain.push({ s, k: Math.random(), rec: recs[(Math.random() * recs.length) | 0], ox: (Math.random() - .5) * 1.2, oz: (Math.random() - .5) * .6, sp: .9 + Math.random() * .7 }); }
  const rflash = []; for (let i = 0; i < 12; i++) { const s = sprite('#ffffff', .5); s.visible = false; retinaG.add(s); rflash.push({ s, t: 9 }); }

  /* ---------- neon chain = optic nerve signal path, brain made of light ---------- */
  const BRAIN = P(1062, 290);
  const linkGeo = new T.TorusGeometry(.12, .028, 10, 30); linkGeo.scale(1.55, 1, 1);
  const chain = new T.InstancedMesh(linkGeo, new T.MeshStandardMaterial({ color: C('#06202c'), emissive: C('#3cc8ff'), emissiveIntensity: 1.6, metalness: .6, roughness: .3, toneMapped: false }), 48);
  chain.count = 0; chain.frustumCulled = false; scene.add(chain);
  const chainPulses = [0, .34, .67].map(o => { const s = sprite('#eafcff', .4); s.userData.o = o; s.userData.last = 0; s.visible = false; scene.add(s); return s; });
  const curve = new T.CatmullRomCurve3([0, 1, 2, 3, 4].map(() => new T.Vector3()));
  let brainFlash = 0;
  function brainAt(u, v, w, side, out) {
    const th = u * TAU, ph = Math.acos(2 * v - 1), wob = 1 + .07 * Math.sin(th * 7) * Math.sin(ph * 6), s = 1.05 * (.9 + .1 * w) * wob;
    const sx = Math.sin(ph) * Math.cos(th);
    return out.set(BRAIN.x + side * .34 + sx * .62 * s * (side * sx < 0 ? .5 : 1), BRAIN.y + Math.cos(ph) * .66 * s, Math.sin(ph) * Math.sin(th) * .88 * s);
  }
  const BP = 420, bpos = new Float32Array(BP * 3);
  for (let i = 0; i < BP; i++) { brainAt(Math.random(), Math.random(), Math.random(), i % 2 ? 1 : -1, tmpV); bpos.set([tmpV.x, tmpV.y, tmpV.z], i * 3); }
  const bgeo = new T.BufferGeometry(); bgeo.setAttribute('position', new T.BufferAttribute(bpos, 3));
  const brainPts = new T.Points(bgeo, new T.PointsMaterial({ size: .2, map: glowTex, color: C('#7fd8ff'), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
  scene.add(brainPts);
  const brainHalo = sprite('#7a4cff', 3.4, 0); brainHalo.position.copy(BRAIN).setZ(-.4); scene.add(brainHalo);

  /* ---------- a tree and its upside-down image ---------- */
  function treeMesh() {
    const g = new T.Group();
    const trunk = new T.Mesh(new T.CylinderGeometry(.07, .1, .6, 16), new T.MeshPhysicalMaterial({ color: C('#7a4a22'), roughness: .5, clearcoat: .4 })); trunk.position.y = .3;
    const crownMat = new T.MeshPhysicalMaterial({ color: C('#2fae5a'), roughness: .35, clearcoat: .7, flatShading: true });
    const crown = new T.Mesh(new T.IcosahedronGeometry(.5, 1), crownMat); crown.position.y = .95; crown.scale.set(1, 1.15, 1);
    const c2 = new T.Mesh(new T.IcosahedronGeometry(.31, 1), crownMat); c2.position.set(.22, 1.35, .05);
    g.add(trunk, crown, c2); return g;
  }
  const treeObj = treeMesh(), treeImg = treeMesh(); scene.add(treeObj, treeImg);
  const TREE_BASE = P(700, 485), TREE_H = 1.66;

  /* ---------- cut-away diagram eyes (slides 5 and 7) ---------- */
  const scleraM = new T.MeshPhysicalMaterial({ color: C('#e9eff4'), roughness: .35, clearcoat: .8, clearcoatRoughness: .1, side: T.DoubleSide });
  const choroidM = new T.MeshPhysicalMaterial({ color: C('#3a1022'), roughness: .6, side: T.DoubleSide });
  const retinaM = new T.MeshPhysicalMaterial({ color: C('#f08a3a'), emissive: C('#5a1e00'), emissiveIntensity: .4, roughness: .45, side: T.DoubleSide });
  const vitM = new T.MeshPhysicalMaterial({ color: C('#2a5878'), transparent: true, opacity: .2, side: T.DoubleSide, depthWrite: false });
  const irisM = new T.MeshPhysicalMaterial({ color: C('#2f8fbf'), roughness: .35, clearcoat: .5, side: T.DoubleSide });
  const cilM = new T.MeshPhysicalMaterial({ color: C('#d8566a'), roughness: .35, clearcoat: .6 });
  const nerveM = new T.MeshPhysicalMaterial({ color: C('#e8c46a'), roughness: .45, clearcoat: .5 });
  const nervX = new T.CylinderGeometry(.09, .1, .6, 20); nervX.rotateZ(PI / 2);
  function makeCutEye(L) {
    const g = new T.Group(), cx = -1 + L / 2, sx = L / 2;
    const half = (r, mat, phiL = PI) => { const m = new T.Mesh(new T.SphereGeometry(r, 64, 40, PI, phiL), mat); m.scale.set(sx, 1, 1); m.position.x = cx; g.add(m); return m; };
    half(1, scleraM); half(.978, choroidM); half(.965, retinaM, PI * .62); half(.95, vitM);
    const cor = new T.Mesh(new T.SphereGeometry(.5, 48, 24, 0, TAU, 0, .95), glassMat(.28)); cor.rotation.z = PI / 2; cor.position.x = -.6; g.add(cor);
    const iris = new T.Mesh(new T.RingGeometry(.15, .42, 64), irisM); iris.rotation.y = PI / 2; iris.position.x = -.84; g.add(iris);
    const lens = new T.Mesh(new T.SphereGeometry(.3, 40, 28), glassMat(.4)); lens.scale.x = .45; lens.position.x = LENS; g.add(lens);
    const cil = new T.Mesh(new T.TorusGeometry(.38, .05, 14, 48), cilM); cil.rotation.y = PI / 2; cil.position.x = LENS; g.add(cil);
    const nerve = new T.Mesh(nervX, nerveM); nerve.position.set(-1 + L + .26, -.16, 0); g.add(nerve);
    const rimL = new T.Mesh(new T.TorusGeometry(1, .012, 6, 140), neon('#7fe3ff')); rimL.scale.set(sx, 1, 1); rimL.position.x = cx; g.add(rimL);
    const fov = sprite('#ffc94a', .13); fov.position.set(-1 + L - .04, 0, 0); g.add(fov);
    scene.add(g); g.visible = false; return { g, L, R: L - 1 };
  }
  function lensGeo(D, R, k) {
    const pts = [], n = 26, e = .03 + Math.max(0, -D) * k, b = D * k, th = r => Math.max(.02, e + b * (1 - (r / R) ** 2));
    for (let i = 0; i <= n; i++) pts.push(new T.Vector2(R * i / n, -th(R * i / n) / 2));
    for (let i = n; i >= 0; i--) pts.push(new T.Vector2(R * i / n, th(R * i / n) / 2));
    const g = new T.LatheGeometry(pts, 64); g.rotateZ(-PI / 2); return g;
  }
  const D5 = [[234, 2], [640, 2.35], [1046, 1.7]].map(([px, L]) => { const e = makeCutEye(L); e.S = .8; e.pos = P(px, 292).add(new T.Vector3(.95 * .8, 0, 0)); return e; });
  const G7 = [[334, 2.35], [946, 1.7]].map(([px, L]) => {
    const e = makeCutEye(L); e.S = .9; e.pos = P(px, 288).add(new T.Vector3(.95 * .9, 0, 0));
    const P7 = glassPower(e.R), gl = new T.Group();
    gl.add(new T.Mesh(lensGeo(P7 > 0 ? 3 : -3, .62, .07), glassMat(.45)));
    const rimG = new T.Mesh(new T.TorusGeometry(.62, .045, 12, 64), chromeMat); rimG.rotation.y = PI / 2; gl.add(rimG);
    const temple = tube([[0, .62], [.4, 1.0], [1.5, 1.18], [2.6, 1.15], [3.0, .8]].map(([x, y]) => new T.Vector3(x, y, 0)), .035, chromeMat);
    gl.add(temple); gl.position.x = GX; gl.visible = false; e.g.add(gl); e.glasses = gl; e.P = P7; return e;
  });

  /* ---------- hero lens (slide 6) ---------- */
  const lensG = new T.Group(); scene.add(lensG); const LENS_POS = P(915, 300); lensG.position.copy(LENS_POS);
  const heroGlass = glassMat(.34);
  const lensMeshH = new T.Mesh(lensGeo(2.5, 1, .055), heroGlass); lensG.add(lensMeshH);
  const lensRim = new T.Mesh(new T.TorusGeometry(1, .016, 8, 120), neon('#9fe6ff')); lensRim.rotation.y = PI / 2; lensG.add(lensRim);
  let lensGeoD = 2.5, lensRaysD = null, lensBundle = null, lensBuiltAt = 0;
  function buildLensRays(D) {
    if (lensBundle) lensBundle.kill();
    const b = new Bundle(lensG), Pw = D / 5.5;
    for (const [h, n] of [[.78, 10], [.52, 8], [.26, 6]]) for (let k = 0; k < n; k++) {
      const a = k / n * TAU + h, r = trace(h, 0, -2.4, [{ x: 0, P: Pw }], 4.6);
      b.ray(r.pts.map(([x, y]) => v3(x, y, a)), .011);
      if (D < 0 && r.xf > -2.4) b.ray([v3(0, h, a), v3(r.xf, 0, a)], .007, rayFaint, false);
    }
    if (D !== 0) { const f = 1 / Pw; if (f > -2.4 && f < 4.6) b.mark(new T.Vector3(f, 0, 0), D > 0 ? '#ffffff' : '#ff6b6b', 1.1); }
    b.p = lensBundle ? .55 : 0; lensBundle = b; lensRaysD = D; lensBuiltAt = performance.now();
  }

  /* ---------- the giant word behind the hero (blur = "unscharf") ---------- */
  const wc = document.createElement('canvas'); wc.width = 2048; wc.height = 512;
  const wtex = new T.CanvasTexture(wc);
  const wU = { map: { value: wtex }, colA: { value: new T.Color() }, colB: { value: new T.Color() }, opacity: { value: 0 }, blur: { value: 0 }, sweep: { value: -1 } };
  const wordMesh = new T.Mesh(new T.PlaneBufferGeometry(15, 3.75), new T.ShaderMaterial({
    uniforms: wU, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `uniform sampler2D map;uniform vec3 colA,colB;uniform float opacity,blur,sweep;varying vec2 vUv;
      void main(){float a=0.0;
        if(blur<.0005)a=texture2D(map,vUv).a;
        else{for(int i=0;i<20;i++){float an=float(i)*2.39996;float r=sqrt((float(i)+.5)/20.0)*blur;a+=texture2D(map,vUv+vec2(cos(an),sin(an)*4.0)*r).a;}a/=20.0;}
        vec3 c=mix(colA,colB,smoothstep(.2,.85,vUv.x));c*=.72+.5*vUv.y;
        c+=exp(-pow((vUv.x-sweep)*7.0,2.0))*.7;
        gl_FragColor=vec4(c,a*opacity);}`
  }));
  wordMesh.renderOrder = -10; scene.add(wordMesh);
  let wordCur = null, wordWant = null, wordOp = 0, sweepT = -1;
  function drawWord(text) {
    const g = wc.getContext('2d'); g.clearRect(0, 0, 2048, 512); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const font = s => `700 ${s}px "Space Grotesk", "Arial Black", system-ui, sans-serif`;
    let fs = 430; g.font = font(fs); const w = g.measureText(text).width; if (w > 1960) { fs *= 1960 / w; g.font = font(fs); }
    g.fillText(text, 1024, 256 + fs * .36); wtex.needsUpdate = true;
  }
  if (document.fonts && document.fonts.load) document.fonts.load('700 100px "Space Grotesk"').then(() => { if (wordCur) drawWord(wordCur); }).catch(() => {});

  /* ---------- the swarm: chrome cubes that assemble into shapes ---------- */
  const N = reduce ? 140 : 440;
  const swarm = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshPhysicalMaterial({ color: 0xffffff, metalness: .9, roughness: .22, clearcoat: .8, clearcoatRoughness: .1, envMapIntensity: 1.6 }), N);
  swarm.frustumCulled = false; scene.add(swarm);
  const sp3 = new Float32Array(N * 3), sv3 = new Float32Array(N * 3), tg3 = new Float32Array(N * 3), rot3 = new Float32Array(N * 3), rv3 = new Float32Array(N * 3);
  const sz = new Float32Array(N), sBase = new Float32Array(N), kk = new Float32Array(N), r1 = new Float32Array(N), r2 = new Float32Array(N), r3 = new Float32Array(N), accF = new Uint8Array(N);
  const dark = C('#2a2f38');
  for (let i = 0; i < N; i++) {
    r1[i] = Math.random(); r2[i] = Math.random(); r3[i] = Math.random(); sBase[i] = .045 + Math.pow(Math.random(), 2.2) * .11; kk[i] = 4 + Math.random() * 7; accF[i] = Math.random() < .18 ? 1 : 0;
    sp3[i * 3] = (r1[i] - .5) * 24; sp3[i * 3 + 1] = (r2[i] - .5) * 14; sp3[i * 3 + 2] = -6 - r3[i] * 8;
    for (let k = 0; k < 3; k++) { rot3[i * 3 + k] = Math.random() * TAU; rv3[i * 3 + k] = (Math.random() - .5) * 1.6; }
    swarm.setColorAt(i, dark);
  }
  swarm.instanceColor.needsUpdate = true;
  const tiltM = new T.Matrix4().makeRotationFromEuler(new T.Euler(1.12, 0, -.38));
  const GL = new T.Vector3(0, .5, -4.6);
  let formation = 'scatter';
  function target(i, t, out) {
    const hp = hero.position, hs = Math.max(.35, S.hs.v);
    switch (formation) {
      case 'orbit': {
        const a = r1[i] * TAU + t * (.1 + r2[i] * .09), b = r2[i] * TAU + t * .4, R = hs * (1.5 + (r3[i] - .5) * .5), tb = hs * .16 * (.3 + r3[i]);
        out.set((R + tb * Math.cos(b)) * Math.cos(a), tb * Math.sin(b), (R + tb * Math.cos(b)) * Math.sin(a)).applyMatrix4(tiltM).add(hp); return;
      }
      case 'shell': {
        const k = i + .5, p = Math.acos(1 - 2 * k / N), th = PI * (1 + Math.sqrt(5)) * k + t * .2, R = hs * (1.75 + .2 * Math.sin(t * .8 + i));
        out.set(R * Math.sin(p) * Math.cos(th), R * Math.cos(p), R * Math.sin(p) * Math.sin(th)).add(hp); return;
      }
      case 'brain': brainAt(r1[i], r2[i], r3[i], i % 2 ? 1 : -1, out); return;
      case 'cloud': {
        const R = 3.4 * Math.cbrt(r3[i]), th = r1[i] * TAU, p = Math.acos(2 * r2[i] - 1);
        out.set(R * Math.sin(p) * Math.cos(th) * 1.6 + Math.sin(t * 7 + i) * .1, .6 + R * .55 * Math.cos(p) + Math.cos(t * 6 + i * 1.3) * .1, -5.5 + R * Math.sin(p) * Math.sin(th)); return;
      }
      case 'halo': {
        const a = r1[i] * TAU + t * .25, R = lensG.scale.x * (1.6 + (r2[i] - .5) * .4);
        out.set(LENS_POS.x + (r3[i] - .5) * .6, LENS_POS.y + R * Math.cos(a), R * Math.sin(a) - .3); return;
      }
      case 'glasses': {
        const q = r1[i]; let x, y, z = (r3[i] - .5) * .25; const j = (r3[i] - .5) * .12;
        if (q < .4) { const a = r2[i] * TAU; x = -1.25 + Math.cos(a) * (1 + j); y = Math.sin(a) * (.78 + j); }
        else if (q < .8) { const a = r2[i] * TAU; x = 1.25 + Math.cos(a) * (1 + j); y = Math.sin(a) * (.78 + j); }
        else if (q < .87) { const k = r2[i]; x = -.25 + k * .5; y = .25 + Math.sin(k * PI) * .12; }
        else { const k = r2[i], side = r3[i] < .5 ? -1 : 1; x = side * (2.25 + k * .15); y = .3 - k * .12; z = -k * 2.6; }
        out.set(GL.x + x * 1.55, GL.y + y * 1.55 + Math.sin(t * .8) * .05, GL.z + z * 1.55); return;
      }
      default: out.set((r1[i] - .5) * 20 + Math.sin(t * .15 + i) * .4, (r2[i] - .5) * 11 + Math.cos(t * .13 + i * .7) * .4, -5 - r3[i] * 9);
    }
  }
  function swarmBurst(power) { for (let i = 0; i < N * 3; i++) sv3[i] += (Math.random() - .5) * power; }

  /* ---------- transition orb ---------- */
  const orb = sprite('#ffd9a0', 1, 1); orb.position.set(0, 0, 4); orb.visible = false; scene.add(orb);

  /* ---------- springs ---------- */
  const sp = (v, k = 4) => ({ v, t: v, k });
  const spv = (x, y, z, k = 3.2) => ({ v: new T.Vector3(x, y, z), t: new T.Vector3(x, y, z), k });
  const spc = (h, k = 2.4) => ({ v: new T.Color(h), t: new T.Color(h), k });
  const S = {
    hp: spv(2.7, 0, 0), hs: sp(1.8, 3), hyaw: sp(0, 3), hpitch: sp(0, 3), cut: sp(0, 2.4), ex: sp(0, 2.2), hvis: sp(0, 2.6), pupil: sp(.05, 4),
    lyaw: sp(0, 3.5), lpitch: sp(0, 3.5), lens: sp(.45, 4), cil: sp(1, 4), labels: sp(0, 4),
    tree: sp(0, 3), retina: sp(0, 3), chain: sp(0, 1.4), brain: sp(0, 1.8),
    d5: [sp(0, 3.2), sp(0, 3.2), sp(0, 3.2)], g7: sp(0, 3.2), glasses: sp(0, 3.6), lensVis: sp(0, 3), D: sp(2.5, 5),
    word: sp(0, 2.6), wordBlur: sp(0, 3), wa: spc('#141e2b'), wb: spc('#ff7a2f'), wp: spv(2.2, .55, -4.5),
    base: spc('#02050a'), glow: spc('#000000', 1.8), glow2: spc('#000000', 1.8), g1: spv(.7, .5, .45, 2.2), g2: spv(.15, .15, .6, 2), accent: spc('#ff6a2a', 2),
    swSize: sp(0, 1.6), camx: sp(0, 2.5), camy: sp(0, 2.5)
  };
  const stepS = (s, dt) => { const a = 1 - Math.exp(-s.k * dt); if (s.v.isVector3) s.v.lerp(s.t, a); else if (s.v.isColor) s.v.lerp(s.t, a); else s.v += (s.t - s.v) * a; };
  function stepAll(o, dt) { for (const k in o) { const s = o[k]; if (Array.isArray(s)) s.forEach(x => stepS(x, dt)); else stepS(s, dt); } }
  const snap = s => { if (s.v.copy) s.v.copy(s.t); else s.v = s.t; };

  /* ---------- colour worlds ---------- */
  const TH = {
    title: { base: '#020408', glow: '#9c4416', glow2: '#0e2f4a', g2: [.16, .16, .55], follow: true, r: .42, accent: '#ff6a2a' },
    aufbau: { base: '#01050a', glow: '#12507a', glow2: '#2a1206', g2: [.85, .85, .45], follow: true, r: .5, accent: '#36c6ff' },
    fokus: { base: '#060302', glow: '#8a3c12', glow2: '#0b2233', g2: [.15, .2, .5], follow: true, r: .44, accent: '#ff8a3d' },
    sehen: { base: '#040209', glow: '#45288a', glow2: '#0b2233', g2: [.2, .85, .5], follow: true, r: .45, accent: '#b391e6' },
    netzhaut: { base: '#06020a', glow: '#6a1a50', glow2: '#1a3a7a', g1: [.7, .4, .5], g2: [.85, .8, .4], r: .5, accent: '#ff7ad1' },
    gehirn: { base: '#01060b', glow: '#135f88', glow2: '#4a1a5a', g1: [.79, .6, .42], g2: [.4, .2, .4], r: .42, accent: '#38c8ff' },
    unscharf: { base: '#0a0203', glow: '#6e0e16', glow2: '#2a0608', g1: [.5, .62, .55], g2: [.5, .05, .6], r: .55, accent: '#ff4a4a' },
    linse: { base: '#01060a', glow: '#0e5a78', glow2: '#062a3a', g1: [.72, .58, .45], g2: [.1, .2, .5], r: .45, accent: '#8fdcf5' },
    brilleAus: { base: '#090203', glow: '#600e14', glow2: '#1a0508', g1: [.5, .62, .55], g2: [.5, .05, .6], r: .55, accent: '#ff4a4a' },
    scharf: { base: '#010805', glow: '#10703f', glow2: '#0b3a5a', g1: [.5, .62, .55], g2: [.5, .05, .6], r: .55, accent: '#4fd18b' },
    klar: { base: '#070502', glow: '#7a5410', glow2: '#0e2f4a', g2: [.2, .2, .5], follow: true, r: .4, accent: '#ffc94a' }
  };

  /* ---------- shots: what the film shows on every slide / fragment ---------- */
  const st = Object.assign({ glasses: false, near: false, bright: false, D: 2.5 }, window.deck || {});
  function SHOT(i, f) {
    switch (i) {
      case 0: return { theme: TH.title, hero: { p: P(955, 365), s: 1.85, vis: 1, look: true, float: true }, word: { text: 'AUGE', p: [2.0, .55, -4.5], op: 1, blur: 0, a: '#3a4f6a', b: '#ff7a2f' }, swarm: 'orbit' };
      case 1: return { theme: TH.aufbau, hero: { p: P(410, 420), s: 1.12, vis: 1, yaw: -PI / 2, cut: 1, ex: .55 }, labels: true, swarm: 'scatter', swarmSize: .7 };
      case 2: return { theme: TH.fokus, hero: { p: P(1015, 318), s: 1.3, vis: 1, yaw: -PI / 2, cut: 1, pupil: st.bright ? .026 : .05 }, lensThick: st.near ? .82 : .44, cil: st.near ? .84 : 1, rays: [st.near ? 'acc-near' : 'acc-far'], swarm: 'scatter', swarmSize: .55 };
      case 3:
        if (f <= 0) return { theme: TH.sehen, hero: { p: P(1090, 380), s: 1, vis: 1, yaw: -PI / 2, cut: 1 }, tree: true, rays: ['tree'], swarm: 'scatter', swarmSize: .5 };
        if (f === 1) return { theme: TH.netzhaut, hero: { vis: 0, yaw: -PI / 2, cut: 1 }, retina: true, swarm: 'scatter', swarmSize: .35 };
        return { theme: TH.gehirn, hero: { p: P(690, 560), s: .55, vis: 1, yaw: -PI / 2, cut: 1 }, chain: true, brain: true, swarm: 'brain' };
      case 4: return { theme: TH.unscharf, hero: { vis: 0 }, d5: [1, f >= 1 ? 1 : 0, f >= 2 ? 1 : 0], rays: ['d5-0', f >= 1 && 'd5-1', f >= 2 && 'd5-2'].filter(Boolean), word: { text: 'UNSCHARF', p: [0, .55, -7], op: .5, blur: .014, a: '#2a0a0e', b: '#ff4a4a' }, swarm: 'cloud', swarmSize: .8 };
      case 5: return { theme: TH.linse, hero: { vis: 0 }, lens: true, swarm: 'halo', swarmSize: .9 };
      case 6: return st.glasses
        ? { theme: TH.scharf, hero: { vis: 0 }, g7: true, glasses: true, rays: ['g7-0-on', 'g7-1-on'], word: { text: 'SCHARF', p: [0, .6, -7], op: .95, blur: 0, a: '#0b2a1d', b: '#4fd18b' }, swarm: 'glasses' }
        : { theme: TH.brilleAus, hero: { vis: 0 }, g7: true, glasses: false, rays: ['g7-0', 'g7-1'], word: { text: 'SCHARF', p: [0, .6, -7], op: .45, blur: .016, a: '#2a0a0e', b: '#ff5a5a' }, swarm: 'cloud', swarmSize: .7 };
      default: return { theme: TH.klar, hero: { p: P(1062, 262), s: 1, vis: 1, look: true, float: true }, swarm: 'shell' };
    }
  }
  const live = {}; let look = false, float = false, follow = false, wantLabels = false;
  function buildRays(key) {
    if (key === 'acc-far' || key === 'acc-near') {
      const b = new Bundle(heroFrame), near = key === 'acc-near';
      for (const a of ANG8) {
        const r = near ? trace(0, .26 / (LENS + 2.3), -2.3, [{ x: LENS, P: PE + 1 / (LENS + 2.3) }], .95) : trace(.26, 0, -2.7, [{ x: LENS, P: PE }], .95);
        b.ray(r.pts.map(([x, y]) => v3(x, y, a)), .013);
      }
      b.mark(new T.Vector3(.94, 0, 0), '#4fd18b', .6); if (near) b.mark(new T.Vector3(-2.3, 0, 0), '#ffc94a', .7);
      return b;
    }
    if (key === 'tree') {
      const hp = S.hp.t, hs = S.hs.t, Lc = new T.Vector3(hp.x + LENS * hs, hp.y, 0), rx = hp.x + .9 * hs;
      const top = TREE_BASE.clone().add(new T.Vector3(0, TREE_H, 0)), bot = TREE_BASE.clone();
      const hit = p => { const k = (rx - Lc.x) / (Lc.x - p.x); return new T.Vector3(rx, Lc.y + (Lc.y - p.y) * k, 0); };
      const b = new Bundle(scene); b.ray([top, Lc, hit(top)], .018); b.ray([bot, Lc, hit(bot)], .018, new T.MeshBasicMaterial({ color: C('#9fe6ff'), toneMapped: false }));
      const it = hit(top), ib = hit(bot), sc = (ib.y - it.y) / TREE_H;
      treeImg.position.set(rx - .22, ib.y, 0); treeImg.userData.sc = sc;
      return b;
    }
    const m = key.match(/^(d5|g7)-(\d)(-on)?$/);
    if (m) {
      const eye = (m[1] === 'd5' ? D5 : G7)[+m[2]], on = !!m[3], R = eye.R, b = new Bundle(eye.g);
      const elems = on ? [{ x: GX, P: eye.P }, { x: LENS, P: PE }] : [{ x: LENS, P: PE }];
      let r;
      for (const a of ANG8) {
        r = trace(.3, 0, -2.9, elems, R - .03);
        b.ray(r.pts.map(([x, y]) => v3(x, y, a)), .013);
        if (r.xf > R + .02 && r.xf < R + 2) b.ray([v3(R - .03, r.yEnd, a), v3(r.xf, 0, a)], .01, rayFaint, false);
      }
      if (Math.abs(r.xf - R) < .05) b.mark(new T.Vector3(R - .04, 0, 0), '#4fd18b', .85);
      else {
        b.mark(new T.Vector3(r.xf, 0, 0), '#ff3b3b', .9);
        const disc = new T.Mesh(new T.CircleGeometry(Math.max(.02, Math.abs(r.yEnd)), 40), new T.MeshBasicMaterial({ color: C('#ff4a4a'), toneMapped: false, transparent: true, opacity: .8, side: T.DoubleSide, depthWrite: false }));
        disc.rotation.y = PI / 2; disc.position.x = R - .07; disc.userData.fadeMat = true; disc.userData.op0 = .8; disc.userData.ownMat = true; b.add(disc);
      }
      if (on) b.p = -.45; // wait until the glasses have landed
      return b;
    }
    return null;
  }
  let shotTimers = [];
  function apply(c) {
    const h = c.hero || { vis: 0 };
    const showHero = h.vis == null ? 1 : h.vis;
    if (showHero > 0 && S.hvis.v < .05) { if (h.p) S.hp.v.copy(h.p); if (h.s != null) S.hs.v = h.s; S.hyaw.v = h.yaw || 0; S.cut.v = h.cut || 0; S.ex.v = h.ex || 0; }
    if (h.p) S.hp.t.copy(h.p); if (h.s != null) S.hs.t = h.s;
    S.hvis.t = showHero; S.hyaw.t = h.yaw || 0; S.hpitch.t = h.pitch || 0; S.cut.t = h.cut || 0; S.ex.t = h.ex || 0; S.pupil.t = h.pupil || .05;
    look = !!h.look; float = !!h.float;
    S.lens.t = c.lensThick || .44; S.cil.t = c.cil || 1;
    wantLabels = !!c.labels; S.labels.t = wantLabels ? 1 : 0;
    S.tree.t = c.tree ? 1 : 0; S.retina.t = c.retina ? 1 : 0; S.chain.t = c.chain ? 1 : 0; S.brain.t = c.brain ? 1 : 0;
    (c.d5 || [0, 0, 0]).forEach((v, k) => { S.d5[k].t = v; }); S.g7.t = c.g7 ? 1 : 0; S.glasses.t = c.glasses ? 1 : 0; S.lensVis.t = c.lens ? 1 : 0;
    wordWant = c.word ? c.word.text : null;
    if (c.word) { wordOp = c.word.op; S.wordBlur.t = c.word.blur || 0; S.wa.t.set(c.word.a); S.wb.t.set(c.word.b); S.wp.t.set(...c.word.p); }
    const th = c.theme; S.base.t.set(th.base); S.glow.t.set(th.glow); S.glow2.t.set(th.glow2); S.accent.t.copy(C(th.accent));
    follow = !!th.follow; if (th.g1) S.g1.t.set(th.g1[0], th.g1[1], th.r); else S.g1.t.z = th.r; S.g2.t.set(...th.g2);
    formation = c.swarm || 'scatter'; S.swSize.t = c.swarmSize == null ? 1 : c.swarmSize;
    const want = new Set(c.rays || []);
    for (const k of Object.keys(live)) if (!want.has(k)) { live[k].kill(); delete live[k]; }
    for (const k of want) if (!live[k]) { const b = buildRays(k); if (b) live[k] = b; }
  }
  let cur = { i: -1, f: 0 };
  function setShot(i, f) {
    shotTimers.forEach(clearTimeout); shotTimers = [];
    const prev = cur; cur = { i, f };
    const c = SHOT(i, f);
    if (prev.i === 3 && prev.f === 0 && i === 3 && f === 1 && !reduce) { // dive into the retina
      apply(Object.assign({}, c, { retina: false, hero: { vis: 1, yaw: -PI / 2, cut: 1 } }));
      const tgt = P(900, 420); S.hs.t = 9; S.hp.t.set(tgt.x - 9 * .95, tgt.y, 0);
      setCenter(900, 420); pulse('zoom', 1.4, 1.1);
      shotTimers.push(setTimeout(() => { pulse('flash', .6, .7, 0, '#ffb07a'); apply(c); S.hvis.v = 0; }, 640));
      return;
    }
    if (prev.i === 3 && prev.f === 1 && i === 3 && f === 2) { pulse('chroma', .006, .9); swarmBurst(5); }
    apply(c);
  }
  function refresh() { apply(SHOT(cur.i, cur.f)); }

  /* ---------- transition effects ---------- */
  const fx = [];
  function pulse(name, amp, dur, delay = 0, color) { if (!reduce) fx.push({ name, amp, dur, t0: performance.now() + delay * 1000, color }); }
  function setCenter(px, py) { UC.uCenter.value.set((VW / 2 + (px - 640) * SC) / VW, 1 - (VH / 2 + (py - 360) * SC) / VH); }
  function onGo({ from, to, dir }) {
    setCenter(640, 360);
    if (dir < 0) { pulse('zoom', .4, .75); pulse('chroma', .004, .7); return; }
    switch (from + '>' + to) {
      case '0>1': pulse('chroma', .009, 1.1); pulse('flash', .18, .7, .1, '#4fb3d9'); swarmBurst(7); break;
      case '1>2': pulse('zoom', .6, .9); break;
      case '2>3': pulse('glitch', .8, .55, .4); pulse('chroma', .01, .8, .35); break;
      case '3>4': pulse('black', .92, 1.35); pulse('orb', 1, 1.35); pulse('flash', .45, .55, .62, '#ffd2a0'); break;
      case '4>5': pulse('glitch', 1, .65); pulse('chroma', .013, .85); swarmBurst(9); break;
      case '5>6': pulse('zoom', .5, .85); pulse('flash', .25, .7, .2, '#ff3b3b'); break;
      case '6>7': swarmBurst(10); pulse('flash', .35, .8, 0, '#ffc94a'); pulse('zoom', .35, .8); break;
      default: pulse('zoom', .45, .8);
    }
  }

  /* ---------- deck events ---------- */
  addEventListener('deck:shot', e => setShot(e.detail.i, e.detail.f));
  addEventListener('deck:go', e => onGo(e.detail));
  addEventListener('deck:glasses', e => {
    st.glasses = e.detail.on; refresh();
    if (st.glasses) { pulse('flash', .5, .8, .55, '#7dffb5'); pulse('zoom', .35, .7, .5); sweepT = performance.now() + 600; swarmBurst(6); }
    else pulse('chroma', .008, .7);
  });
  addEventListener('deck:near', e => { st.near = e.detail.near; refresh(); pulse('zoom', .25, .5); });
  addEventListener('deck:bright', e => { st.bright = e.detail.on; refresh(); if (st.bright) pulse('flash', .35, .6, 0, '#ffffff'); });
  addEventListener('deck:dio', e => { st.D = e.detail.D; S.D.t = e.detail.D; });
  addEventListener('deck:photon', photonStart);

  /* ---------- pointer ---------- */
  const ptr = { x: 0, y: 0, last: -1e9, sx: 0, sy: 0, next: 0 };
  addEventListener('pointermove', e => { ptr.x = e.clientX / VW * 2 - 1; ptr.y = -(e.clientY / VH * 2 - 1); ptr.last = performance.now(); }, { passive: true });

  /* ---------- resize + adaptive quality ---------- */
  function resize() {
    const vv = window.visualViewport;
    VW = Math.max(1, Math.round((vv && vv.width) || innerWidth)); VH = Math.max(1, Math.round((vv && vv.height) || innerHeight));
    SC = Math.min(VW / 1280, VH / 720);
    let d = DPR; const maxPx = 2.4e6; if (VW * VH * d * d > maxPx) d = Math.sqrt(maxPx / (VW * VH));
    renderer.setPixelRatio(d); renderer.setSize(VW, VH, false);
    const pw = Math.max(1, Math.floor(VW * d)), ph2 = Math.max(1, Math.floor(VH * d));
    rtMain.setSize(pw, ph2);
    LV.forEach((pair, k) => { const f = 2 << k; pair.forEach(r => r.setSize(Math.max(1, (pw / f) | 0), Math.max(1, (ph2 / f) | 0))); });
    camera.aspect = VW / VH; camera.fov = 2 * Math.atan(TAN * VH / (720 * SC)) * 180 / PI; camera.updateProjectionMatrix();
    UC.uAspect.value = VW / VH; bgU.uAspect.value = VW / VH;
  }
  addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 300));
  if (window.visualViewport) visualViewport.addEventListener('resize', resize);
  resize();

  /* ---------- per-frame updates ---------- */
  const tA = new T.Vector3(), tB = new T.Vector3(), tT = new T.Vector3(), tN = new T.Vector3(), tBn = new T.Vector3(), tBasis = new T.Matrix4(), Z = new T.Vector3(0, 0, 1);
  function updateHero(t, dt, now) {
    const s = Math.max(1e-4, S.hs.v * S.hvis.v);
    hero.visible = S.hvis.v > .01;
    hero.position.copy(S.hp.v); if (float) hero.position.y += Math.sin(t * .9) * .05 * S.hs.v;
    hero.scale.setScalar(s);
    if (look) {
      tmpP.copy(hero.position).project(camera);
      let tx = ptr.x - tmpP.x, ty = ptr.y - tmpP.y;
      if (now - ptr.last > 2500) { if (now > ptr.next) { ptr.sx = (Math.random() - .5) * 1.2; ptr.sy = (Math.random() - .5) * .7; ptr.next = now + 1200 + Math.random() * 1800; } tx = ptr.sx; ty = ptr.sy; }
      S.lyaw.t = clamp(tx * .75, -.6, .6); S.lpitch.t = clamp(-ty * .6, -.42, .42);
    } else { S.lyaw.t = 0; S.lpitch.t = 0; }
    hero.rotation.set(S.hpitch.v + S.lpitch.v, S.hyaw.v + S.lyaw.v, 0, 'YXZ');
    pupilU.value = S.pupil.v + (look ? Math.sin(t * 1.1) * .004 : 0);
    const cutK = hero.position.z + s * (1.2 - 1.2 * S.cut.v); cutPlane.constant = cutK;
    for (const m of parts) m.position.z = m.userData.z0 + m.userData.ex * S.ex.v;
    lensH.scale.set(1, 1, S.lens.v); cilH.scale.set(S.cil.v, S.cil.v, 1);
    const ir = Math.sin(clamp(S.pupil.v, .015, .1) * PI);
    if (Math.abs(ir - irisR) > .004) { irisMesh.geometry.dispose(); irisMesh.geometry = new T.RingGeometry(ir, .4, 72); irisR = ir; }
    const dz = (cutK - hero.position.z) / s, rr = s * Math.sqrt(Math.max(0, 1 - dz * dz));
    cutRing.position.set(hero.position.x, hero.position.y, cutK); cutRing.scale.setScalar(Math.max(.001, rr));
    cutRing.material.opacity = hero.visible ? clamp(S.cut.v * 5, 0, 1) * (S.cut.v > .97 ? .5 : 1) : 0; cutRing.visible = cutRing.material.opacity > .01;
    rim.position.set(hero.position.x + 1.8 * s, hero.position.y + 1.2 * s, hero.position.z - 2.2 * s);
    const g = S.glow.v, m = Math.max(.001, g.r, g.g, g.b); rim.color.setRGB(g.r / m, g.g / m, g.b / m).convertSRGBToLinear();
    heroFrame.position.copy(hero.position); heroFrame.scale.setScalar(s); heroFrame.visible = hero.visible;
    if (follow && hero.visible) { tmpP.copy(hero.position).project(camera); S.g1.t.x = (tmpP.x + 1) / 2; S.g1.t.y = (tmpP.y + 1) / 2; }
  }
  function updateLabels() {
    if (!labelsRoot) return;
    labelsRoot.classList.toggle('on', wantLabels && S.hvis.v > .9 && S.ex.v > .3);
    if (S.labels.v < .01 && !wantLabels) return;
    hero.updateMatrixWorld();
    LBL.forEach(([, fn, dx, dy], k) => {
      const [x, y] = toStage(tmpV.fromArray(fn(S.ex.v)).applyMatrix4(hero.matrixWorld));
      const { d, ln } = lblEls[k];
      d.style.transform = `translate(${(x + dx).toFixed(1)}px, ${(y + dy).toFixed(1)}px) translate(-50%, -50%)`;
      ln.setAttribute('x1', x.toFixed(1)); ln.setAttribute('y1', y.toFixed(1)); ln.setAttribute('x2', (x + dx * .82).toFixed(1)); ln.setAttribute('y2', (y + dy * .82).toFixed(1));
    });
  }
  function updatePhoton(now) {
    const vis = ph.on; ph.core.visible = ph.halo.visible = vis; ph.trail.forEach(s => { s.visible = vis; });
    if (!vis) return;
    const k = (now - ph.t0) / 3400;
    if (k > 1.25 || cur.i !== 1) { ph.on = false; return; }
    const kk2 = clamp(k, 0, 1), e = kk2 < .5 ? 2 * kk2 * kk2 : 1 - Math.pow(-2 * kk2 + 2, 2) / 2;
    hero.updateMatrixWorld();
    const zNow = PH_Z0 + (PH_Z1 - PH_Z0) * e;
    tmpV.set(0, 0, zNow).applyMatrix4(hero.matrixWorld);
    ph.core.position.copy(tmpV); ph.halo.position.copy(tmpV); ph.halo.scale.setScalar(1.1 + .2 * Math.sin(now / 60));
    ph.hist.unshift(tmpV.clone()); if (ph.hist.length > 40) ph.hist.pop();
    ph.trail.forEach((s, i) => { const h = ph.hist[Math.min(ph.hist.length - 1, i * 2)]; if (h) s.position.copy(h); });
    const stops = photonStops(S.ex.v);
    while (ph.fired < stops.length && zNow <= stops[ph.fired]) {
      tB.set(0, 0, stops[ph.fired]).applyMatrix4(hero.matrixWorld); burstAt(tB, ph.fired === 5 ? '#ffc94a' : '#bfefff', ph.fired === 5 ? 2.2 : 1.2);
      dispatchEvent(new CustomEvent('cinema:chip', { detail: { i: ph.fired } })); ph.fired++;
    }
    if (k >= 1 && ph.fired >= stops.length) { ph.core.visible = false; }
  }
  function updateBursts(dt) { for (const b of bursts) { if (b.t > 1) { b.s.visible = false; continue; } b.t += dt / .55; b.s.scale.setScalar(b.s.userData.base * (.3 + b.t)); b.s.material.opacity = 1 - b.t; } }
  function updateRetina(t, dt) {
    const v = S.retina.v; retinaG.visible = v > .01; if (!retinaG.visible) return;
    retinaG.scale.setScalar(Math.max(.001, v * 1.2)); retinaG.rotation.y = Math.sin(t * .25) * .25;
    for (const d of rain) {
      d.k += dt * .9 * d.sp;
      if (d.k >= 1) {
        d.rec.heat = 1; const f = rflash.reduce((a, x) => (x.t > a.t ? x : a)); f.t = 0; f.s.position.set(d.rec.x, d.rec.top + .05, d.rec.z); f.s.visible = true;
        d.k = 0; d.rec = recs[(Math.random() * recs.length) | 0]; d.ox = (Math.random() - .5) * 1.2; d.oz = (Math.random() - .5) * .6;
      }
      const e = d.k * d.k; d.s.position.set(d.rec.x + d.ox * (1 - e), 2.6 - (2.6 - d.rec.top) * e, d.rec.z + d.oz * (1 - e));
    }
    for (const f of rflash) { if (f.t > 1) { f.s.visible = false; continue; } f.t += dt / .45; f.s.scale.setScalar(.25 + f.t * .7); f.s.material.opacity = 1 - f.t; }
    for (const r of recs) { if (r.heat > .002) { r.heat *= Math.exp(-dt * 2.6); tmpC.copy(r.base).multiplyScalar(1 + r.heat * 6); r.m.setColorAt(r.n, tmpC); r.dirty = true; } else if (r.dirty) { r.m.setColorAt(r.n, r.base); r.dirty = false; } }
    rods.instanceColor.needsUpdate = true; cones.instanceColor.needsUpdate = true;
  }
  function updateChain(t, dt) {
    const v = S.chain.v; chain.visible = v > .01; chainPulses.forEach(s => { s.visible = v > .85; });
    brainFlash *= Math.exp(-dt * 2.5);
    brainPts.material.opacity = S.brain.v * (.6 + brainFlash * .4 + .08 * Math.sin(t * 3));
    brainHalo.visible = S.brain.v > .01; brainHalo.material.opacity = S.brain.v * (.45 + brainFlash * .35);
    brainPts.material.color.copy(C('#7fd8ff')).lerp(C('#ff8ad8'), .5 + .5 * Math.sin(t * .7));
    brainPts.visible = S.brain.v > .01;
    if (!chain.visible) return;
    hero.updateMatrixWorld(); tA.set(0, -.16, -1.86).applyMatrix4(hero.matrixWorld);
    tB.copy(BRAIN).add(tN.set(-.62, -.5, 0));
    const pts = curve.points;
    pts[0].copy(tA); pts[1].copy(tA).add(tN.set(.45, .15 + Math.sin(t * 1.1) * .05, .25));
    pts[2].lerpVectors(tA, tB, .5).add(tN.set(0, -.25 + Math.sin(t * 1.3) * .14, .3 * Math.cos(t * .9)));
    pts[3].copy(tB).add(tN.set(-.45, -.35 + Math.cos(t * 1.2) * .08, .15)); pts[4].copy(tB);
    curve.needsUpdate = true;
    const len = curve.getLength(), n = Math.min(48, Math.floor(len / .25)), shown = Math.floor(n * clamp(v, 0, 1));
    for (let i = 0; i < shown; i++) {
      const u = (i + .5) / n; curve.getPointAt(u, tmpV); curve.getTangentAt(u, tT).normalize();
      tN.crossVectors(Z, tT); if (tN.lengthSq() < 1e-6) tN.set(0, 1, 0); tN.normalize(); tBn.crossVectors(tT, tN);
      if (i % 2) tBasis.makeBasis(tT, tBn, tN.negate()); else tBasis.makeBasis(tT, tN, tBn);
      tmpQ.setFromRotationMatrix(tBasis); tmpM.compose(tmpV, tmpQ, tmpS.setScalar(1)); chain.setMatrixAt(i, tmpM);
    }
    chain.count = shown; chain.instanceMatrix.needsUpdate = true;
    chainPulses.forEach(s => { const u = (t * .3 + s.userData.o) % 1; if (u < s.userData.last) brainFlash = 1; s.userData.last = u; curve.getPointAt(u, s.position); });
  }
  function updateTree() {
    const v = S.tree.v; treeObj.visible = treeImg.visible = v > .01; if (!treeObj.visible) return;
    treeObj.position.copy(TREE_BASE); treeObj.scale.setScalar(Math.max(.001, v)); treeObj.rotation.y += .004;
    treeImg.rotation.y = treeObj.rotation.y; const b = treeImg.userData.sc || 1; treeImg.scale.set(b * v, -b * v, b * v);
  }
  function updateEyes(t) {
    D5.forEach((e, k) => { const v = S.d5[k].v; e.g.visible = v > .01; if (!e.g.visible) return; e.g.position.copy(e.pos); e.g.position.y += Math.sin(t * .8 + k) * .03; e.g.scale.setScalar(e.S * Math.max(.001, v)); e.g.rotation.y = (1 - v) * 1.4 + Math.sin(t * .4 + k) * .12; });
    const v7 = S.g7.v;
    G7.forEach((e, k) => {
      e.g.visible = v7 > .01; if (!e.g.visible) return;
      e.g.position.copy(e.pos); e.g.position.y += Math.sin(t * .8 + k) * .03; e.g.scale.setScalar(e.S * Math.max(.001, v7)); e.g.rotation.y = (1 - v7) * 1.4 + Math.sin(t * .4 + k) * .12;
      const gv = S.glasses.v; e.glasses.visible = gv > .01; e.glasses.position.set(GX, (1 - gv) * 3.2, 0); e.glasses.rotation.z = (1 - gv) * 2.2; e.glasses.scale.setScalar(.4 + .6 * gv);
    });
  }
  function updateLens(t, now) {
    const v = S.lensVis.v; lensG.visible = v > .01;
    if (!lensG.visible) { if (lensBundle && v < .02 && lensBundle.dir > 0) { lensBundle.kill(); lensBundle = null; lensRaysD = null; } return; }
    lensG.scale.setScalar(1.38 * Math.max(.001, v)); lensG.rotation.y = Math.sin(t * .35) * .38; lensG.rotation.x = Math.sin(t * .27) * .07;
    if (Math.abs(S.D.v - lensGeoD) > .02) { lensMeshH.geometry.dispose(); lensMeshH.geometry = lensGeo(S.D.v, 1, .055); lensGeoD = S.D.v; }
    if (S.lensVis.t > 0 && lensRaysD !== S.D.t && now - lensBuiltAt > 140) buildLensRays(S.D.t);
  }
  function updateWord(now) {
    if (wordWant !== wordCur) { S.word.t = 0; if (S.word.v < .02) { wordCur = wordWant; if (wordCur) { drawWord(wordCur); sweepT = now + 300; } } }
    else S.word.t = wordCur ? wordOp : 0;
    wU.opacity.value = S.word.v; wU.blur.value = S.wordBlur.v; wU.colA.value.copy(S.wa.v); wU.colB.value.copy(S.wb.v);
    wordMesh.position.copy(S.wp.v); wordMesh.visible = S.word.v > .005;
    const k = (now - sweepT) / 1100; wU.sweep.value = k >= 0 && k <= 1 ? -.3 + k * 1.6 : -2;
  }
  function updateSwarm(t, dt) {
    const sizeMul = S.swSize.v * (formation === 'scatter' ? .75 : 1);
    for (let i = 0; i < N; i++) {
      const j = i * 3; target(i, t, tmpV); tg3[j] = tmpV.x; tg3[j + 1] = tmpV.y; tg3[j + 2] = tmpV.z;
      const k = kk[i], damp = 2 * Math.sqrt(k) * .62;
      for (let a = 0; a < 3; a++) sv3[j + a] += ((tg3[j + a] - sp3[j + a]) * k - sv3[j + a] * damp) * dt;
      const dx = tg3[j] - sp3[j], dy = tg3[j + 1] - sp3[j + 1], far = Math.min(1, Math.hypot(dx, dy) * .25);
      sv3[j] -= dy * far * .9 * dt; sv3[j + 1] += dx * far * .9 * dt;
      sp3[j] += sv3[j] * dt; sp3[j + 1] += sv3[j + 1] * dt; sp3[j + 2] += sv3[j + 2] * dt;
      for (let a = 0; a < 3; a++) rot3[j + a] += rv3[j + a] * dt * (1 + far * 4);
      sz[i] += (sBase[i] * sizeMul - sz[i]) * Math.min(1, dt * 3);
      tmpE.set(rot3[j], rot3[j + 1], rot3[j + 2]); tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpV.set(sp3[j], sp3[j + 1], sp3[j + 2]), tmpQ, tmpS.setScalar(Math.max(1e-4, sz[i]))); swarm.setMatrixAt(i, tmpM);
    }
    swarm.instanceMatrix.needsUpdate = true;
    if (Math.abs(S.accent.v.r - S.accent.t.r) + Math.abs(S.accent.v.g - S.accent.t.g) + Math.abs(S.accent.v.b - S.accent.t.b) > .002 || !swarm.userData.colored) {
      for (let i = 0; i < N; i++) if (accF[i]) swarm.setColorAt(i, S.accent.v);
      swarm.instanceColor.needsUpdate = true; swarm.userData.colored = true;
    }
  }
  function updateFx(now, t) {
    const o = { zoom: 0, chroma: 0, flash: 0, glitch: 0, black: 0, orb: 0 };
    for (let i = fx.length - 1; i >= 0; i--) {
      const e = fx[i], k = (now - e.t0) / (e.dur * 1000); if (k < 0) continue; if (k >= 1) { fx.splice(i, 1); continue; }
      const v = Math.sin(k * PI); o[e.name] += e.amp * (e.name === 'flash' ? Math.pow(1 - k, 1.5) * 1.6 : v);
      if (e.color && e.name === 'flash') UC.uFlashCol.value.set(e.color);
    }
    UC.uZoom.value = o.zoom; UC.uChroma.value = o.chroma; UC.uFlash.value = Math.min(1, o.flash); UC.uGlitch.value = o.glitch; UC.uBlack.value = Math.min(.96, o.black); UC.uTime.value = t;
    orb.visible = o.orb > .01; if (orb.visible) { orb.scale.setScalar(.5 + o.orb * 11); orb.material.opacity = Math.min(1, o.orb * 1.4); orb.material.color.copy(S.glow.v).convertSRGBToLinear().multiplyScalar(2.5).add(C('#ffd9a0')); }
  }
  function updateTheme(t) {
    bgU.uBase.value.copy(S.base.v); bgU.uGlow.value.copy(S.glow.v); bgU.uGlow2.value.copy(S.glow2.v); bgU.uG1.value.copy(S.g1.v); bgU.uG2.value.copy(S.g2.v); bgU.uTime.value = t;
    S.camx.t = ptr.x * .2; S.camy.t = ptr.y * .11;
    camera.position.set(S.camx.v, S.camy.v, CZ); camera.lookAt(0, 0, 0);
  }

  /* ---------- go ---------- */
  setShot(st.cur || 0, st.frag || 0);
  for (const k in S) { const s = S[k]; if (Array.isArray(s)) s.forEach(snap); else snap(s); }
  S.hvis.v = 0; S.swSize.v = 0; S.word.v = 0;
  if (cur.i === 0 && !reduce) { pulse('flash', .3, 1.2, .2, '#ffb47a'); sweepT = performance.now() + 900; }
  let last = performance.now(), acc = 0, frames = 0;
  function frame(now) {
    const dt = Math.min(.05, Math.max(.001, (now - last) / 1000)); last = now; const t = now / 1000;
    stepAll(S, dt);
    updateTheme(t); updateHero(t, dt, now); updateLabels(); updatePhoton(now); updateBursts(dt); updateRetina(t, dt); updateChain(t, dt);
    updateTree(); updateEyes(t); updateLens(t, now); updateWord(now); updateSwarm(t, dt); updateFx(now, t);
    for (const b of bundles.slice()) b.update(t, dt);
    render();
    acc += dt; frames++;
    if (acc > 2.5) { if (frames / acc < 27 && DPR > .85) { DPR *= .8; resize(); } acc = 0; frames = 0; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
