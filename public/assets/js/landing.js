/* ═══════════════════════════════════════════
   PHANTOM TV — Landing Page JS
   ═══════════════════════════════════════════ */

// ─── NAV SCROLL ────────────────────────────
const nav = document.getElementById('mainNav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 50);
}, { passive: true });

// ─── PARTICLE CANVAS ───────────────────────
const canvas = document.getElementById('particleCanvas');
if (canvas) {
  const ctx = canvas.getContext('2d');
  let particles = [];
  let animId;

  function resize() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  function createParticles() {
    particles = [];
    const count = Math.floor((canvas.width * canvas.height) / 15000);
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.5 + 0.5,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        opacity: Math.random() * 0.5 + 0.1,
        color: Math.random() > 0.7 ? '#00d4ff' : '#7c6ff7'
      });
    }
  }

  function drawParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color + Math.floor(p.opacity * 255).toString(16).padStart(2, '0');
      ctx.fill();

      // Connect nearby particles
      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const dist = Math.hypot(p.x - q.x, p.y - q.y);
        if (dist < 100) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = `rgba(124,111,247,${0.08 * (1 - dist / 100)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }

      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
    });
    animId = requestAnimationFrame(drawParticles);
  }

  resize();
  createParticles();
  drawParticles();

  const ro = new ResizeObserver(() => { resize(); createParticles(); });
  ro.observe(canvas.parentElement);
}

// ─── CHANNEL SCROLL ────────────────────────
const demoChannels = [
  { name: 'France 24', emoji: '🇫🇷' },
  { name: 'Al Jazeera', emoji: '🌍' },
  { name: 'BBC World', emoji: '🇬🇧' },
  { name: 'CNN', emoji: '🇺🇸' },
  { name: 'Eurosport', emoji: '⚽' },
  { name: 'Discovery', emoji: '🔭' },
  { name: 'NASA TV', emoji: '🚀' },
  { name: 'Bloomberg', emoji: '📈' },
  { name: 'Euronews', emoji: '🇪🇺' },
  { name: 'CGTN', emoji: '🇨🇳' },
  { name: 'RT France', emoji: '🌐' },
  { name: 'MTV', emoji: '🎵' },
  { name: 'National Geo', emoji: '🌿' },
  { name: 'History', emoji: '🏛️' },
  { name: 'Cartoon Net.', emoji: '🧸' },
  { name: 'Disney+', emoji: '✨' },
];

const scrollEl = document.getElementById('channelScroll');
if (scrollEl) {
  // Duplicate for infinite scroll effect
  const allChannels = [...demoChannels, ...demoChannels];
  scrollEl.innerHTML = allChannels.map(ch => `
    <div class="scroll-channel-card">
      <div class="scroll-ch-logo">${ch.emoji}</div>
      <div class="scroll-ch-name">${ch.name}</div>
    </div>
  `).join('');
}

// ─── INTERSECTION OBSERVER (animations) ────
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.animationPlayState = 'running';
      entry.target.classList.add('visible');
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.feature-card, .pricing-card').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(20px)';
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  observer.observe(el);
});

// Trigger when visible
new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.1 }).observe(document.querySelector('.features-section') || document.body);

// Re-do with stagger
document.querySelectorAll('.feature-card').forEach((card, i) => {
  card.style.transitionDelay = `${i * 80}ms`;
});

const ioStagger = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.querySelectorAll('.feature-card, .pricing-card').forEach(el => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      });
    }
  });
}, { threshold: 0.05 });
document.querySelectorAll('.features-section, .pricing-section').forEach(s => ioStagger.observe(s));

// ─── MOBILE NAV ────────────────────────────
const burger = document.getElementById('navBurger');
if (burger) {
  burger.addEventListener('click', () => {
    const navLinks = document.querySelector('.nav-links');
    navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
    navLinks.style.flexDirection = 'column';
    navLinks.style.position = 'fixed';
    navLinks.style.top = '68px';
    navLinks.style.left = '0'; navLinks.style.right = '0';
    navLinks.style.background = 'var(--bg-base)';
    navLinks.style.padding = '16px 32px';
    navLinks.style.borderBottom = '1px solid var(--border)';
  });
}

// ─── REDIRECT IF LOGGED IN ─────────────────
if (Auth.isLoggedIn()) {
  // Add dashboard link to nav cta
  const cta = document.querySelector('.nav-cta');
  if (cta) {
    cta.innerHTML = `
      <a href="/dashboard" class="btn btn-primary btn-sm">Mon Dashboard →</a>
    `;
  }
}
