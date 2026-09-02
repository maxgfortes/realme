import { db } from "../../../config/config.js";

import {
    doc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


export function deleteNotification(notificationId) {

    const notificationReference =
        doc(db, "notifications", notificationId);

    updateDoc(notificationReference, {
        visible: false
    });
}