import { collection, addDoc, serverTimestamp, updateDoc, doc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { auth, db } from "../../../../config/config.js";

const imgButton = document.getElementById("img-dm");
const imageInput = document.getElementById("dm-image-input");

imgButton.addEventListener("click", function() {
    imageInput.click();
});


imageInput.addEventListener("change", async function() {

    const file = imageInput.files[0];

    if (!file) { return; }

    try {
        const compressedImage = await compressImage(file);

        const imageUrl = await uploadToImgBB(compressedImage);

        await saveMessage(imageUrl);

    } catch (error) {
    }

    imageInput.value = "";
});


async function compressImage(file) {

    const image = new Image();

    image.src = URL.createObjectURL(file);

    await image.decode();

    const canvas = document.createElement("canvas");

    const maxWidth = 1920;
    const maxHeight = 1080;

    let width = image.width;
    let height = image.height;


    if (width > maxWidth || height > maxHeight) {

        const ratio = Math.min(
            maxWidth / width,
            maxHeight / height
        );

        width = width * ratio;
        height = height * ratio;
    }


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

                resolve(blob);
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

async function saveMessage(imageUrl) {

    const chatArea = document.getElementById("dmChatArea");

    const chatId = chatArea.dataset.chatId;

    if (!chatId) {
        throw new Error("Chat não encontrado");
    }


    await addDoc(
        collection( db, "chats", chatId, "messages"),
        {
            sender: auth.currentUser.uid,
            content: imageUrl,
            read: false,
            timestamp: serverTimestamp()
        }
    );

    await updateDoc(
        doc(db, "chats", chatId),
        {
            lastMessage: "Enviou uma foto.",
            lastMessageTime: serverTimestamp()
        }
    );

}