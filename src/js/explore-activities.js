
// =================================================
// 📌 REGISTRAR ATIVIDADE GENÉRICA
// =================================================
export async function registrarAtividade(user, message, extra = {}) {
    if (!user) return console.warn("⚠ registrarAtividade chamado sem usuário!");

    return await addDoc(collection(db, "activities"), {
        uid: user.uid,
        username: user.displayName || user.username || "Usuário",
        profilePic: user.photoURL || extra.profilePic || "",
        message,
        timestamp: serverTimestamp(),
        ...extra
    });
}


// =================================================
// 📌 ATIVIDADES PADRÕES (prontas para usar)
// =================================================

// quando altera o perfil
export async function atividadePerfilAtualizado(user) {
    return registrarAtividade(
        user,
        "atualizou o perfil 🛠️"
    );
}

// quando muda foto de perfil
export async function atividadeFotoAtualizada(user) {
    return registrarAtividade(
        user,
        "alterou a foto de perfil 📸"
    );
}

// quando muda foto de capa
export async function atividadeCapaAtualizada(user) {
    return registrarAtividade(
        user,
        "atualizou a foto de capa 🌄"
    );
}

// quando posta algo novo
export async function atividadeNovoPost(user, postId) {
    return registrarAtividade(
        user,
        "fez uma nova publicação 📝",
        { postId }
    );
}

// quando recebe like
export async function atividadeLike(user, postOwner, postId) {
    return registrarAtividade(
        user,
        `curtiu a publicação de ${postOwner} ❤️`,
        { postId }
    );
}

// quando muda música do perfil
export async function atividadeMusicaAtualizada(user, title) {
    return registrarAtividade(
        user,
        `alterou sua música do perfil para: ${title} 🎵`
    );
}

// quando muda username
export async function atividadeUsername(user, newUsername) {
    return registrarAtividade(
        user,
        `mudou seu @ para @${newUsername} ✨`
    );
}
