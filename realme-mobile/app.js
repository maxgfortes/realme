const routes = {
  '#feed': 'pages/feed.html',
  '#direct': 'pages/direct-mobile.html',
  '#config': 'pages/config.html',
  '#perfil': 'pages/PF.html',
  '#login': 'pages/login.html',
  '': 'pages/feed.html'
};

async function loadPage(route) {
  const url = routes[route] || routes[''];
  const res = await fetch(url);
  const html = await res.text();
  document.getElementById('app').innerHTML = html;

  // Remove todos os scripts dinâmicos anteriores
  document.querySelectorAll('script[data-dynamic]').forEach(script => script.remove());

  // Carregue JS específico da página após inserir o HTML
  if (route === '#feed') {
    loadScript('./js/feed.js', true);
  }
  if (route === '#direct') {
    // IMPORTANTE: direct-mobile.js usa ES6 modules (import/export)
    // Por isso precisa de type="module"
    loadScript('./js/direct-mobile.js', true);
  }
  if (route === '#config') {
    loadScript('./js/config.js', false);
  }
  if (route === '#perfil') {
    loadScript('./js/profile.js', false);
  }
  if (route === '#login') {
    loadScript('./js/login.js', false);
  }
}

// Função para carregar scripts dinamicamente
function loadScript(src, isModule = false) {
  const script = document.createElement('script');
  script.type = isModule ? 'module' : 'text/javascript';
  script.src = src;
  script.setAttribute('data-dynamic', src);
  
  // Adiciona tratamento de erro
  script.onerror = () => {
    console.error(`Erro ao carregar script: ${src}`);
  };
  
  script.onload = () => {
    console.log(`Script carregado com sucesso: ${src}`);
  };
  
  document.body.appendChild(script);
}

window.addEventListener('hashchange', () => loadPage(location.hash));
window.addEventListener('DOMContentLoaded', () => loadPage(location.hash || '#feed'));