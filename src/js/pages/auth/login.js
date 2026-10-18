import { t } from "/src/i18n/i18n.js";
import { signInWithEmailAndPassword, onAuthStateChanged }
from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { auth } from "../../../config/config.js";

const loginBtn = document.getElementById("loginBtn");

const inputEmail = document.getElementById("inputEmail");
const inputPassword = document.getElementById("inputPassword");

const errorMessageArea = document.getElementById("errorMessageArea");
const errorMessage = document.getElementById("errorMessage");

const loginForm = document.querySelector("form");

function validateEmail() {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return emailRegex.test(inputEmail.value.trim());
}

function showError(message) {
    errorMessageArea.classList.add("active");
    errorMessage.textContent = message;

    setTimeout(() => {
        errorMessageArea.classList.remove("active");
    }, 6000);
}

async function login(event) {
    event.preventDefault();

    const email = inputEmail.value.trim();
    const password = inputPassword.value;

    if (email === "" || password === "") {
        showError(t("auth.fillAll"));
        return;
    }

    if (!validateEmail()) {
        showError(t("auth.validEmail"));
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);

        window.location.href = "feed.html";

    } catch (error) {
        console.error(error);

        switch (error.code) {
            case "auth/invalid-credential":
                showError(t("auth.wrongCredentials"));
                break;

            case "auth/user-disabled":
                showError(t("auth.disabled"));
                break;

            case "auth/too-many-requests":
                showError(t("auth.tooManyLogin"));
                break;

            case "auth/network-request-failed":
                showError(t("auth.network"));
                break;

            default:
                showError(t("auth.generic"));
        }
    }
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        window.location.href = "feed.html";
    }
});

loginForm.addEventListener("submit", login);