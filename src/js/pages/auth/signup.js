
async function criarContaSegura(event) {
  event.preventDefault();
  hideMessages();

  const nome = document.getElementById("nome")?.value.trim();
  const sobrenome = document.getElementById("sobrenome")?.value.trim();
  const username = document.getElementById("usuario")?.value.trim().toLowerCase();
  const email = document.getElementById("email")?.value.trim().toLowerCase();
  const senha = document.getElementById("senha")?.value;
  const nascimento = document.getElementById("nascimento")?.value;
  const genero = document.getElementById("genero")?.value;

  if (!nome || !sobrenome || !username || !email || !senha || !nascimento || !genero) {
    showError("Preencha todos os campos.");
    return;
  }

  if (!validarEmail(email)) return showError("Email inválido.");
  if (!validarUsername(username)) return showError("Username inválido.");
  if (!validarSenha(senha)) return showError("Senha mínima: 6 caracteres.");
  if (!validarNascimento(nascimento)) return showError("Você precisa ter 13+ anos.");

  cadastrandoAgora = true;
  showLoading(true, "Criando conta...");

  try {
    const usernameRef = doc(db, "usernames", username);
    if ((await getDoc(usernameRef)).exists()) {
      showLoading(false);
      cadastrandoAgora = false;
      return showError("Nome de usuário já está em uso.");
    }

    const cred = await createUserWithEmailAndPassword(auth, email, senha);
    const user = cred.user;

    await updateProfile(user, { displayName: nome });

    await setDoc(usernameRef, {
      uid: user.uid,
      createdAt: serverTimestamp()
    });

    await setDoc(doc(db, "users", user.uid), { 
      uid: user.uid,
      username,
      email,
      name: nome,
      surname: sobrenome,
      gender: genero,
      birthDate: Timestamp.fromDate(new Date(nascimento)),
      emailVerified: user.emailVerified,
      createdAt: serverTimestamp()
    });

    window.location.href = "feed.html";

  } catch (err) {
    console.error(err);
    cadastrandoAgora = false; 
    let msg = "Erro ao criar conta.";
    if (err.code === 'auth/email-already-in-use') {
      msg = "Este email já está cadastrado.";
    } else if (err.code === 'auth/weak-password') {
      msg = "A senha deve ter pelo menos 6 caracteres.";
    } else if (err.code === 'auth/invalid-email') {
      msg = "Email inválido.";
    }
    showError(msg);
  } finally {
    showLoading(false);
  }
}