const IMGBB_API_KEY = 'fc8497dcdf559dc9cbff97378c82344c';

const MAX_WIDTH = 1080;
const MAX_HEIGHT = 1440;
const JPEG_QUALITY = 0.7;
const MAX_IMAGES = 10;

const mediaButton = document.getElementById('npMediaInput');
const previewArea = document.querySelector('.image-preview-carrosel');

let selectedFiles = [];

function renderPreviews() {
  previewArea.innerHTML = '';

  selectedFiles.forEach((file, index) => {
    const wrapper = document.createElement('div');

    wrapper.className = 'img-preview';
    wrapper.dataset.index = index;

    wrapper.innerHTML = `
      <img src="" alt="Preview">
      <button type="button" class="remove-image">×</button>
    `;

    previewArea.appendChild(wrapper);

    const reader = new FileReader();

    reader.onload = (event) => {
      wrapper.querySelector('img').src = event.target.result;
    };

    reader.readAsDataURL(file);
  });

  previewArea.dispatchEvent(
    new CustomEvent('images-changed')
  );
}


mediaButton.addEventListener('click', () => {
  if (selectedFiles.length >= MAX_IMAGES) {
    return;
  }

  const input = document.createElement('input');

  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;

  input.onchange = () => {
    const files = Array.from(input.files).slice(
      0,
      MAX_IMAGES - selectedFiles.length
    );

    selectedFiles.push(...files);

    renderPreviews();
  };

  input.click();
});


previewArea.addEventListener('click', (event) => {
  const removeBtn = event.target.closest('.remove-image');

  if (!removeBtn) {
    return;
  }

  const index = parseInt(
    removeBtn.closest('.img-preview').dataset.index
  );

  selectedFiles.splice(index, 1);

  renderPreviews();
});

function getImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;

      URL.revokeObjectURL(objectUrl);

      resolve({
        width,
        height,
        aspectRatio: width / height
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);

      reject(
        new Error('Não foi possível medir a imagem')
      );
    };

    img.src = objectUrl;
  });
}

function compressImage(file) {
  return new Promise((resolve, reject) => {

    const reader = new FileReader();

    reader.onload = (event) => {

      const img = new Image();

      img.onload = () => {

        const MAX_VERTICAL_RATIO = 29 / 28;

        let targetWidth = img.width;
        let targetHeight = img.height;

        const aspectRatio = img.width / img.height;

        if (aspectRatio < MAX_VERTICAL_RATIO) {
          targetWidth = img.height * MAX_VERTICAL_RATIO;
        }

        const scale = Math.min(
          MAX_WIDTH / targetWidth,
          MAX_HEIGHT / targetHeight,
          1
        );

        const canvasWidth = Math.round(
          targetWidth * scale
        );

        const canvasHeight = Math.round(
          targetHeight * scale
        );

        const canvas = document.createElement('canvas');

        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        const ctx = canvas.getContext('2d');

        const imageRatio = img.width / img.height;
        const canvasRatio = canvasWidth / canvasHeight;

        let drawWidth;
        let drawHeight;
        let drawX;
        let drawY;

        if (imageRatio > canvasRatio) {

          drawHeight = canvasHeight;
          drawWidth = canvasHeight * imageRatio;

          drawX = (canvasWidth - drawWidth) / 2;
          drawY = 0;

        } else {

          drawWidth = canvasWidth;
          drawHeight = canvasWidth / imageRatio;

          drawX = 0;
          drawY = (canvasHeight - drawHeight) / 2;
        }

        ctx.drawImage(
          img,
          drawX,
          drawY,
          drawWidth,
          drawHeight
        );

        const base64 = canvas
          .toDataURL(
            'image/jpeg',
            JPEG_QUALITY
          )
          .split(',')[1];

        resolve({
          base64,
          width: canvasWidth,
          height: canvasHeight,
          aspectRatio: canvasWidth / canvasHeight
        });
      };

      img.onerror = reject;

      img.src = event.target.result;
    };

    reader.onerror = reject;

    reader.readAsDataURL(file);
  });
}

export async function uploadOne(file) {
  if (file.type === 'image/gif') {

    const dimensions = await getImageDimensions(file);

    const formData = new FormData();

    formData.append('image', file);

    const response = await fetch(
      `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
      {
        method: 'POST',
        body: formData
      }
    );

    const data = await response.json();

    if (!data.success) {
      throw new Error(
        data.error?.message ||
        'Erro ao enviar GIF'
      );
    }

    return {
      url: data.data.url,

      width: dimensions.width,
      height: dimensions.height,

      aspectRatio: dimensions.aspectRatio,

      fileSize: file.size,

      type: file.type
    };
  }

  const image = await compressImage(file);

  const formData = new FormData();

  formData.append(
    'image',
    image.base64
  );

  const response = await fetch(
    `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
    {
      method: 'POST',
      body: formData
    }
  );

  const data = await response.json();

  if (!data.success) {
    throw new Error(
      data.error?.message ||
      'Erro ao enviar imagem'
    );
  }

  return {
    url: data.data.url,
    width: image.width,
    height: image.height,
    aspectRatio: image.aspectRatio,
    fileSize: file.size,
    type: file.type
  };
}

export async function uploadSelectedImages() {

  const images = [];

  for (const file of selectedFiles) {

    const image = await uploadOne(file);

    images.push(image);
  }

  return images;
}

export function hasSelectedImages() {
  return selectedFiles.length > 0;
}

export function clearSelectedImages() {

  selectedFiles = [];

  renderPreviews();
}

export function onImagesChanged(callback) {

  previewArea.addEventListener(
    'images-changed',
    callback
  );
}



const BANNER_MAX_WIDTH = 1280;
const BANNER_MAX_BYTES = 500 * 1024;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível carregar a imagem'));
    };

    img.src = url;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality);
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function compressBanner(file) {
  const img = await loadImage(file);

  let width = Math.min(img.naturalWidth, BANNER_MAX_WIDTH);
  let height = Math.round(width * (img.naturalHeight / img.naturalWidth));

  let blob = null;

  for (let attempt = 0; attempt < 6; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    for (let quality = 0.85; quality >= 0.4; quality -= 0.1) {
      blob = await canvasToBlob(canvas, quality);

      if (blob.size <= BANNER_MAX_BYTES) {
        return { blob, width, height };
      }
    }

    width = Math.round(width * 0.85);
    height = Math.round(height * 0.85);
  }

  return { blob, width, height };
}

export async function uploadBanner(file) {
  const { blob, width, height } = await compressBanner(file);

  const formData = new FormData();
  formData.append('image', await blobToBase64(blob));

  const response = await fetch(
    `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
    { method: 'POST', body: formData }
  );

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error?.message || 'Erro ao enviar banner');
  }

  return {
    url: data.data.url,
    width,
    height,
    fileSize: blob.size
  };
}