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

async function uploadOne(file) {
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