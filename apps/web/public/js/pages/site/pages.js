// Shared building blocks for inner public pages.
import { html, render } from '../../lib/dom.js';
import { revealOnScroll, tilt, stagger } from '../../lib/motion.js';

export function pageHero(eyebrow, title, lede) {
  return html`<header class="page-hero"><span class="eyebrow reveal">${eyebrow}</span><h1 data-split>${title}</h1><p class="reveal">${lede}</p></header>`;
}
export function finish(root) {
  revealOnScroll(root); tilt(root);
  stagger(root.querySelectorAll('.page-hero .eyebrow, .page-hero p'), [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 900, each: 200, delay: 150 });
}
export function mountPage(root, tpl) { render(root, tpl); finish(root); }
