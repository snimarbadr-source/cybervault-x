/* CyberVault X — مقدمة سينمائية مدتها 5 ثوانٍ بالضبط
   0.0s  جسيمات تتجمع حول الدرع + مسح ليزر + رسم الدرع
   0.3s  كتابة العنوان بتأثير فك التشفير
   4.0s  ACCESS GRANTED (تتحول الألوان للأخضر)
   4.1s  المحتوى يتمدد ويتلاشى
   4.2s  وميض + بوابة الخزنة تنفتح من المنتصف
   5.0s  تختفي المقدمة بالكامل ويظهر الموقع
*/
(function () {
  var intro = document.getElementById('intro');
  if (!intro) return;

  var T_OPEN = 4200, T_END = 5000;
  var t0 = performance.now();
  var canvas = document.getElementById('intro-canvas');
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);
  var raf = 0, done = false;

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  /* ---------- الجسيمات ---------- */
  var N = W < 600 ? 70 : 120, P = [];
  function ease(t) { return 1 - Math.pow(1 - t, 3); }
  for (var i = 0; i < N; i++) {
    var a = (i / N) * Math.PI * 2;
    var edge = Math.random() * Math.PI * 2, far = Math.max(W, H) * (0.7 + Math.random() * 0.5);
    P.push({
      a: a,
      sx: W / 2 + Math.cos(edge) * far,
      sy: H / 2 + Math.sin(edge) * far,
      r: 2 + Math.random() * 1.8,
      layer: Math.random() < 0.5 ? 0 : 1,
      delay: Math.random() * 0.6,
      hue: Math.random() < 0.6 ? 190 : 265,
      x: 0, y: 0
    });
  }

  function draw(now) {
    if (done) return;
    var t = (now - t0) / 1000;
    ctx.clearRect(0, 0, W, H);
    var cx = W / 2, cy = H / 2 - 18;
    var base = Math.min(W, H) * 0.2 + 60;           // نصف قطر الحلقة
    var granted = t > 4.0;

    for (var i = 0; i < P.length; i++) {
      var p = P[i];
      var k = Math.min(1, Math.max(0, (t - p.delay) / 1.4));
      var e = ease(k);
      var spin = t * (p.layer ? 0.55 : -0.35);
      var rad = base * (p.layer ? 1 : 1.45) * (1 + Math.sin(t * 2 + i) * 0.03);
      var tx = cx + Math.cos(p.a + spin) * rad;
      var ty = cy + Math.sin(p.a + spin) * rad;
      p.x = p.sx + (tx - p.sx) * e;
      p.y = p.sy + (ty - p.sy) * e;
    }

    // خطوط الربط
    var maxD = W < 600 ? 62 : 84;
    ctx.lineWidth = 1;
    for (var a = 0; a < P.length; a++) {
      for (var b = a + 1; b < P.length; b++) {
        var dx = P[a].x - P[b].x, dy = P[a].y - P[b].y, d = dx * dx + dy * dy;
        if (d < maxD * maxD) {
          var al = (1 - Math.sqrt(d) / maxD) * 0.45;
          ctx.strokeStyle = granted ? 'rgba(52,211,153,' + al + ')' : 'rgba(34,211,238,' + al + ')';
          ctx.beginPath(); ctx.moveTo(P[a].x, P[a].y); ctx.lineTo(P[b].x, P[b].y); ctx.stroke();
        }
      }
    }
    // النقاط
    for (var j = 0; j < P.length; j++) {
      var q = P[j];
      ctx.beginPath();
      ctx.fillStyle = granted ? 'rgba(110,231,183,.95)' : 'hsla(' + q.hue + ',95%,68%,.95)';
      ctx.shadowColor = granted ? '#34d399' : 'hsl(' + q.hue + ',95%,60%)';
      ctx.shadowBlur = 10;
      ctx.arc(q.x, q.y, q.r, 0, 6.2832);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // عدّاد ونسبة التقدم
    var pr = Math.min(1, Math.max(0, (t - 0.2) / 3.7));
    var eased = 1 - Math.pow(1 - pr, 2.2);
    var ring = document.getElementById('ring-fg');
    if (ring) ring.style.strokeDashoffset = (452.4 * (1 - eased)).toFixed(1);
    var pct = document.getElementById('pct');
    if (pct) pct.textContent = Math.round(eased * 100) + '%';

    raf = requestAnimationFrame(draw);
  }
  raf = requestAnimationFrame(draw);

  /* ---------- العنوان: فك تشفير حرفاً حرفاً ---------- */
  var title = document.getElementById('intro-title');
  var CH = '01ABCDEF#$%&@<>/\\{}[]';
  function decode(el, text, ms) {
    var start = performance.now();
    (function tick(now) {
      var k = Math.min(1, (now - start) / ms), n = Math.floor(k * text.length), out = '';
      for (var i = 0; i < text.length; i++) {
        out += text[i] === ' ' ? ' ' : (i < n ? text[i] : CH[Math.floor(Math.random() * CH.length)]);
      }
      el.textContent = out;
      if (k < 1 && !done) requestAnimationFrame(tick); else el.textContent = text;
    })(start);
  }
  setTimeout(function () { decode(title, 'CYBERVAULT X', 1500); }, 350);

  /* ---------- رسائل الحالة ---------- */
  var status = document.getElementById('intro-status');
  function say(msg) { status.textContent = '[ ' + msg + ' ]'; }
  setTimeout(function () { say('جاري فحص بصمة التشفير...'); }, 1400);
  setTimeout(function () { say('فك تشفير الخزنة...'); }, 2600);
  setTimeout(function () { intro.classList.add('granted'); say('تم التحقق — أهلاً بك يا أحمد'); }, 4000);

  /* ---------- الخروج الدرامي ---------- */
  setTimeout(function () { intro.classList.add('fade-content'); }, 4100);
  setTimeout(function () {
    intro.classList.add('open');
    document.body.classList.add('site-reveal');
    if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) {} }
  }, T_OPEN);

  function finish() {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    if (intro.parentNode) intro.parentNode.removeChild(intro);
    document.body.classList.remove('intro-lock');
    setTimeout(function () { document.body.classList.remove('site-reveal'); }, 1100);
  }
  setTimeout(finish, T_END + 50);
})();
