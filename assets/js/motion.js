const REVEAL_SELECTOR = [
  '.card',
  '.stat-card',
  '.alert-card',
  '.list-item',
  '.quick-actions > a',
  '.planning-hero',
  '.finance-hero',
  '.credit-card',
  '.section-title',
  '.advanced-filters',
  '.shared-wallet-card',
].join(',');

const TILT_SELECTOR = '.card, .stat-card, .quick-actions > a, .planning-hero, .finance-hero';
const INTERACTIVE_SELECTOR = '.btn, .fab, .tabs button, .planning-tabs button, .bottom-nav a, .quick-actions > a';

let initialized = false;

function createAmbientScene() {
  if (document.querySelector('.ambient-scene')) return;

  const scene = document.createElement('div');
  scene.className = 'ambient-scene';
  scene.setAttribute('aria-hidden', 'true');
  scene.innerHTML = `
    <div class="ambient-parallax">
      <span class="ambient-orb ambient-orb-a"></span>
      <span class="ambient-orb ambient-orb-b"></span>
      <span class="ambient-orb ambient-orb-c"></span>
      <span class="ambient-streak"></span>
      <div class="ambient-particles"></div>
    </div>
  `;

  const particles = scene.querySelector('.ambient-particles');
  for (let index = 0; index < 14; index += 1) {
    const particle = document.createElement('i');
    particle.style.setProperty('--particle-x', `${(index * 37 + 11) % 100}%`);
    particle.style.setProperty('--particle-y', `${(index * 61 + 17) % 100}%`);
    particle.style.setProperty('--particle-delay', `${-(index % 7) * 1.35}s`);
    particle.style.setProperty('--particle-duration', `${8 + (index % 6) * 1.4}s`);
    particles.appendChild(particle);
  }

  document.body.prepend(scene);
}

function setupPointerScene(reduceMotion) {
  if (reduceMotion || !matchMedia('(pointer: fine)').matches) return;

  let frame = 0;
  let targetX = window.innerWidth * 0.72;
  let targetY = window.innerHeight * 0.24;

  const paint = () => {
    frame = 0;
    const normalizedX = targetX / Math.max(1, window.innerWidth) - 0.5;
    const normalizedY = targetY / Math.max(1, window.innerHeight) - 0.5;
    document.documentElement.style.setProperty('--pointer-x', `${targetX}px`);
    document.documentElement.style.setProperty('--pointer-y', `${targetY}px`);
    document.documentElement.style.setProperty('--scene-x', `${normalizedX * 18}px`);
    document.documentElement.style.setProperty('--scene-y', `${normalizedY * 14}px`);
  };

  window.addEventListener('pointermove', (event) => {
    targetX = event.clientX;
    targetY = event.clientY;
    if (!frame) frame = requestAnimationFrame(paint);
  }, { passive: true });

  paint();
}

function setupRevealAnimations(root, reduceMotion) {
  const observer = reduceMotion ? null : new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('motion-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.07, rootMargin: '0px 0px -22px' });

  const scan = (scope) => {
    const elements = [];
    if (scope.nodeType === 1 && scope.matches?.(REVEAL_SELECTOR)) elements.push(scope);
    scope.querySelectorAll?.(REVEAL_SELECTOR).forEach((element) => elements.push(element));

    elements.forEach((element, index) => {
      if (element.dataset.motionReady) return;
      element.dataset.motionReady = 'true';
      element.style.setProperty('--motion-delay', `${Math.min(index % 8, 7) * 42}ms`);
      if (reduceMotion) {
        element.classList.add('motion-visible');
      } else {
        element.classList.add('motion-reveal');
        observer.observe(element);
      }
    });
  };

  scan(root);
  const mutations = new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach((node) => {
      if (node.nodeType === 1) scan(node);
    }));
  });
  mutations.observe(root, { childList: true, subtree: true });
}

function setupTilt(root, reduceMotion) {
  if (reduceMotion || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const bind = (element) => {
    if (element.dataset.tiltReady) return;
    element.dataset.tiltReady = 'true';
    element.classList.add('motion-tilt');

    let frame = 0;
    let pointerX = 0;
    let pointerY = 0;
    const paint = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const x = (pointerX - rect.left) / Math.max(rect.width, 1) - 0.5;
      const y = (pointerY - rect.top) / Math.max(rect.height, 1) - 0.5;
      element.style.setProperty('--tilt-y', `${x * 2.4}deg`);
      element.style.setProperty('--tilt-x', `${y * -2.1}deg`);
      element.style.setProperty('--shine-x', `${(x + 0.5) * 100}%`);
      element.style.setProperty('--shine-y', `${(y + 0.5) * 100}%`);
    };

    element.addEventListener('pointermove', (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
    });
    element.addEventListener('pointerleave', () => {
      element.style.setProperty('--tilt-x', '0deg');
      element.style.setProperty('--tilt-y', '0deg');
      element.style.setProperty('--shine-x', '50%');
      element.style.setProperty('--shine-y', '50%');
    });
  };

  root.querySelectorAll(TILT_SELECTOR).forEach(bind);
  new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach((node) => {
      if (node.nodeType !== 1) return;
      if (node.matches?.(TILT_SELECTOR)) bind(node);
      node.querySelectorAll?.(TILT_SELECTOR).forEach(bind);
    }));
  }).observe(root, { childList: true, subtree: true });
}

function setupRipples(reduceMotion) {
  if (reduceMotion) return;
  document.addEventListener('pointerdown', (event) => {
    const target = event.target.closest?.(INTERACTIVE_SELECTOR);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.6;
    const ripple = document.createElement('span');
    ripple.className = 'motion-ripple';
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
    target.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
  }, { passive: true });
}

function setupScrollEnergy(reduceMotion) {
  if (reduceMotion) return;
  let frame = 0;
  const paint = () => {
    frame = 0;
    document.documentElement.style.setProperty('--page-scroll', `${Math.min(window.scrollY, 900) * -0.025}px`);
    document.body.classList.toggle('has-scrolled', window.scrollY > 16);
  };
  window.addEventListener('scroll', () => {
    if (!frame) frame = requestAnimationFrame(paint);
  }, { passive: true });
  paint();
}

export function initMotion() {
  if (initialized) return;
  initialized = true;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('motion-enabled');
  createAmbientScene();
  setupPointerScene(reduceMotion);
  setupRevealAnimations(document.body, reduceMotion);
  setupTilt(document.body, reduceMotion);
  setupRipples(reduceMotion);
  setupScrollEnergy(reduceMotion);
}
