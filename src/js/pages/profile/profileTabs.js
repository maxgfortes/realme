import { $ } from "./dom.js";

const menu = document.querySelector(".profile-menu");
const tabsContainer = $("tabsContainer");
const menuSlider = $("menuSlider");

let currentTab = 0;

const getItems = () => [...menu.querySelectorAll(".menu-item")];
const getTabs = () => [...tabsContainer.querySelectorAll(":scope > .profile-tab")];

export function changeTab(index) {
  currentTab = index;
  const count = getTabs().length;

  tabsContainer.style.transform = `translateX(-${index * (100 / count)}%)`;
  menuSlider.style.transform = `translateX(${index * 100}%)`;

  getItems().forEach(item =>
    item.classList.toggle("active", Number(item.dataset.profileTab) === index)
  );
}

function layoutTabs() {
  const tabs = getTabs();
  const count = tabs.length;

  tabsContainer.style.width = `${count * 100}%`;
  tabs.forEach(tab => {
    tab.style.width = `${100 / count}%`;
    tab.style.flex = `0 0 ${100 / count}%`;
    tab.style.minWidth = `${100 / count}%`;
  });
  menuSlider.style.width = `${100 / count}%`;

  changeTab(currentTab);
}

export function addTab(iconSVG, panel) {
  const button = document.createElement("button");
  button.className = "menu-item";
  button.dataset.profileTab = getTabs().length;
  button.innerHTML = iconSVG;

  menu.appendChild(button);
  tabsContainer.appendChild(panel);
  layoutTabs();
}

export function removeTab(panel) {
  const index = getTabs().indexOf(panel);
  if (index === -1) return;

  getItems()
    .find(item => Number(item.dataset.profileTab) === index)
    ?.remove();

  panel.remove();

  getItems().forEach(item => {
    const n = Number(item.dataset.profileTab);
    if (n > index) item.dataset.profileTab = n - 1;
  });

  if (currentTab === index) currentTab = Math.max(0, index - 1);
  else if (currentTab > index) currentTab--;

  layoutTabs();
}

menu.addEventListener("click", e => {
  const item = e.target.closest(".menu-item");
  if (item) changeTab(Number(item.dataset.profileTab));
});