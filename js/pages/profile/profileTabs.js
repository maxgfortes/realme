import { $ } from "./dom.js";

const menuItems = document.querySelectorAll(".profile-menu .menu-item");
const tabsContainer = $("tabsContainer");
const menuSlider = $("menuSlider");

const TAB_WIDTH = 100 / 3;

function changeTab(tab, item) {
  tabsContainer.style.transform = `translateX(-${tab * TAB_WIDTH}%)`;
  menuSlider.style.transform = `translateX(${tab * 100}%)`;

  menuItems.forEach(menu => menu.classList.remove("active"));
  item.classList.add("active");
}

menuItems.forEach(item => {
  item.addEventListener("click", () => {
    changeTab(Number(item.dataset.profileTab), item);
  });
});
