export async function mount(root) { root.innerHTML = '<main id="content" tabindex="-1"></main>'; return { outlet: root.firstElementChild, destroy() {} }; }
