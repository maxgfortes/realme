const IMGBB_KEY = "fc8497dcdf559dc9cbff97378c82344c";

export async function compressImage(file, { maxWidth = 1600, maxHeight = 1600, quality = 0.82 } = {}) {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;

    try {
        await image.decode();
    } finally {
        URL.revokeObjectURL(url);
    }

    let width = image.naturalWidth;
    let height = image.naturalHeight;

    if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(image, 0, 0, width, height);

    const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error("compress failed")), "image/jpeg", quality);
    });

    return { blob, width, height };
}

export async function uploadImage(file, options) {
    const { blob, width, height } = await compressImage(file, options);
    const formData = new FormData();
    formData.append("image", blob);

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, {
        method: "POST",
        body: formData
    });

    const data = await response.json();

    if (!data.success) throw new Error("upload failed");

    return { url: data.data.url, width, height };
}

export function pickImage() {
    return new Promise(resolve => {
        const input = document.createElement("input");
        let settled = false;

        input.type = "file";
        input.accept = "image/*";
        input.hidden = true;

        const finish = file => {
            if (settled) return;
            settled = true;
            input.remove();
            resolve(file);
        };

        input.addEventListener("cancel", () => finish(null));
        input.onchange = () => finish(input.files?.[0] || null);

        document.body.appendChild(input);
        input.click();
    });
}
