import { db } from "/src/config/config.js";

import {
    doc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

function lerCache() {
    const localData = localStorage.getItem("greeting");

    if (!localData) {
        return null;
    }

    return JSON.parse(localData);
}

function salvarCache(dadosNovos) {
    const atual = lerCache();

    const cache = {
        displayName: dadosNovos.displayName || (atual ? atual.displayName : null),
        userphoto: dadosNovos.userphoto || (atual ? atual.userphoto : null)
    };

    localStorage.setItem("greeting", JSON.stringify(cache));
}

export function getUser(uid) {
    const ref = doc(db, "users", uid);

    onSnapshot(ref, function (snap) {
        if (snap.exists()) {
            const dados = snap.data();
            const displayName = `${dados.name || ""} ${dados.surname || ""}`.trim();

            salvarCache({ displayName });
        }
    });

    const photoRef = doc(db, "users", uid, "user-infos", "user-media");

    onSnapshot(photoRef, function (snap) {
        if (snap.exists()) {
            const dados = snap.data();

            if (dados.userphoto) {
                salvarCache({ userphoto: dados.userphoto });
            }
        }
    });
}