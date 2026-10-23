import { t } from "/src/i18n/i18n.js";
import { collection, addDoc, serverTimestamp, updateDoc, doc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { auth, db } from "../../../../config/config.js";
import { showPendingImage } from "../renderMessages.js";

const PRELOAD_TIMEOUT_MS = 4000;

const imgButton = document.getElementById("img-dm");
const imageInput = document.getElementById("dm-image-input");

imgButton.addEventListener("click", function() {
    imageInput.click();
});

imageInput.addEventListener("change", async function() {

    const file = imageInput.files[0];

    if (!file) { return; }

    imageInput.value = "";

    const chatId = document.getElementById("dmChatArea")?.dataset.chatId;

    if (!chatId) { return; }

    let pending = null;

    try {
        const compressed = await compressImage(file);

        pending = showPendingImage(
            URL.createObjectURL(compressed.blob),
            compressed.width,
            compressed.height
        );

        const imageUrl = await uploadToImgBB(compressed.blob);

        await preloadImage(imageUrl);

        await saveMessage(chatId, imageUrl, compressed.width, compressed.height);

        pending.remove();

    } catch (error) {
        console.error("Erro ao enviar imagem:", error);
        pending?.fail();
    }
});

function preloadImage(url) {
    return new Promise(function(resolve) {
        const image = new Image();
        const timer = setTimeout(resolve, PRELOAD_TIMEOUT_MS);

        image.onload = image.onerror = function() {
            clearTimeout(timer);
            resolve();
        };

        image.src = url;
    });
}

async function compressImage(file) {

    const image = new Image();

    image.src = URL.createObjectURL(file);

    await image.decode();

    const canvas = document.createElement("canvas");

    const maxWidth = 1920;
    const maxHeight = 1080;

    let width = image.naturalWidth;
    let height = image.naturalHeight;

    if (width > maxWidth || height > maxHeight) {

        const ratio = Math.min(
            maxWidth / width,
            maxHeight / height
        );

        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
    }

    URL.revokeObjectURL(image.src);

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    context.drawImage(
        image,
        0,
        0,
        width,
        height
    );

    return new Promise(function(resolve, reject) {

        canvas.toBlob(
            function(blob) {

                if (!blob) {
                    reject(new Error("Erro ao comprimir imagem"));
                    return;
                }

                resolve({ blob, width, height });
            },
            "image/jpeg",
            0.8
        );

    });
}

async function uploadToImgBB(image) {
    const apiKey = "fc8497dcdf559dc9cbff97378c82344c";
    const formData = new FormData();

    formData.append("image", image);

    const response = await fetch(
        `https://api.imgbb.com/1/upload?key=${apiKey}`,
        {
            method: "POST",
            body: formData
        }
    );

    const data = await response.json();

    if (!data.success) {
        throw new Error("ImgBB recusou a imagem");
    }

    return data.data.url;
}

async function saveMessage(chatId, imageUrl, width, height) {

    await addDoc(
        collection( db, "chats", chatId, "messages"),
        {
            sender: auth.currentUser.uid,
            content: imageUrl,
            type: "image",
            width,
            height,
            aspectRatio: width / height,
            read: false,
            timestamp: serverTimestamp()
        }
    );

    await updateDoc(
        doc(db, "chats", chatId),
        {
            lastMessage: t("dm.sentPhoto"),
            lastMessageTime: serverTimestamp()
        }
    );

}