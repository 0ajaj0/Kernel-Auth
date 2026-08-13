(function () {
  'use strict';

  const PLANS = {
    free: { id: 'free', name: 'Free', monthly: 0, yearly: 0 },
    plus: { id: 'plus', name: 'Plus', monthly: 9, yearly: 7.2 },
    enterprise: { id: 'enterprise', name: 'Enterprise', monthly: null, yearly: null },
  };

  let yearly = false;

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
      el.textContent = priceFor(plan);
    });
    document.querySelectorAll('[data-plan-suffix]').forEach((el) => {
      const plan = el.dataset.planSuffix;
      el.textContent = PLANS[plan]?.monthly == null ? '' : yearly ? '/mo (billed yearly)' : '/mo';
    });
  }

  function choosePlan(planId) {
    sessionStorage.setItem('kernel_selected_plan', planId);
    toast('Plan selected: ' + (PLANS[planId]?.name || planId));
    setTimeout(() => {
      window.location.href = '/dashboard/?plan=' + encodeURIComponent(planId);
    }, 400);
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

  initNavScroll();
  initPricingToggle();
  updatePricing();
})();
