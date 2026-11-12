import { t } from "/src/i18n/i18n.js";
import { $ } from "./dom.js";
import { state, createEmptyProfileData } from "./state.js";
import { renderProfile } from "./profileRender.js";
import { createPostPreview } from "./postPreview.js";
import { fetchProfileContent, revive } from "./profileApi.js";
import { showProfileNotFound } from "./profileNotFound.js";

const GATE_ID = "publicGate";

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

function readUrlParams() {
    const params = new URLSearchParams(location.search);
    return {
        username: params.get("username") || params.get("u") || params.get("user") || "",
        uid: params.get("userid") || params.get("uid") || ""
    };
}

function returnUrl() {
    return encodeURIComponent(location.pathname + location.search);
}

function ensureGate() {
    let gate = document.getElementById(GATE_ID);
    if (gate) return gate;

    document.body.insertAdjacentHTML("beforeend", `
        <div class="public-gate" id="${GATE_ID}" hidden>
            <div class="public-gate-overlay" data-gate-close></div>
            <div class="public-gate-sheet" role="dialog" aria-modal="true">
                <img class="public-gate-pfp" alt="">
                <div class="public-gate-title"></div>
                <div class="public-gate-text">${escapeHTML(t("public.gateText"))}</div>
                <a class="public-gate-btn primary" href="/register.html?next=${returnUrl()}">${escapeHTML(t("common.criar_conta"))}</a>
                <a class="public-gate-btn" href="/login.html?next=${returnUrl()}">${escapeHTML(t("common.entrar"))}</a>
            </div>
        </div>
    `);

    gate = document.getElementById(GATE_ID);
    gate.querySelector("[data-gate-close]").addEventListener("click", () => closeGate());

    return gate;
}

function openGate() {
    const gate = ensureGate();
    const profile = state.profileData;
    const name = [profile.user.name, profile.user.surname].filter(Boolean).join(" ") || profile.user.username;

    gate.querySelector(".public-gate-pfp").src = profile.media.userphoto || "/public/img/default.jpg";
    gate.querySelector(".public-gate-title").textContent = t("public.gateTitle", { name });
    gate.hidden = false;
    requestAnimationFrame(() => gate.classList.add("active"));
}

function closeGate() {
    const gate = document.getElementById(GATE_ID);
    if (!gate) return;

    gate.classList.remove("active");
    setTimeout(() => {
        if (!gate.classList.contains("active")) gate.hidden = true;
    }, 240);
}

function renderCta() {
    if (document.getElementById("publicCta")) return;

    const actions = document.querySelector(".actions-btn");

    actions?.insertAdjacentHTML("beforeend", `
        <div class="act-btns-area public-cta" id="publicCta">
            <a class="action-btn primary" href="/register.html?next=${returnUrl()}">${escapeHTML(t("common.criar_conta"))}</a>
            <a class="action-btn" href="/login.html?next=${returnUrl()}">${escapeHTML(t("common.entrar"))}</a>
        </div>
    `);
}

function renderTopPosts(posts) {
    const grid = $("muralPosts");
    grid.replaceChildren();

    posts.forEach(post => {
        const item = createPostPreview(revive(post.data));
        item.dataset.postId = post.id;
        item.addEventListener("click", openGate);
        grid.appendChild(item);
    });

    const more = document.createElement("button");
    more.type = "button";
    more.className = "public-more";
    more.innerHTML = `<span>${escapeHTML(t("public.seeMore"))}</span>`;
    more.addEventListener("click", openGate);

    grid.after(more);
}

function guardInteractions() {
    const blocked = [
        "#openFriendsBtn",
        "#openViewMoreBtn",
        ".profile-menu .menu-item:not([data-profile-tab='0'])",
        "#openSettingsBtn",
        ".music",
        "#nowPlaying",
        "#psnStatus"
    ].join(",");

    document.addEventListener("click", event => {
        if (!document.body.classList.contains("public-profile")) return;
        if (!event.target.closest(blocked)) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        openGate();
    }, true);
}

export async function openPublicProfile() {
    document.body.classList.add("public-profile");
    renderCta();
    guardInteractions();

    const { uid, username } = readUrlParams();

    let content;

    try {
        content = await fetchProfileContent({ uid, username, anonymous: true });
    } catch (error) {
        console.error("Erro ao carregar perfil público:", error);
        showProfileNotFound();
        return;
    }

    const profile = content.profile;
    const data = createEmptyProfileData();

    data.user = {
        name: profile.name,
        surname: profile.surname,
        username: profile.username,
        verified: profile.verified,
        squarePfp: profile.squarePfp
    };
    data.media = {
        userphoto: profile.photo,
        headerphoto: profile.banner,
        profileTheme: profile.profileTheme
    };
    data.moreInfos = { bio: profile.bio };
    data.stats = profile.stats;

    state.profileUserId = profile.uid;
    state.profileUsername = profile.username;
    state.isOwnProfile = false;
    state.profileData = data;

    renderProfile(data);

    document.title = `${[profile.name, profile.surname].filter(Boolean).join(" ") || profile.username} · RealMe`;

    renderTopPosts(content.topPosts || []);
}
