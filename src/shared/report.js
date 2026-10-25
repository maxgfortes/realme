import { auth, db } from "/src/config/config.js";
import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function submitReport(type, targetPath, reason = "outro") {
    const user = auth.currentUser;

    if (!user || !targetPath) throw new Error("report unavailable");

    await addDoc(collection(db, "reports"), {
        type,
        targetPath,
        reason,
        reporterId: user.uid,
        status: "open",
        createdAt: serverTimestamp()
    });
}
