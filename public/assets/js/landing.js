(function () {
  'use strict';

  const PLANS = {
    free: { id: 'free', name: 'Free', monthly: 0, yearly: 0 },
    plus: { id: 'plus', name: 'Plus', monthly: 9, yearly: 7.2 },
    enterprise: { id: 'enterprise', name: 'Enterprise', monthly: null, yearly: null },
  };

  let yearly = false;
  let config = null;

  function toast(msg) {
    let el = document.getElementById('landingToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'landingToast';
      el.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#15181E;border:1px solid #1e293b;padding:12px 18px;border-radius:10px;font-size:13px;z-index:200;transition:opacity .3s';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 3000);
  }

  function priceFor(planId) {
    const p = PLANS[planId];
    if (!p || p.monthly == null) return 'Custom';
    const val = yearly ? p.yearly : p.monthly;
    return val === 0 ? '$0' : '$' + (Number.isInteger(val) ? val : val.toFixed(2).replace(/\.00$/, ''));
  }

  function updatePricing() {
    document.querySelectorAll('[data-plan-price]').forEach((el) => {
      const plan = el.dataset.planPrice;
      const oldVal = el.textContent;
      const newVal = priceFor(plan);
      el.textContent = newVal;
      if (oldVal !== newVal) {
        el.style.transition = 'transform .3s, color .3s';
        el.style.transform = 'scale(1.08)';
        el.style.color = '#3b82f6';
        setTimeout(() => { el.style.transform = ''; el.style.color = ''; }, 300);
      }
    });
    document.querySelectorAll('[data-plan-suffix]').forEach((el) => {
      const plan = el.dataset.planSuffix;
      el.textContent = PLANS[plan]?.monthly == null ? '' : yearly ? '/mo (billed yearly)' : '/mo';
    });
  }

  function openAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.remove('hidden');
  }

  function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.add('hidden');
  }

  function startOAuth(provider) {
    if (!config?.oauth?.[provider]?.enabled) {
      toast(provider.charAt(0).toUpperCase() + provider.slice(1) + ' OAuth is not configured.');
      return;
    }
    if (window.KernelAuth) {
      KernelAuth.startOAuth(provider, 'CUSTOMER');
    } else {
      const state = 'kernel:customer:' + provider + ':' + crypto.randomUUID();
      sessionStorage.setItem('kernel_oauth_state', state);
      location.href = '/api/oauth-start?provider=' + encodeURIComponent(provider) + '&role=customer&state=' + encodeURIComponent(state);
    }
  }

  function choosePlan(planId) {
    sessionStorage.setItem('kernel_selected_plan', planId);
    toast('Plan selected: ' + (PLANS[planId]?.name || planId));
    if (planId === 'enterprise') {
      document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    openAuthModal();
  }

  function initNavScroll() {
    const links = document.querySelectorAll('.nav-link[href^="#"]');
    links.forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const id = a.getAttribute('href').slice(1);
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        links.forEach((l) => l.classList.remove('active'));
        a.classList.add('active');
      });
    });
    const sections = ['features', 'pricing', 'compare', 'reviews', 'contact'];
    window.addEventListener('scroll', () => {
      let current = '';
      sections.forEach((id) => {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 120) current = id;
      });
      links.forEach((l) => {
        l.classList.toggle('active', l.getAttribute('href') === '#' + current);
      });
    });
  }

  function initPricingToggle() {
    const sw = document.getElementById('pricingSwitch');
    if (!sw) return;
    sw.addEventListener('click', () => {
      yearly = !yearly;
      sw.classList.toggle('on', yearly);
      updatePricing();
    });
  }

  function initAuthModal() {
    document.querySelectorAll('[data-auth-open]').forEach((el) => {
      el.addEventListener('click', (e) => { e.preventDefault(); openAuthModal(); });
    });
    document.querySelectorAll('[data-auth-close]').forEach((el) => {
      el.addEventListener('click', closeAuthModal);
    });
    document.querySelectorAll('[data-oauth]').forEach((btn) => {
      btn.addEventListener('click', () => startOAuth(btn.dataset.oauth));
    });
  }

  document.querySelectorAll('[data-choose-plan]').forEach((btn) => {
    btn.addEventListener('click', () => choosePlan(btn.dataset.choosePlan));
  });

  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      toast('Message sent! We will reply within 24 hours.');
      contactForm.reset();
    });
  }

  fetch('/api/config').then((r) => r.json()).then((d) => { config = d; }).catch(() => {});

  initNavScroll();
  initPricingToggle();
  initAuthModal();
  updatePricing();
})();
