function enhance() {
  const d = document;
  const root = d.documentElement;
  root.classList.add('js');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const all = (sel, ctx = d) => Array.from(ctx.querySelectorAll(sel));
  let savedTheme = null;
  try {
    savedTheme = localStorage.getItem('theme');
  } catch (e) {
    savedTheme = null;
  }
  if (savedTheme === 'dark' || savedTheme === 'light') root.dataset.theme = savedTheme;

  function scene(el) {
    const kind = el.dataset.scene;
    const canvas = d.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.prepend(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = 0;
    let h = 0;
    let ratio = 1;
    let px = 0;
    let py = 0;
    let visible = true;
    let frame = 0;
    const colour = () => getComputedStyle(el).color || '#888';
    const glow = () => getComputedStyle(el).getPropertyValue('--scene-glow').trim() || colour();
    const size = () => {
      const b = el.getBoundingClientRect();
      ratio = Math.min(devicePixelRatio || 1, 2);
      w = Math.max(1, b.width);
      h = Math.max(1, b.height);
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const count = Math.min(900, Math.max(120, parseInt(el.dataset.density, 10) || 420));
    const sphere = Array.from({ length: count }, (_, i) => {
      const t = Math.acos(1 - (2 * (i + 0.5)) / count);
      const p = Math.PI * (1 + Math.sqrt(5)) * i;
      return [Math.cos(p) * Math.sin(t), Math.sin(p) * Math.sin(t), Math.cos(t)];
    });
    const dots = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.0008, vy: (Math.random() - 0.5) * 0.0008 }));
    const orbs = Array.from({ length: 4 }, (_, i) => ({ a: Math.random() * 6.28, r: 0.18 + i * 0.07, s: 0.0004 + i * 0.00015 }));
    const draw = (time) => {
      ctx.clearRect(0, 0, w, h);
      const c = colour();
      const t = time * 0.001;
      if (kind === 'globe') {
        const r = Math.min(w, h) * 0.38;
        const ry = t * 0.25 + px * 0.6;
        const rx = 0.35 + py * 0.4;
        sphere.forEach(([x, y, z]) => {
          const x1 = x * Math.cos(ry) + z * Math.sin(ry);
          const z1 = -x * Math.sin(ry) + z * Math.cos(ry);
          const y1 = y * Math.cos(rx) - z1 * Math.sin(rx);
          const z2 = y * Math.sin(rx) + z1 * Math.cos(rx);
          const depth = (z2 + 1) / 2;
          ctx.globalAlpha = 0.15 + depth * 0.85;
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(w / 2 + x1 * r, h / 2 + y1 * r, 0.6 + depth * 1.8, 0, 6.283);
          ctx.fill();
        });
      } else if (kind === 'wave') {
        const cols = 46;
        const rows = 22;
        for (let j = 0; j < rows; j++) {
          for (let i = 0; i < cols; i++) {
            const gx = (i / (cols - 1) - 0.5) * 2;
            const gz = j / (rows - 1);
            const y = Math.sin(gx * 3 + t * 1.2 + gz * 4) * 0.12 + Math.cos(gz * 5 - t + px) * 0.08;
            const persp = 1 / (0.6 + gz * 1.6);
            ctx.globalAlpha = 0.2 + (1 - gz) * 0.7;
            ctx.fillStyle = c;
            ctx.beginPath();
            ctx.arc(w / 2 + gx * w * 0.6 * persp, h * 0.55 + (y + 0.25 - gz * 0.1) * h * persp, 1.6 * persp, 0, 6.283);
            ctx.fill();
          }
        }
      } else if (kind === 'constellation') {
        dots.forEach((p) => {
          p.x = (p.x + p.vx + 1) % 1;
          p.y = (p.y + p.vy + 1) % 1;
        });
        ctx.strokeStyle = c;
        ctx.fillStyle = c;
        const near = Math.min(w, h) * 0.18;
        dots.forEach((a, i) => {
          const ax = a.x * w + px * 14;
          const ay = a.y * h + py * 14;
          ctx.globalAlpha = 0.8;
          ctx.beginPath();
          ctx.arc(ax, ay, 1.6, 0, 6.283);
          ctx.fill();
          for (let k = i + 1; k < dots.length; k++) {
            const b = dots[k];
            const dist = Math.hypot(ax - b.x * w - px * 14, ay - b.y * h - py * 14);
            if (dist < near) {
              ctx.globalAlpha = (1 - dist / near) * 0.35;
              ctx.beginPath();
              ctx.moveTo(ax, ay);
              ctx.lineTo(b.x * w + px * 14, b.y * h + py * 14);
              ctx.stroke();
            }
          }
        });
      } else {
        ctx.globalCompositeOperation = 'lighter';
        orbs.forEach((o, i) => {
          o.a += o.s * 16;
          const x = w * (0.5 + Math.cos(o.a + i) * o.r) + px * 30;
          const y = h * (0.5 + Math.sin(o.a * 1.3 + i) * o.r) + py * 30;
          const rad = Math.max(w, h) * (0.28 + i * 0.05);
          const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
          g.addColorStop(0, i % 2 ? glow() : c);
          g.addColorStop(1, 'transparent');
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);
        });
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
    };
    const loop = (time) => {
      frame = 0;
      if (!visible) return;
      draw(time);
      frame = requestAnimationFrame(loop);
    };
    size();
    if ('ResizeObserver' in window) new ResizeObserver(size).observe(el);
    if (still) {
      draw(4000);
      return;
    }
    if (fine) {
      el.addEventListener('pointermove', (e) => {
        const b = el.getBoundingClientRect();
        px = (e.clientX - b.left) / b.width - 0.5;
        py = (e.clientY - b.top) / b.height - 0.5;
      });
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        if (visible && !frame) frame = requestAnimationFrame(loop);
      }).observe(el);
    } else {
      frame = requestAnimationFrame(loop);
    }
  }

  function swarm(el) {
    const canvas = d.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.prepend(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = 1;
    let h = 1;
    let mx = -9999;
    let my = -9999;
    let near = false;
    let visible = true;
    let frame = 0;
    let colours = [];
    const read = () => {
      const s = getComputedStyle(el);
      const ink = s.color || '#fff';
      colours = [ink, s.getPropertyValue('--scene-glow').trim() || ink, s.getPropertyValue('--scene-accent').trim() || ink];
    };
    const size = () => {
      const b = el.getBoundingClientRect();
      const ratio = Math.min(devicePixelRatio || 1, 2);
      w = Math.max(1, b.width);
      h = Math.max(1, b.height);
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const n = Math.min(1400, Math.max(200, parseInt(el.dataset.density, 10) || 1000));
    const parts = Array.from({ length: n }, (_, i) => {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = 0.3 + 0.7 * Math.pow(Math.random(), 0.55);
      const q = Math.sqrt(1 - u * u);
      return { hx: Math.cos(a) * q * r, hy: u * r, hz: Math.sin(a) * q * r, x: Math.random() * w, y: Math.random() * h, vx: 0, vy: 0, s: 1 + Math.random() * 2.4, c: i % 9 === 0 ? 2 : i % 4 === 0 ? 1 : 0 };
    });
    const step = (time, settle) => {
      const t = time * 0.00008;
      const cos = Math.cos(t);
      const sin = Math.sin(t);
      const R = Math.min(w, h) * 0.5;
      const reach = Math.max(120, Math.min(w, h) * 0.28);
      ctx.clearRect(0, 0, w, h);
      parts.forEach((p) => {
        const x3 = p.hx * cos + p.hz * sin;
        const z3 = -p.hx * sin + p.hz * cos;
        const depth = (z3 + 1) / 2;
        const tx = w / 2 + x3 * R * 1.35;
        const ty = h / 2 + p.hy * R;
        if (settle) {
          p.x = tx;
          p.y = ty;
        } else {
          let ax = (tx - p.x) * 0.010;
          let ay = (ty - p.y) * 0.010;
          if (near) {
            const dx = mx - p.x;
            const dy = my - p.y;
            const dist = Math.hypot(dx, dy) || 1;
            if (dist < reach) {
              const f = 1 - dist / reach;
              const pull = dist < 34 ? -1.4 : 0.9;
              ax += (dx / dist) * f * pull - (dy / dist) * f * 0.75;
              ay += (dy / dist) * f * pull + (dx / dist) * f * 0.75;
            }
          }
          p.vx = (p.vx + ax) * 0.88;
          p.vy = (p.vy + ay) * 0.88;
          p.x += p.vx;
          p.y += p.vy;
        }
        ctx.globalAlpha = 0.18 + depth * 0.82;
        ctx.fillStyle = colours[p.c];
        const s = p.s * (0.6 + depth * 0.6);
        ctx.fillRect(p.x, p.y, s, s);
      });
      ctx.globalAlpha = 1;
    };
    read();
    size();
    new MutationObserver(read).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    if ('ResizeObserver' in window) new ResizeObserver(size).observe(el);
    if (still) {
      step(0, true);
      return;
    }
    if (fine) {
      addEventListener('pointermove', (e) => {
        const b = el.getBoundingClientRect();
        mx = e.clientX - b.left;
        my = e.clientY - b.top;
        near = mx > -60 && my > -60 && mx < b.width + 60 && my < b.height + 60;
      }, { passive: true });
    }
    const loop = (time) => {
      frame = 0;
      if (!visible) return;
      step(time, false);
      frame = requestAnimationFrame(loop);
    };
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible && !frame) frame = requestAnimationFrame(loop);
    }).observe(el);
  }

  function liquidGlass() {
    const panes = all('[data-glass]');
    if (!panes.length) return;
    if (fine && /Chrome\//.test(navigator.userAgent) && !d.getElementById('lg-refract')) {
      const ns = 'http://www.w3.org/2000/svg';
      const svg = d.createElementNS(ns, 'svg');
      svg.setAttribute('width', '0');
      svg.setAttribute('height', '0');
      svg.setAttribute('aria-hidden', 'true');
      svg.style.position = 'absolute';
      const filter = d.createElementNS(ns, 'filter');
      filter.id = 'lg-refract';
      filter.setAttribute('color-interpolation-filters', 'sRGB');
      const noise = d.createElementNS(ns, 'feTurbulence');
      noise.setAttribute('type', 'fractalNoise');
      noise.setAttribute('baseFrequency', '0.006 0.009');
      noise.setAttribute('numOctaves', '2');
      noise.setAttribute('seed', '7');
      noise.setAttribute('result', 'noise');
      const soft = d.createElementNS(ns, 'feGaussianBlur');
      soft.setAttribute('in', 'noise');
      soft.setAttribute('stdDeviation', '2');
      soft.setAttribute('result', 'map');
      const bend = d.createElementNS(ns, 'feDisplacementMap');
      bend.setAttribute('in', 'SourceGraphic');
      bend.setAttribute('in2', 'map');
      bend.setAttribute('scale', '28');
      bend.setAttribute('xChannelSelector', 'R');
      bend.setAttribute('yChannelSelector', 'G');
      filter.append(noise, soft, bend);
      svg.append(filter);
      d.body.append(svg);
      root.classList.add('lg-ok');
    }
    if (!fine) return;
    panes.forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const b = el.getBoundingClientRect();
        el.style.setProperty('--gx', `${(((e.clientX - b.left) / b.width) * 100).toFixed(1)}%`);
        el.style.setProperty('--gy', `${(((e.clientY - b.top) / b.height) * 100).toFixed(1)}%`);
      });
      el.addEventListener('pointerleave', () => {
        el.style.removeProperty('--gx');
        el.style.removeProperty('--gy');
      });
    });
  }

  function dock(el) {
    if (!fine || still) return;
    const items = Array.from(el.children);
    el.addEventListener('pointermove', (e) => {
      items.forEach((it) => {
        const b = it.getBoundingClientRect();
        const dist = Math.abs(e.clientX - (b.left + b.width / 2));
        const reach = Math.max(80, b.width * 2.4);
        const s = 1 + 0.5 * Math.max(0, Math.cos((Math.min(1, dist / reach) * Math.PI) / 2));
        it.style.setProperty('--dock', s.toFixed(3));
      });
    });
    el.addEventListener('pointerleave', () => items.forEach((it) => it.style.setProperty('--dock', '1')));
  }

  function highlightWords(el) {
    const walker = d.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) if (walker.currentNode.nodeValue.trim()) nodes.push(walker.currentNode);
    const words = [];
    nodes.forEach((node) => {
      const frag = d.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) return frag.append(part);
        const span = d.createElement('span');
        span.className = 'hw';
        span.textContent = part;
        words.push(span);
        frag.append(span);
      });
      node.replaceWith(frag);
    });
    el.hwWords = words;
    el.hwLit = -1;
    if (still) words.forEach((x) => x.classList.add('lit'));
  }

  function stories(el) {
    const slides = Array.from(el.children).filter((x) => x.hasAttribute('data-slide'));
    if (slides.length < 2) {
      if (slides[0]) slides[0].classList.add('on');
      return;
    }
    const wait = Math.min(12000, Math.max(2500, parseInt(el.dataset.stories, 10) || 5000));
    const bars = d.createElement('div');
    bars.className = 'st-bars';
    bars.setAttribute('aria-hidden', 'true');
    const marks = slides.map(() => bars.appendChild(d.createElement('span')));
    el.append(bars);
    el.style.setProperty('--st-ms', `${wait}ms`);
    const counter = el.querySelector('[data-story-count]');
    const pad = (n) => String(n).padStart(2, '0');
    let i = 0;
    const show = (k) => {
      i = (k + slides.length) % slides.length;
      slides.forEach((x, j) => {
        x.classList.toggle('on', j === i);
        x.setAttribute('aria-hidden', String(j !== i));
      });
      marks.forEach((m, j) => {
        m.classList.toggle('done', j < i);
        m.classList.remove('run');
      });
      if (!still) {
        void marks[i].offsetWidth;
        marks[i].classList.add('run');
      }
      if (counter) counter.textContent = `${pad(i + 1)} / ${pad(slides.length)}`;
    };
    marks.forEach((m) => m.addEventListener('animationend', () => {
      if (m.classList.contains('run')) show(i + 1);
    }));
    el.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      const b = el.getBoundingClientRect();
      show(e.clientX - b.left < b.width / 3 ? i - 1 : i + 1);
    });
    if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
    if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', 'Photo stories, use the arrow keys to move');
    el.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') show(i + 1);
      if (e.key === 'ArrowLeft') show(i - 1);
    });
    const pause = (on) => el.classList.toggle('paused', on);
    el.addEventListener('pointerenter', () => pause(true));
    el.addEventListener('pointerleave', () => pause(false));
    el.addEventListener('focusin', () => pause(true));
    el.addEventListener('focusout', () => pause(false));
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => el.classList.toggle('offscreen', !entries[0].isIntersecting)).observe(el);
    }
    show(0);
  }

  function countUp(el) {
    const target = parseFloat(el.textContent);
    if (!(target > 0) || still) return;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min((now - start) / 900, 1);
      el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    };
    el.textContent = '0';
    requestAnimationFrame(step);
  }

  function splitWords(el) {
    if (el.children.length) return;
    const text = el.textContent.trim();
    el.setAttribute('aria-label', text);
    el.textContent = '';
    text.split(/\s+/).forEach((word, i) => {
      const span = d.createElement('span');
      span.className = 'w';
      span.setAttribute('aria-hidden', 'true');
      span.style.setProperty('--i', i);
      span.textContent = word;
      el.append(span, ' ');
    });
  }

  function run() {
    all('[data-split]').forEach(splitWords);

    const revealables = all('.reveal, .count, [data-split]');
    revealables.forEach((el) => {
      const siblings = el.parentElement ? Array.from(el.parentElement.children).filter((c) => revealables.includes(c)) : [];
      el.style.setProperty('--d', `${Math.min(Math.max(siblings.indexOf(el), 0), 6) * 80}ms`);
    });
    const show = (el) => {
      el.classList.add('in');
      if (el.classList.contains('count')) countUp(el);
    };
    if ('IntersectionObserver' in window && !still) {
      const io = new IntersectionObserver(
        (entries) => entries.forEach((x) => {
          if (x.isIntersecting) {
            show(x.target);
            io.unobserve(x.target);
          }
        }),
        { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
      );
      revealables.forEach((el) => io.observe(el));
    } else {
      revealables.forEach(show);
    }

    all('[data-scene]').forEach((el) => {
      const kind = el.dataset.scene;
      if (kind === 'swarm') swarm(el);
      else scene(el);
    });
    all('[data-stories]').forEach(stories);
    liquidGlass();
    all('[data-dock]').forEach(dock);
    const highlights = all('[data-highlight]');
    highlights.forEach(highlightWords);

    all('[data-theme-toggle]').forEach((btn) => {
      const current = () => root.dataset.theme || getComputedStyle(root).getPropertyValue('--mode').trim() || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const label = () => btn.setAttribute('aria-pressed', String(current() === 'dark'));
      if (!btn.getAttribute('aria-label')) btn.setAttribute('aria-label', 'Dark mode');
      label();
      btn.addEventListener('click', () => {
        const next = current() === 'dark' ? 'light' : 'dark';
        root.classList.add('theme-switching');
        root.dataset.theme = next;
        try {
          localStorage.setItem('theme', next);
        } catch (e) {
          root.dataset.themeUnsaved = 'true';
        }
        label();
        setTimeout(() => root.classList.remove('theme-switching'), 450);
      });
    });

    all('img').forEach((img) => {
      if (img.complete) img.classList.add('loaded');
      else img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
    });

    all('.spot').forEach((el) =>
      el.addEventListener('pointermove', (e) => {
        const b = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - b.left}px`);
        el.style.setProperty('--my', `${e.clientY - b.top}px`);
      })
    );

    if (fine && !still) {
      all('[data-tilt]').forEach((el) => {
        el.addEventListener('pointermove', (e) => {
          const b = el.getBoundingClientRect();
          const x = (e.clientX - b.left) / b.width - 0.5;
          const y = (e.clientY - b.top) / b.height - 0.5;
          el.style.transform = `perspective(900px) rotateX(${(-y * 7).toFixed(2)}deg) rotateY(${(x * 7).toFixed(2)}deg)`;
        });
        el.addEventListener('pointerleave', () => { el.style.transform = ''; });
      });
      all('[data-magnetic]').forEach((el) => {
        el.addEventListener('pointermove', (e) => {
          const b = el.getBoundingClientRect();
          const x = e.clientX - b.left - b.width / 2;
          const y = e.clientY - b.top - b.height / 2;
          el.style.transform = `translate(${(x * 0.18).toFixed(1)}px, ${(y * 0.28).toFixed(1)}px)`;
        });
        el.addEventListener('pointerleave', () => { el.style.transform = ''; });
      });
      addEventListener('pointermove', (e) => {
        root.style.setProperty('--cx', `${e.clientX}px`);
        root.style.setProperty('--cy', `${e.clientY}px`);
      }, { passive: true });
    }

    const nav = d.querySelector('.nav');
    const menu = d.querySelector('[data-menu]');
    if (nav && menu) {
      menu.setAttribute('aria-expanded', 'false');
      menu.addEventListener('click', () => {
        const open = nav.classList.toggle('open');
        menu.setAttribute('aria-expanded', String(open));
      });
      all('a', nav).forEach((a) => a.addEventListener('click', () => {
        nav.classList.remove('open');
        menu.setAttribute('aria-expanded', 'false');
      }));
    }
    if (nav && 'IntersectionObserver' in window) {
      const links = all('a[href^="#"]', nav).filter((a) => a.getAttribute('href').length > 1);
      const spy = new IntersectionObserver(
        (entries) => entries.forEach((x) => {
          if (!x.isIntersecting) return;
          links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${x.target.id}`));
        }),
        { rootMargin: '-45% 0px -50% 0px' }
      );
      links.forEach((a) => {
        const target = d.getElementById(a.getAttribute('href').slice(1));
        if (target) spy.observe(target);
      });
    }

    const parallax = still ? [] : all('[data-speed]');
    const progress = all('[data-progress]');
    const sliders = all('[data-hscroll]');
    const layoutSliders = () => sliders.forEach((box) => {
      const track = box.querySelector('[data-hs-track]') || box.firstElementChild?.firstElementChild;
      const on = Boolean(track) && !still && innerWidth >= 900 && track.scrollWidth > box.clientWidth + 40;
      box.classList.toggle('hs-on', on);
      box.style.height = on ? `${track.scrollWidth - box.clientWidth + innerHeight}px` : '';
      if (!on && track) track.style.transform = '';
    });
    layoutSliders();
    addEventListener('resize', layoutSliders);
    let ticking = false;
    const onScroll = () => {
      ticking = false;
      const max = root.scrollHeight - innerHeight;
      root.style.setProperty('--scroll', max > 0 ? (scrollY / max).toFixed(4) : '0');
      if (nav) nav.classList.toggle('stuck', scrollY > 24);
      if (!still) {
        highlights.forEach((el) => {
          const b = el.getBoundingClientRect();
          const p = Math.min(1, Math.max(0, (innerHeight * 0.88 - b.top) / (b.height + innerHeight * 0.4)));
          const count = Math.round(p * el.hwWords.length * 1.1);
          if (count === el.hwLit) return;
          el.hwLit = count;
          el.hwWords.forEach((x, i) => x.classList.toggle('lit', i < count));
        });
      }
      progress.forEach((el) => {
        const b = el.getBoundingClientRect();
        const p = Math.min(1, Math.max(0, (innerHeight - b.top) / (innerHeight + b.height)));
        el.style.setProperty('--p', p.toFixed(3));
      });
      sliders.forEach((box) => {
        if (!box.classList.contains('hs-on')) return;
        const track = box.querySelector('[data-hs-track]') || box.firstElementChild?.firstElementChild;
        const b = box.getBoundingClientRect();
        const span = box.offsetHeight - innerHeight;
        const p = span > 0 ? Math.min(1, Math.max(0, -b.top / span)) : 0;
        track.style.transform = `translate3d(${(-(track.scrollWidth - box.clientWidth) * p).toFixed(1)}px, 0, 0)`;
      });
      parallax.forEach((el) => {
        const speed = Math.max(-0.5, Math.min(0.5, parseFloat(el.dataset.speed) || 0));
        const b = el.getBoundingClientRect();
        const offset = b.top + b.height / 2 - innerHeight / 2;
        el.style.transform = `translate3d(0, ${(offset * -speed).toFixed(1)}px, 0)`;
      });
    };
    addEventListener('scroll', () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(onScroll);
      }
    }, { passive: true });
    onScroll();

    all('[data-rotate]').forEach((el) => {
      const items = Array.from(el.children);
      if (!items.length) return;
      let i = 0;
      items[0].classList.add('on');
      if (still || items.length < 2) return;
      setInterval(() => {
        items[i].classList.remove('on');
        i = (i + 1) % items.length;
        items[i].classList.add('on');
      }, 2600);
    });

    all('[data-tabs]').forEach((group) => {
      const tabs = all('[data-tab]', group);
      const panels = all('[data-panel]', group);
      const select = (name) => {
        tabs.forEach((t) => {
          const on = t.dataset.tab === name;
          t.classList.toggle('on', on);
          t.setAttribute('aria-selected', String(on));
        });
        panels.forEach((p) => p.classList.toggle('on', p.dataset.panel === name));
      };
      tabs.forEach((t) => {
        t.setAttribute('role', 'tab');
        t.addEventListener('click', () => select(t.dataset.tab));
      });
      if (tabs[0]) select(tabs[0].dataset.tab);
    });

    const cursor = d.querySelector('[data-cursor]');
    if (cursor && fine && !still) {
      root.classList.add('has-cursor');
      let x = -100;
      let y = -100;
      let cx = -100;
      let cy = -100;
      let moving = false;
      let stick = null;
      const place = () => {
        let tx = x;
        let ty = y;
        if (stick) {
          const b = stick.getBoundingClientRect();
          tx += (b.left + b.width / 2 - x) * 0.45;
          ty += (b.top + b.height / 2 - y) * 0.45;
        }
        cx += (tx - cx) * 0.2;
        cy += (ty - cy) * 0.2;
        cursor.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0) translate(-50%, -50%)`;
        moving = Math.abs(tx - cx) > 0.3 || Math.abs(ty - cy) > 0.3;
        if (moving) requestAnimationFrame(place);
      };
      addEventListener('pointermove', (e) => {
        x = e.clientX;
        y = e.clientY;
        const labelled = e.target.closest && e.target.closest('[data-cursor-label]');
        const hit = e.target.closest ? e.target.closest('[data-magnetic], a, button') : null;
        const b = hit ? hit.getBoundingClientRect() : null;
        stick = hit && b.width < 360 && b.height < 140 ? hit : null;
        cursor.classList.toggle('hover', Boolean(hit));
        cursor.classList.toggle('stick', Boolean(stick));
        if (stick) {
          cursor.style.setProperty('--cw', `${Math.round(b.width + 14)}px`);
          cursor.style.setProperty('--ch', `${Math.round(b.height + 14)}px`);
        }
        cursor.classList.toggle('label', Boolean(labelled));
        cursor.setAttribute('data-label', labelled ? labelled.getAttribute('data-cursor-label').slice(0, 14) : '');
        if (!moving) {
          moving = true;
          requestAnimationFrame(place);
        }
      }, { passive: true });
    } else if (cursor) {
      cursor.style.display = 'none';
    }

    const toggle = d.querySelector('[data-sound-toggle]');
    if (toggle) {
      let audio = null;
      let on = false;
      toggle.setAttribute('aria-pressed', 'false');
      if (!toggle.getAttribute('aria-label')) toggle.setAttribute('aria-label', 'Sound');
      const tone = (freq, start, length, volume) => {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audio.currentTime + start);
        gain.gain.setValueAtTime(0.0001, audio.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(volume, audio.currentTime + start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + start + length);
        osc.connect(gain).connect(audio.destination);
        osc.start(audio.currentTime + start);
        osc.stop(audio.currentTime + start + length + 0.02);
      };
      const play = (kind) => {
        if (!on || !audio) return;
        if (kind === 'chime') {
          tone(880, 0, 0.16, 0.05);
          tone(1320, 0.06, 0.18, 0.04);
        } else {
          tone(520, 0, 0.07, 0.04);
        }
      };
      toggle.addEventListener('click', () => {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        audio = audio || new Ctx();
        on = !on;
        if (on && audio.state === 'suspended') audio.resume();
        toggle.setAttribute('aria-pressed', String(on));
        root.classList.toggle('sound-on', on);
        if (on) play('chime');
      });
      d.addEventListener('pointerdown', (e) => {
        const target = e.target.closest && e.target.closest('[data-sound], a, button');
        if (!target || target === toggle || toggle.contains(target)) return;
        play(target.getAttribute('data-sound') || 'click');
      });
    }

    all('[data-carousel]').forEach((box) => {
      const track = box.querySelector('[data-track]') || box.querySelector('.track');
      if (!track) return;
      const move = (dir) => track.scrollBy({ left: dir * track.clientWidth * 0.85, behavior: still ? 'auto' : 'smooth' });
      all('[data-prev]', box).forEach((b) => b.addEventListener('click', () => move(-1)));
      all('[data-next]', box).forEach((b) => b.addEventListener('click', () => move(1)));
    });
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', run);
  else run();
}

export const ENHANCE_SCRIPT = `(${enhance.toString()})();`;
