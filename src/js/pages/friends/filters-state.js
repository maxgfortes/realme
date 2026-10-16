export let currentUserId = null;

export function setCurrentUserId(uid) {
  currentUserId = uid;
}

export const filtrosInputs = document.querySelectorAll('.filtros input, .filtros select');

export function normalizar(str) {
  return (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// ─── Idade base ("igual a mim") ──────────────────────────────
let idadeBase = null;

export function setIdadeBase(idade) {
  idadeBase = Number.isFinite(idade) ? idade : null;
}

export function getIdadeBase() {
  return idadeBase;
}

// ─── Campos de busca ─────────────────────────────────────────
// keys    → onde o dado fica no perfil (users/{uid} e users/{uid}/user-infos/*)
// aliases → trechos do rótulo do input no HTML (sem acento, minúsculo)
// Dica: se quiser evitar depender do rótulo, coloque data-field="music" etc. no input.
export const CAMPOS = {
  styles:      { keys: ['styles'],                                              aliases: ['estilo'] },
  personality: { keys: ['personality'],                                         aliases: ['personalidade'] },
  dreams:      { keys: ['dreams'],                                              aliases: ['sonho'] },
  music:       { keys: ['music'],                                               aliases: ['musica'] },
  characters:  { keys: ['characters'],                                          aliases: ['personagem'] },
  hobbies:     { keys: ['hobbies'],                                             aliases: ['hobbie', 'hobby'] },
  location:    { keys: ['location', 'localizacao'],                             aliases: ['local', 'cidade'] },
  lookingFor:  { keys: ['lookingFor', 'lookingfor', 'buscandoPor', 'buscando'], aliases: ['buscando', 'procurando'] },
  age:         { keys: [],                                                      aliases: ['idade'] }
};

export function getFieldKey(el) {
  const manual = el.dataset?.field;
  if (manual && CAMPOS[manual]) return manual;

  const textos = [
    normalizar(el.previousElementSibling?.textContent || ''),
    normalizar(el.id || ''),
    normalizar(el.name || '')
  ];

  for (const [campo, cfg] of Object.entries(CAMPOS)) {
    if (textos.some(t => t && cfg.aliases.some(a => t.includes(a)))) return campo;
  }
  return null;
}

// { music: "rock", hobbies: "games" } — só campos de texto preenchidos
export function coletarFiltros() {
  const filtros = {};
  filtrosInputs.forEach(el => {
    const campo = getFieldKey(el);
    const valor = (el.value || '').trim();
    if (!campo || campo === 'age' || !valor) return;
    filtros[campo] = filtros[campo] ? `${filtros[campo]}, ${valor}` : valor;
  });
  return filtros;
}

// idade digitada no input de idade (se existir) ou a idade base do "igual a mim"
export function coletarIdade() {
  for (const el of filtrosInputs) {
    if (getFieldKey(el) !== 'age') continue;
    const n = parseInt(el.value, 10);
    if (Number.isFinite(n) && n >= 13 && n <= 100) return n;
  }
  return idadeBase;
}

function textoDe(valor) {
  if (Array.isArray(valor)) return valor.filter(v => typeof v === 'string').join(', ').trim();
  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'number') return String(valor);
  return '';
}

// Junta users/{uid} + todos os docs de user-infos e devolve { styles, music, ... }
export function extrairCampos(userData = {}, infoDocs = []) {
  const flat = {};
  infoDocs.forEach(info => {
    Object.entries(info || {}).forEach(([k, v]) => {
      if (textoDe(v) && !textoDe(flat[k])) flat[k] = v;
    });
  });

  const campos = {};
  Object.entries(CAMPOS).forEach(([campo, cfg]) => {
    for (const key of cfg.keys) {
      const texto = textoDe(flat[key] ?? userData[key]);
      if (texto) { campos[campo] = texto; break; }
    }
  });
  return campos;
}

// nascimento é gravado às 12:00 UTC → o dia é o mesmo em qualquer fuso do Brasil
export function calcularIdade(nascimento) {
  const ms = typeof nascimento?.toMillis === 'function' ? nascimento.toMillis() : Number(nascimento);
  if (!Number.isFinite(ms)) return null;

  const nasc = new Date(ms);
  const hoje = new Date();
  let idade = hoje.getUTCFullYear() - nasc.getUTCFullYear();
  const m = hoje.getUTCMonth() - nasc.getUTCMonth();
  if (m < 0 || (m === 0 && hoje.getUTCDate() < nasc.getUTCDate())) idade--;

  return idade >= 0 && idade < 130 ? idade : null;
}