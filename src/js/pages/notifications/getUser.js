import { db } from "../../../config/config.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


const defaultAvatar = "../public/img/default.jpg";

const users = {};


export async function getUser(fromUid) {

    if (users[fromUid]) {
        return users[fromUid];
    }

    const userReference =
        doc(db, "users", fromUid);

    const mediaReference =
        doc(db, "users", fromUid, "user-infos", "user-media");

    const [userResult, mediaResult] =
        await Promise.all([
            getDoc(userReference),
            getDoc(mediaReference)
        ]);

    let username = "usuário";
    let handle = "";
    let userphoto = defaultAvatar;

    if (userResult.exists()) {

        const userData =
            userResult.data();

        const name =
            userData.name || "";

        const surname =
            userData.surname || "";

        username =
            (name + " " + surname).trim();

        if (!username) {
            username = "usuário";
        }

        handle =
            userData.username || "";
    }

    if (mediaResult.exists()) {

        const mediaData =
            mediaResult.data();

        if (mediaData.userphoto) {
            userphoto = mediaData.userphoto;
        }
    }

    users[fromUid] = {
        username: username,
        handle: handle,
        userphoto: userphoto
    };

    return users[fromUid];
}