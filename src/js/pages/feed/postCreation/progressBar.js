const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');

export function showProgress(percent = 100) {
  progressBar.classList.add('active');
  progressFill.style.width = `${percent}%`;
}

export function hideProgress() {
  progressBar.classList.remove('active');
  progressFill.style.width = '0%';
}