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

    all('[data-scene]').forEach(scene);

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
      const place = () => {
        cx += (x - cx) * 0.22;
        cy += (y - cy) * 0.22;
        cursor.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0) translate(-50%, -50%)`;
        moving = Math.abs(x - cx) > 0.3 || Math.abs(y - cy) > 0.3;
        if (moving) requestAnimationFrame(place);
      };
      addEventListener('pointermove', (e) => {
        x = e.clientX;
        y = e.clientY;
        const labelled = e.target.closest && e.target.closest('[data-cursor-label]');
        cursor.classList.toggle('hover', Boolean(e.target.closest && e.target.closest('a, button')));
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
