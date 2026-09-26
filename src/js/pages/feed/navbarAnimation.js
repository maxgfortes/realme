const navbar = document.querySelector('.navbar-top');
const container = document.querySelector('.welcome-container');

let lastY = 0;
let current = 0;

const START_HIDE_AT = 60;
const MAX = 100;

function clamp(n, min, max) {
return Math.max(min, Math.min(max, n));
}

container.addEventListener('scroll', () => {
const y = container.scrollTop;
const delta = y - lastY;
if (y < START_HIDE_AT) {
    current = 0;
    navbar.classList.remove('hidden');
    navbar.style.transform = 'translateY(0%)';
    lastY = y;
    return;
}

if (delta > 0) {
    current = clamp(current + 18, 0, MAX);
}

if (delta < 0) {
    current = clamp(current - 18, 0, MAX);
}

navbar.classList.add('hidden');
navbar.style.transform = `translateY(-${current}%)`;
if (current <= 0) {
    navbar.classList.remove('hidden');
}
lastY = y;
}, { passive: true });