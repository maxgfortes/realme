import { db, auth } from "../../../../config/config.js";

import {
    collection,
    getDocs,
    getDoc,
    setDoc,
    doc,
    query,
    orderBy,
    limit,
    serverTimestamp,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";


onAuthStateChanged(auth, async (user) => {

    if (!user) return;

    const now = new Date();

    const q = query(
        collection(db, "serverMessages"),
        orderBy("startAt", "desc"),
        limit(10)
    );

    const result = await getDocs(q);

    for (const messageDoc of result.docs) {

    const message = messageDoc.data();
    const messageId = messageDoc.id;

    const startAt = message.startAt.toDate();
    const endAt = message.endAt.toDate();

    if (now < startAt) continue;

    if (now > endAt) continue;

    const seenRef = doc(
        db,
        "users",
        user.uid,
        "seenMessages",
        messageId
    );

    const seen = await getDoc(seenRef);

    if (seen.exists()) break;

    const icon = message.icon
        ? `
            <div class="messageIconArea">
                <img src="${message.icon}" alt="">
            </div>
        `
        : "";

    const button = message.buttonText
        ? `
            <div class="messageAction">
                <button class="messageBtn">
                    ${message.buttonText}
                </button>
            </div>
        `
        : "";

    document.getElementById("feed").insertAdjacentHTML(
        "afterbegin",
        `
            <div class="serverMessageArea">

                <button class="closeMessage">×</button>

                ${icon}

                <div class="textMessageArea">

                    <div class="messageTitle">
                        ${message.title}
                    </div>
                    <div class="messageBody">
                        ${message.body}
                    </div>
                    
                </div>

                ${button}

            </div>
        `
    );

    const messageArea =
        document.querySelector(".serverMessageArea");

    const closeButton =
        messageArea.querySelector(".closeMessage");

    let visibleTime = 0;
    let lastVisibleTime = null;
    let seenSaved = false;
    let seenTimer = null;

    async function markAsSeen() {

        if (seenSaved) return;

        seenSaved = true;

        clearTimeout(seenTimer);

        await setDoc(seenRef, {
            seenAt: serverTimestamp()
        });
    }

    function startCounting() {

        if (seenSaved) return;

        if (lastVisibleTime !== null) return;

        lastVisibleTime = Date.now();

        const remainingTime =10000 - visibleTime;

        seenTimer = setTimeout(() => {

            visibleTime = 10000;

            markAsSeen();

        }, remainingTime);
    }

    function stopCounting() {

        if (lastVisibleTime === null) return;

        visibleTime += Date.now() - lastVisibleTime;

        lastVisibleTime = null;

        clearTimeout(seenTimer);
    }

    if (document.visibilityState === "visible") {
        startCounting();
    }

    document.addEventListener("visibilitychange", () => {

        if (document.visibilityState === "visible") {
            startCounting();
        } else {
            stopCounting();
        }

    });

    closeButton.addEventListener("click", () => {

        stopCounting();
        markAsSeen();

        messageArea.classList.add("hidden");

        setTimeout(() => {
            messageArea.remove();
        }, 600);

    });

    break;
    }
});