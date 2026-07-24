export let currentUserId = null;

export function setCurrentUserId(uid) {
  currentUserId = uid;
}

export const filtrosInputs = document.querySelectorAll('.filtros input, .filtros select');

export function coletarFiltros() {
  const filtros = {};
  filtrosInputs.forEach(el => {
    const label = el.previousElementSibling?.textContent?.trim().toLowerCase() || el.id;
    filtros[label] = el.value.trim().toLowerCase();
  });
  return filtros;
}

export function normalizar(str) {
  return (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}