const eventBanner = document.getElementById("eventBanner");
const eventBannerInput = document.getElementById("eventBannerInput");

let selectedBannerFile = null;

eventBanner.addEventListener("click", () => {
    eventBannerInput.click();
});

eventBannerInput.addEventListener("change", (event) => {
    const file = event.target.files[0];

    if(!file) return;

    selectedBannerFile = file;

    const imageUrl = URL.createObjectURL(file);

    eventBanner.style.backgroundImage = `url("${imageUrl}")`;

    const icon = eventBanner.querySelector(".event-banner-icon");

    if (icon) {
    icon.style.display = "none";
    }

});

export function resetEventBanner() {
    eventBanner.style.backgroundImage = "";

    const icon = eventBanner.querySelector(".event-banner-icon");

    if (icon) {
    icon.style.display = "";
    }

    selectedBannerFile = null;

    eventBannerInput.value = "";
}

export function getSelectedBannerFile() {
    return selectedBannerFile;
}