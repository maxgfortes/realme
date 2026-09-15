const searchInput = document.getElementById("dmSearchInput");
const usersList = document.getElementById("dmUsersList");

searchInput.addEventListener("input", () => {
    const searchValue = searchInput.value.toLowerCase().trim();
    const users = usersList.querySelectorAll(".user-list-box");

    users.forEach((user) => {
        const name = user.dataset.name || "";
        user.style.display = name.includes(searchValue) ? "" : "none";
    });
});