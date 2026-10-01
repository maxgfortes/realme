const GENDERS = {
  masculino: "Masculino",
  feminino: "Feminino",
  outro: "Outro",
  prefiro_nao_dizer: "Prefiro não dizer",
  male: "Masculino",
  female: "Feminino",
  other: "Outro",
  prefer_not_to_say: "Prefiro não dizer",
};

export function toDate(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  if (value.seconds) return new Date(value.seconds * 1000);
  return new Date(value);
}

export function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function getDisplayName(user) {
  const fullName = [user.name, user.surname].filter(Boolean).join(" ");
  return fullName || user.displayName || user.displayname || user.username || "Usuário";
}

export function formatBirthday(value) {
  const date = toDate(value);
  if (!date || isNaN(date)) return "Não informado";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}

export function formatJoinDate(value) {
  const date = toDate(value);
  if (!date || isNaN(date)) return "Data desconhecida";
  return capitalize(date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }));
}

export function translateGender(gender) {
  return GENDERS[String(gender || "").toLowerCase()] || "";
}
