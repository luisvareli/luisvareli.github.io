/* Scroll reveals, card tilt, and the hero scene. No dependencies. */
(function () {
  var doc = document.documentElement;
  doc.classList.add('js');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- reveal on scroll
  var items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('in'); });
  }

  // ---- cards lean toward the pointer (mouse only)
  if (!reduce && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('.card').forEach(function (card) {
      card.addEventListener('pointermove', function (ev) {
        var r = card.getBoundingClientRect();
        var x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
        card.style.setProperty('--ry', ((x - 0.5) * 5).toFixed(2) + 'deg');
        card.style.setProperty('--rx', ((0.5 - y) * 5).toFixed(2) + 'deg');
        card.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
        card.style.setProperty('--my', (y * 100).toFixed(1) + '%');
      });
      card.addEventListener('pointerleave', function () {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });
  }

  // ---- hero scene: a system being checked, point by point.
  // A sphere of points stands for everything that can be tested. A ring sweeps
  // down it; points it has passed turn green, and a few turn amber: the defects.
  var canvas = document.getElementById('scene');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var small = window.matchMedia('(max-width: 860px)').matches;
  var N = small ? 360 : 620;
  var pts = [];
  var golden = Math.PI * (3 - Math.sqrt(5));
  for (var i = 0; i < N; i++) {
    var y = 1 - (i / (N - 1)) * 2;
    var rad = Math.sqrt(1 - y * y);
    var th = golden * i;
    pts.push({ x: Math.cos(th) * rad, y: y, z: Math.sin(th) * rad, flag: false });
  }
  [0.09, 0.23, 0.37, 0.52, 0.66, 0.81, 0.93].forEach(function (f, k) {
    pts[Math.floor(f * N) + k * 3].flag = true;
  });

  var W = 0, H = 0, dpr = 1;
  function resize() {
    var r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  if ('ResizeObserver' in window) new ResizeObserver(function () { resize(); if (reduce) draw(0); }).observe(canvas);

  var yaw = 0.6, pitch = -0.28, tYaw = 0, tPitch = -0.28, spin = 0;
  var stage = canvas.closest('.stage') || canvas;
  stage.addEventListener('pointermove', function (ev) {
    var r = canvas.getBoundingClientRect();
    tYaw = ((ev.clientX - r.left) / r.width - 0.5) * 1.1;
    tPitch = -0.28 + ((ev.clientY - r.top) / r.height - 0.5) * 0.7;
  });
  stage.addEventListener('pointerleave', function () { tYaw = 0; tPitch = -0.28; });

  function project(p, cy, sy, cp, sp, R, cx, cyy) {
    var x = p.x * cy + p.z * sy, z = -p.x * sy + p.z * cy;
    var y2 = p.y * cp - z * sp, z2 = p.y * sp + z * cp;
    var k = 2.6 / (2.6 - z2);
    return { x: cx + x * R * k, y: cyy - y2 * R * k, z: z2, k: k };
  }

  var CYCLE = 9; // seconds: 6 sweeping down, 3 holding the result
  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    var R = Math.min(W, H) * 0.3, cx = W / 2, cyy = H / 2;
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    var phase = reduce ? CYCLE : (t % CYCLE);
    var scanY = 1.15 - Math.min(phase / 6, 1) * 2.3; // from above the top to below the bottom
    var fade = phase > 8.2 ? 1 - (phase - 8.2) / 0.8 : 1; // checked points dim before the next sweep

    // guide rings
    ctx.lineWidth = 1;
    for (var g = 0; g < 3; g++) {
      ctx.beginPath();
      for (var s = 0; s <= 72; s++) {
        var a = (s / 72) * Math.PI * 2, q;
        if (g === 0) q = { x: Math.cos(a), y: 0, z: Math.sin(a) };
        else if (g === 1) q = { x: Math.cos(a), y: Math.sin(a), z: 0 };
        else q = { x: 0, y: Math.cos(a), z: Math.sin(a) };
        var v = project(q, cy, sy, cp, sp, R * 1.0, cx, cyy);
        if (s === 0) ctx.moveTo(v.x, v.y); else ctx.lineTo(v.x, v.y);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.stroke();
    }

    // points
    for (var i = 0; i < N; i++) {
      var p = pts[i];
      var v2 = project(p, cy, sy, cp, sp, R, cx, cyy);
      var depth = (v2.z + 1) / 2; // 0 back, 1 front
      var checked = p.y > scanY;
      var near = Math.exp(-Math.pow((p.y - scanY) / 0.07, 2));
      var size = (0.9 + depth * 1.7) * v2.k * 0.8;
      var alpha = 0.16 + depth * 0.5;
      var color = '120,140,133';
      if (checked) {
        if (p.flag) { color = '255,180,84'; size *= 1.9; alpha = (0.5 + depth * 0.5) * fade + 0.2 * (1 - fade); }
        else { color = '95,227,168'; alpha = (0.22 + depth * 0.62) * fade + alpha * (1 - fade) * 0.6; }
      }
      if (near > 0.05 && phase < 6.2) { size *= 1 + near * 1.1; alpha = Math.min(1, alpha + near * 0.6); if (!p.flag) color = '190,255,225'; }
      ctx.beginPath();
      ctx.arc(v2.x, v2.y, size, 0, 6.2832);
      ctx.fillStyle = 'rgba(' + color + ',' + alpha.toFixed(3) + ')';
      ctx.fill();
      if (checked && p.flag && depth > 0.35) {
        var pulse = reduce ? 0.5 : (t * 0.9 + i) % 1;
        ctx.beginPath();
        ctx.arc(v2.x, v2.y, size + 3 + pulse * 11, 0, 6.2832);
        ctx.strokeStyle = 'rgba(255,180,84,' + ((1 - pulse) * 0.55 * depth * fade).toFixed(3) + ')';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }

    // scan ring
    if (phase < 6.2 && Math.abs(scanY) < 1) {
      var rr = Math.sqrt(1 - scanY * scanY);
      for (var half = 0; half < 2; half++) {
        ctx.beginPath();
        var started = false;
        for (var s2 = 0; s2 <= 96; s2++) {
          var a2 = (s2 / 96) * Math.PI * 2;
          var v3 = project({ x: Math.cos(a2) * rr, y: scanY, z: Math.sin(a2) * rr }, cy, sy, cp, sp, R * 1.03, cx, cyy);
          var front = v3.z > 0;
          if ((half === 1) === front) { if (!started) { ctx.moveTo(v3.x, v3.y); started = true; } else ctx.lineTo(v3.x, v3.y); }
          else started = false;
        }
        ctx.strokeStyle = half ? 'rgba(160,255,215,0.9)' : 'rgba(160,255,215,0.22)';
        ctx.lineWidth = half ? 1.6 : 1;
        ctx.shadowColor = 'rgba(95,227,168,0.9)';
        ctx.shadowBlur = half ? 14 : 0;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }
  }

  if (reduce) { draw(0); return; }

  var visible = true, last = 0, clock = 0;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }, { threshold: 0.02 }).observe(canvas);
  }
  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) { last = now; return; }
    var dt = Math.min((now - last) / 1000 || 0, 0.05);
    last = now; clock += dt; spin += dt * 0.16;
    yaw += ((spin + tYaw) - yaw) * 0.06;
    pitch += (tPitch - pitch) * 0.06;
    draw(clock);
  }
  requestAnimationFrame(frame);
})();
