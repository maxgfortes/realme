import { db } from "./firebase.js";
import { getDocs, collection } from "./firestore.js";
import { $, cloneTemplate, createImage } from "./dom.js";
import { state } from "./state.js";
import { getUserSummary } from "./userData.js";
import { fetchStatus, deleteRequest, toggleFriendship } from "./friendRequests.js";

const BATCH_SIZE = 8;
const REMOVE_DELAY = 320;

const ROW_LABELS = {
  none: "Adicionar",
  pending_sent: "Pedido enviado",
  pending_received: "Aceitar",
  friends: "Amigos",
};

const overlay = $("friendsOverlay");
const list = $("friendsList");
const profilePage = document.getElementById("profilePage");

function renderRowButton(button, status) {
  button.textContent = ROW_LABELS[status];
  button.classList.toggle("danger", status === "friends");
  button.classList.toggle("accept", status === "pending_received");
}

function openProfileOf(username) {
  location.href = `${location.pathname}?username=${encodeURIComponent(username)}`;
}

function removeRow(row, uid) {
  deleteRequest(uid);
  row.classList.add("removing");
  setTimeout(() => row.remove(), REMOVE_DELAY);
}

async function setupVisitorAction(button, summary) {
  let status = await fetchStatus(summary.uid);
  renderRowButton(button, status);

  button.addEventListener("click", async event => {
    event.stopPropagation();
    button.disabled = true;
    await toggleFriendship(status, summary.uid, summary.username);
    status = await fetchStatus(summary.uid);
    renderRowButton(button, status);
    button.disabled = false;
  });
}

async function setupRowAction(row, summary) {
  const button = row.querySelector(".friend-action");

  if (state.isOwnProfile) {
    button.textContent = "Remover";
    button.classList.add("danger");
    button.addEventListener("click", event => {
      event.stopPropagation();
      removeRow(row, summary.uid);
    });
    return;
  }

  if (!state.currentUserId || summary.uid === state.currentUserId) {
    button.remove();
    return;
  }

  await setupVisitorAction(button, summary);
}
async function createFriendRow(uid) {
    const summary = await getUserSummary(uid);
    const row = cloneTemplate("friendRowTemplate");

    const name = row.querySelector(".friend-name");
    const username = row.querySelector(".friend-username");

    row.querySelector(".friend-avatar-area").appendChild(
        createImage(
            summary.photo,
            "friend-avatar",
            summary.username
        )
    );

    if (summary.name !== summary.username) {
        name.textContent = summary.name;
    } else {
        name.remove();
    }

    username.textContent = summary.username;

    username.parentElement.append(name, username);

    row.addEventListener("click", () => openProfileOf(summary.username));

    await setupRowAction(row, summary);

    return row;
}

async function loadFriends(uid) {
  list.replaceChildren();

  const snapshot = await getDocs(collection(db, "users", uid, "friends"));
  const uids = snapshot.docs.map(friendDoc => friendDoc.id);

  if (!uids.length) {
    list.appendChild(cloneTemplate("emptyFriendsTemplate"));
    return;
  }

  for (let start = 0; start < uids.length; start += BATCH_SIZE) {
    const rows = await Promise.all(uids.slice(start, start + BATCH_SIZE).map(createFriendRow));
    list.append(...rows);
  }
}

function openFriendsList() {
  $("friendsTitle").textContent = `Amigos de ${state.profileUsername}`;
  overlay.classList.add("active");
  profilePage.classList.add("active")
  loadFriends(state.profileUserId);
}

function closeFriendsList() {
  overlay.classList.remove("active");
  profilePage.classList.remove("active")
}

$("openFriendsBtn").addEventListener("click", openFriendsList);
$("closeFriendsBtn").addEventListener("click", closeFriendsList);
