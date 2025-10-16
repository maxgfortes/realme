
  // cria o objeto de som
  const clickSound = new Audio("./src/audio/typing.mp3"); // ou .mp3, .ogg
  clickSound.preload = "auto"; // já carrega

  const input = document.getElementById("textbox");

  input.addEventListener("keydown", (e) => {
    // opcional: ignorar algumas teclas que não "clicam"
    if (["Shift", "Alt", "Control", "Meta"].includes(e.key)) return;

    // clonar para não cortar o som anterior
    const snd = clickSound.cloneNode();
    snd.currentTime = 0;
    snd.play().catch(() => {});
  });