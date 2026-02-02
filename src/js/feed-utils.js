// Utility functions extracted from feed.js for unit testing

// Known malicious domains
export const DOMINIOS_MALICIOSOS = [
  'bit.ly', 'tinyurl.com', 'goo.gl', 'ow.ly', 't.co',
  'phishing-example.com', 'malware-site.net', 'scam-website.org'
];

// Detect and wrap hashtags with a span
export function formatarHashtags(texto) {
  if (typeof texto !== 'string') return '';
  return texto.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
}

// Detect potentially malicious links in a text
export function detectarLinksMaliciosos(texto) {
  if (typeof texto !== 'string') return { malicioso: false };
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = texto.match(urlRegex) || [];
  for (const url of urls) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      if (DOMINIOS_MALICIOSOS.some(domain => hostname.includes(domain))) {
        return { malicioso: true, url: url };
      }
      const padroesSuspeitos = [
        /[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/,
        /[a-z0-9]{20,}\./,
        /\.tk$|\.ml$|\.ga$|\.cf$/,
      ];
      if (padroesSuspeitos.some(pattern => pattern.test(hostname))) {
        return { malicioso: true, url: url };
      }
    } catch (e) {
      return { malicioso: true, url: url };
    }
  }
  return { malicioso: false };
}

// Validate if URL likely points to an image
export async function validarUrlImagem(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    new URL(url);
    const extensoesImagem = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    const urlLower = url.toLowerCase();
    if (extensoesImagem.some(ext => urlLower.includes(ext))) {
      return true;
    }
    try {
      const response = await fetch(url, { method: 'HEAD' });
      const contentType = response.headers.get('content-type');
      return !!(contentType && contentType.startsWith('image/'));
    } catch {
      // If HEAD fails, original code assumes true (be optimistic)
      return true;
    }
  } catch {
    return false;
  }
}

// Generate a unique id with prefix
export function gerarIdUnico(prefixo = 'id') {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000);
  return `${prefixo}-${timestamp}${random}`;
}

// Human-readable relative date (supports Firestore-like timestamps)
export function formatarDataRelativa(data) {
  if (!data) return 'Data não disponível';
  try {
    let date;
    if (typeof data === 'object' && data.seconds) {
      date = new Date(data.seconds * 1000);
    } else {
      date = new Date(data);
    }
    if (isNaN(date.getTime())) return 'Data inválida';

    const agora = new Date();
    const diferenca = agora.getTime() - date.getTime();
    const minutos = Math.floor(diferenca / (1000 * 60));
    const horas = Math.floor(diferenca / (1000 * 60 * 60));
    const dias = Math.floor(diferenca / (1000 * 60 * 60 * 24));
    const semanas = Math.floor(dias / 7);
    const meses = Math.floor(dias / 30);
    const anos = Math.floor(dias / 365);
    if (minutos < 1) return 'Agora mesmo';
    else if (minutos < 60) return `há ${minutos} minuto${minutos !== 1 ? 's' : ''}`;
    else if (horas < 24) return `há ${horas} hora${horas !== 1 ? 's' : ''}`;
    else if (dias < 7) return `há ${dias} dia${dias !== 1 ? 's' : ''}`;
    else if (semanas < 4) return `há ${semanas} semana${semanas !== 1 ? 's' : ''}`;
    else if (meses < 12) return `há ${meses} mês${meses !== 1 ? 'es' : ''}`;
    else return `há    ${anos} ano${anos !== 1 ? 's' : ''}`;
  } catch (error) {
    return 'Data inválida';
  }
}

// Choose best profile picture URL with fallback
export function obterFotoPerfil(userData, usuarioLogado) {
  const possiveisFotos = [
    userData?.userphoto,
    userData?.foto,
    usuarioLogado?.userphoto,
    usuarioLogado?.foto
  ];
  for (const foto of possiveisFotos) {
    if (foto && typeof foto === 'string') {
      try {
        new URL(foto);
        return foto;
      } catch {
        continue;
      }
    }
  }
  return './src/icon/default.jpg';
}

// Simple localStorage cache with TTL (10 minutes)
const CACHE_USER_TIME = 1000 * 60 * 10;
export function getCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - data.time > CACHE_USER_TIME) {
      localStorage.removeItem(key);
      return null;
    }
    return data.value;
  } catch {
    return null;
  }
}

export function setCache(key, value) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ time: Date.now(), value })
    );
  } catch {}
}
