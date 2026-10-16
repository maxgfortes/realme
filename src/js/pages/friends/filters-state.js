export let currentUserId = null;

export function setCurrentUserId(uid) {
  currentUserId = uid;
}

// os filtros são <textarea class="filterInput"> dentro de .filtros
export const filtrosInputs = document.querySelectorAll(
  '.filtros input, .filtros select, .filtros textarea'
);

export function normalizar(str) {
  return (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// id do input no HTML → campo da busca (o mesmo nome que o servidor usa)
const CAMPO_POR_ID = {
  styleInput: "styles",
  personalityInput: "personality",
  charactersInput: "characters",
  lookingforInput: "lookingFor",
  songsInput: "music",
  locationInput: "location",
  hobbiesInput: "hobbies"
};

// plano B, caso o id mude: pelo texto do rótulo (.filterLabel)
const CAMPO_POR_ROTULO = {
  styles: ["estilo"],
  personality: ["personalidade"],
  characters: ["personagem"],
  lookingFor: ["buscando", "procurando"],
  music: ["musica"],
  location: ["localizacao", "local", "cidade"],
  hobbies: ["hobbie", "hobby"]
};

export function getFieldKey(el) {
  if (el.dataset?.field) return el.dataset.field;
  if (CAMPO_POR_ID[el.id]) return CAMPO_POR_ID[el.id];

  const rotulo = normalizar(el.previousElementSibling?.textContent || "");

  for (const [campo, trechos] of Object.entries(CAMPO_POR_ROTULO)) {
    if (trechos.some(t => rotulo.includes(t))) return campo;
  }

  return null;
}

// { music: "rock", hobbies: "games" } — só o que foi digitado.
// O front não interpreta nada: manda o texto e o servidor pontua.
export function coletarFiltros() {
  const filtros = {};

  filtrosInputs.forEach(el => {
    const campo = getFieldKey(el);
    const valor = (el.value || "").trim();

    if (!campo || !valor) return;

    filtros[campo] = filtros[campo] ? `${filtros[campo]}, ${valor}` : valor;
  });

  return filtros;
}

// "Igual a mim": mostra nos inputs os dados do seu perfil (vindos do servidor)
export function preencherFiltros(campos = {}) {
  filtrosInputs.forEach(el => {
    const campo = getFieldKey(el);

    if (!campo) return;

    el.value = campos[campo] || "";

    // dispara o autoajuste de altura (inputSize.js)
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
