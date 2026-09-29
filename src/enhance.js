function enhance() {
  const d = document;
  const root = d.documentElement;
  root.classList.add('js');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const all = (sel, ctx = d) => Array.from(ctx.querySelectorAll(sel));

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
    let ticking = false;
    const onScroll = () => {
      ticking = false;
      const max = root.scrollHeight - innerHeight;
      root.style.setProperty('--scroll', max > 0 ? (scrollY / max).toFixed(4) : '0');
      if (nav) nav.classList.toggle('stuck', scrollY > 24);
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
