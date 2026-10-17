import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth, IS_LOCAL } from "../../../config/config.js";

const FUNCTION_URL = IS_LOCAL
    ? "http://127.0.0.1:5001/ifriendmatch/southamerica-east1/createAccount"
    : "https://southamerica-east1-ifriendmatch.cloudfunctions.net/createAccount";

const form =
    document.querySelector(".form-area");

const nextBtn =
    document.getElementById("nextBtn");

const backBtn =
    document.getElementById("backBtn");

const createAccountBtn =
    document.querySelector(".create-btn");

const tabOne =
    document.getElementById("tabOne");

const tabTwo =
    document.getElementById("tabTwo");

const inputEmail =
    document.getElementById("inputEmail");

const inputPassword =
    document.getElementById("inputPassword");

const inputName =
    document.getElementById("nome");

const inputSurname =
    document.getElementById("sobrenome");

const inputUsername =
    document.getElementById("usuario");

const inputBirthDate =
    document.getElementById("nascimento");

const inputGender =
    document.getElementById("genero");

const errorMessageArea =
    document.getElementById("errorMessageArea");

const errorMessage =
    document.getElementById("errorMessage");

let creatingAccount = false;

function openNextStep() {
    tabOne.classList.add("active");
    tabTwo.classList.add("active");
}

function backStep() {
    tabOne.classList.remove("active");
    tabTwo.classList.remove("active");
}

function validateEmail() {
    const emailRegex =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return emailRegex.test(
        inputEmail.value.trim()
    );
}

function validatePassword() {
    const passwordRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/;

    return passwordRegex.test(
        inputPassword.value
    );
}

function validateName(name) {
    const nameRegex =
        /^[A-Za-zÀ-ÿ\s'-]{2,40}$/;

    return nameRegex.test(name);
}

function validateUsername(username) {
    const usernameRegex =
        /^[a-z0-9_]{3,20}$/;

    return usernameRegex.test(username);
}

function validateBirthDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return false;
    }

    const birthDate =
        new Date(`${date}T00:00:00`);

    const today =
        new Date();

    if (
        Number.isNaN(birthDate.getTime()) ||
        birthDate > today
    ) {
        return false;
    }

    let age =
        today.getFullYear() -
        birthDate.getFullYear();

    const monthDifference =
        today.getMonth() -
        birthDate.getMonth();

    if (
        monthDifference < 0 ||
        (
            monthDifference === 0 &&
            today.getDate() < birthDate.getDate()
        )
    ) {
        age--;
    }

    return age >= 13;
}

function showError(message) {
    errorMessageArea.classList.add("active");

    errorMessage.textContent =
        message;

    setTimeout(() => {
        errorMessageArea.classList.remove(
            "active"
        );
    }, 6000);
}

function showLoading(loading) {
    creatingAccount = loading;

    if (createAccountBtn) {
        createAccountBtn.disabled =
            loading;
    }
}

function validateOpenTab() {
    const email =
        inputEmail.value.trim();

    const password =
        inputPassword.value;

    if (
        email === "" ||
        password === ""
    ) {
        showError(
            "Please fill in all fields"
        );

        return;
    }

    if (!validateEmail()) {
        showError(
            "Enter a valid email address"
        );

        return;
    }

    if (!validatePassword()) {
        showError(
            "Password must be 8 characters long, with one uppercase letter, one lowercase letter, and one number"
        );

        return;
    }

    openNextStep();
}

async function createAccount(event) {

    event.preventDefault();

    if (creatingAccount) {
        return;
    }

    const email =
        inputEmail.value
            .trim()
            .toLowerCase();

    const password =
        inputPassword.value;

    const name =
        inputName.value.trim();

    const surname =
        inputSurname.value.trim();

    const username =
        inputUsername.value
            .trim()
            .toLowerCase();

    const birthDate =
        inputBirthDate.value;

    const gender =
        inputGender.value;

    if (
        email === "" ||
        password === "" ||
        name === "" ||
        surname === "" ||
        username === "" ||
        birthDate === "" ||
        gender === ""
    ) {
        showError(
            "Please fill in all fields"
        );

        return;
    }

    if (!validateEmail()) {
        showError(
            "Enter a valid email address"
        );

        return;
    }

    if (!validatePassword()) {
        showError(
            "Password must be 8 characters long, with one uppercase letter, one lowercase letter, and one number"
        );

        return;
    }

    if (!validateName(name)) {
        showError(
            "Enter a valid first name"
        );

        return;
    }

    if (!validateName(surname)) {
        showError(
            "Enter a valid last name"
        );

        return;
    }

    if (!validateUsername(username)) {
        showError(
            "Username must contain only lowercase letters, numbers and underscores"
        );

        return;
    }

    if (!validateBirthDate(birthDate)) {
        showError(
            "You must be at least 13 years old"
        );

        return;
    }

    showLoading(true);

    try {

        const response =
            await fetch(
                FUNCTION_URL,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        nome: name,
                        sobrenome: surname,
                        username,
                        email,
                        senha: password,
                        nascimento: birthDate,
                        genero: gender
                    })
                }
            );

        const data =
            await response.json();

        if (!response.ok) {

            switch (data.error) {

                case "USERNAME_TAKEN":

                    showError(
                        "This username is already in use"
                    );

                    break;

                case "EMAIL_ALREADY_IN_USE":

                    showError(
                        "This email is already registered"
                    );

                    break;

                case "INVALID_EMAIL":

                    showError(
                        "Enter a valid email address"
                    );

                    break;

                case "INVALID_BIRTH_DATE":

                    showError(
                        "Enter a valid birth date"
                    );

                    break;

                case "INVALID_USERNAME":

                    showError(
                        "Invalid username"
                    );

                    break;

                case "INVALID_NAME":

                    showError(
                        "Enter a valid first name"
                    );

                    break;

                case "INVALID_SURNAME":

                    showError(
                        "Enter a valid last name"
                    );

                    break;

                case "WEAK_PASSWORD":

                    showError(
                        "Password must be 8 characters long, with one uppercase letter, one lowercase letter, and one number"
                    );

                    break;

                case "UNDERAGE":

                    showError(
                        "You must be at least 13 years old"
                    );

                    break;

                case "RATE_LIMITED":

                    showError(
                        "Too many attempts. Please try again later"
                    );

                    break;

                default:

                    showError(
                        "Unable to create account"
                    );

                    break;
            }

            return;
        }

        await signInWithEmailAndPassword(
            auth,
            email,
            password
        );
        window.location.href =
            "feed.html";

    } catch (error) {

        console.error(
            "Create account error:",
            error
        );

        showError(
            "Unable to create account"
        );

    } finally {

        showLoading(false);
    }
}

nextBtn.addEventListener(
    "click",
    validateOpenTab
);

backBtn.addEventListener(
    "click",
    backStep
);

form.addEventListener(
    "submit",
    createAccount
);