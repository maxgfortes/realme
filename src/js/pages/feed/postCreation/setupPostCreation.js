const userPfp = document.getElementById('creationModalPfp');
const displayNameCreation = document.getElementById('creationModalDisplayName');

function lerCache() {
  const localGreeting = localStorage.getItem("greeting");

  if (!localGreeting) {
    return null;
  }

  return JSON.parse(localGreeting);
}

function mostrarCacheGreeting() {
  const greeting = lerCache();
  if (greeting) {
    if (greeting.displayName) {
      displayNameCreation.textContent = greeting.displayName;
    }
    if (greeting.userphoto) {
      userPfp.src = greeting.userphoto;
    }
  }
}

mostrarCacheGreeting();