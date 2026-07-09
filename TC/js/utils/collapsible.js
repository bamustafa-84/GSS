/**
 * GSS – Collapsible fieldset legends (Panel 1 · registration)
 * ------------------------------------------------------------------
 * Turns each fieldset <legend> into a collapse/expand toggle for its
 * body. A chevron is injected and rotated to indicate the state.
 * Exposes window.GSSCollapsible.expand(fieldset) so other scripts
 * (e.g. validation) can reveal a collapsed section when needed.
 */
(() => {
  'use strict';

  const bodyOf = (fieldset, legend) =>
    Array.prototype.filter.call(fieldset.children, (el) => el !== legend);

  const setCollapsed = (legend, body, chevron, collapsed) => {
    body.forEach((el) => el.classList.toggle('hidden', collapsed));
    if (chevron) chevron.classList.toggle('-rotate-90', collapsed);
    legend.setAttribute('aria-expanded', String(!collapsed));
  };

  const makeChevron = () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.classList.add('h-3.5', 'w-3.5', 'shrink-0', 'transition-transform', 'duration-200');
    svg.innerHTML = '<polyline points="6 9 12 15 18 9"></polyline>';
    return svg;
  };

  const initCollapsibleLegends = () => {
    const panel = document.getElementById('panel-registration');
    if (!panel) return;

    panel.querySelectorAll('fieldset').forEach((fieldset) => {
      const legend = fieldset.querySelector(':scope > legend');
      if (!legend || legend.dataset.collapsibleReady) return;

      const body = bodyOf(fieldset, legend);
      if (!body.length) return;
      legend.dataset.collapsibleReady = 'true';

      // Make the legend behave like a toggle button.
      legend.classList.add('cursor-pointer', 'select-none');
      legend.setAttribute('role', 'button');
      legend.setAttribute('tabindex', '0');
      legend.setAttribute('aria-expanded', 'true');

      const chevron = makeChevron();
      legend.appendChild(chevron);

      const toggle = () => {
        const collapsed = legend.getAttribute('aria-expanded') === 'true';
        setCollapsed(legend, body, chevron, collapsed);
      };

      legend.addEventListener('click', toggle);
      legend.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggle();
        }
      });
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCollapsibleLegends);
  } else {
    initCollapsibleLegends();
  }

  window.GSSCollapsible = {
    init: initCollapsibleLegends,
    // Expand a fieldset if it is currently collapsed.
    expand(fieldset) {
      if (!fieldset) return;
      const legend = fieldset.querySelector(':scope > legend');
      if (legend && legend.getAttribute('aria-expanded') === 'false') {
        legend.click();
      }
    }
  };
})();
