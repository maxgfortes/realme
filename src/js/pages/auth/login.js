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
        showError("Please fill in all fields");
        return;
    }

    if (!validateEmail()) {
        showError("Please enter a valid email");
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);

        window.location.href = "feed.html";

    } catch (error) {
        console.error(error);

        switch (error.code) {
            case "auth/invalid-credential":
                showError("Email or password is incorrect");
                break;

            case "auth/user-disabled":
                showError("This account has been disabled");
                break;

            case "auth/too-many-requests":
                showError("Too many login attempts. Please try again later");
                break;

            case "auth/network-request-failed":
                showError("Check your internet connection and try again");
                break;

            default:
                showError("Something went wrong. Please try again");
        }
    }
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        window.location.href = "feed.html";
    }
});

loginForm.addEventListener("submit", login);