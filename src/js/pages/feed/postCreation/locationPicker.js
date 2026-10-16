import { setupBottomMenu } from "./bottomMenu.js";

/*
 * Localização: texto livre (o usuário pode escrever qualquer coisa).
 * Salva no post como string: location: "Praia do Campeche, Floripa".
 */

const MAX_LENGTH = 100;

const button = document.getElementById("btnLocal");
const input = document.getElementById("locationInput");

let confirmed = "";

function updateButton() {
    if (!button) return;

    // o visual fica no CSS (.has-value::after)
    button.classList.toggle("has-value", Boolean(confirmed));
}

if (button && input) {
    input.maxLength = MAX_LENGTH;

    setupBottomMenu({
        trigger: button,
        content: input,
        onOpen() {
            input.value = confirmed;
        },
        onConfirm() {
            confirmed = input.value.replace(/\s+/g, " ").trim().slice(0, MAX_LENGTH);
            updateButton();
        }
    });
}

export function getLocationText() {
    return confirmed;
}

export function clearLocation() {
    confirmed = "";

    if (input) input.value = "";

    updateButton();
}