var bntLogin = document.getElementById ('btnLogin')
var inputPassword = document.getElementById ('inputPassword')
var inputEmail = document.getElementById ('inputEmail')

bntLogin.addEventListener('click', function () {


    const auth = getAuth();
signInWithEmailAndPassword(auth, inputEmail.value, inputPassword.value)
  .then((userCredential) => {
    // Signed in 
    const user = userCredential.user;
    // ...
    window.location.replace('index.html')
  })
  .catch((error) => {
    const errorCode = error.code;
    const errorMessage = error.message;

    alert(errorMessage);
    console.log("Failure!")
  });
});