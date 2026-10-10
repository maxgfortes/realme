import {
    getCachedCreator,
    getPostMentionsHTML,
    appendPost,
    bindPostInteractions
} from "/src/js/pages/feed/render/postCard.js";

/*
 * Timeline do perfil (HTML fixo na página).
 *
 *   #timeline      container (recebe a classe "open" quando está aberto)
 *   #timelineName  nome do usuário
 *   #timelineRow   onde os posts são inseridos
 *   #timelineBack  botão de fechar (opcional)
 *
 * Uso (postsGrid.js):
 *   openProfileTimeline(posts, startIndex, username, loadMore)
 *   - posts: [{ id, userid, data }]
 *   - loadMore: async () => novos posts | null (null = acabou)
 */

const TIMELINE_ID = "timeline";
const TIMELINE_OPEN_CLASS = "open";

let observer = null;
let session = 0;
let loadMore = null;
let loadingMore = false;

// elemento com scroll mais próximo (null = a própria janela)
function getScrollParent(element) {
    let parent = element.parentElement;

    while (parent) {
        const { overflowY } = getComputedStyle(parent);

        if (overflowY === "auto" || overflowY === "scroll") return parent;

        parent = parent.parentElement;
    }

    return null;
}

function stopLoading(row) {
    observer?.disconnect();
    observer = null;
    loadMore = null;

    row.querySelector(".timeline-sentinel")?.remove();
}

// elemento invisível no fim da lista: quando aparece, carrega mais posts
function watchSentinel(row, id) {
    if (!loadMore) return;

    let sentinel = row.querySelector(".timeline-sentinel");

    if (!sentinel) {
        sentinel = document.createElement("div");
        sentinel.className = "timeline-sentinel";
        sentinel.style.height = "1px";
    }

    row.appendChild(sentinel); // garante que fica sempre no fim

    observer?.disconnect();

    observer = new IntersectionObserver(
        entries => {
            if (entries[0].isIntersecting) loadMoreItems(row, id);
        },
        { root: getScrollParent(row), rootMargin: "300px" }
    );

    observer.observe(sentinel);
}

async function renderPosts(row, posts, id) {
    // busca criador e menções antes, para inserir tudo na ordem certa
    const items = await Promise.all(
        posts.map(async post => ({
            post,
            creator: await getCachedCreator(post.data.creatorid || post.userid),
            mentionsHTML: await getPostMentionsHTML(post.data)
        }))
    );

    // a timeline foi fechada/reaberta enquanto carregava
    if (id !== session) return;

    row.querySelector(".timeline-sentinel")?.remove();

    items.forEach(({ post, creator, mentionsHTML }) => {
        appendPost(row, {
            postId: post.id,
            data: post.data,
            creator,
            mentionsHTML
        });
    });

    watchSentinel(row, id);
}

async function loadMoreItems(row, id) {
    if (loadingMore || !loadMore) return;

    loadingMore = true;

    try {
        const more = await loadMore();

        if (id !== session) return;

        if (!more) {
            stopLoading(row);
            return;
        }

        await renderPosts(row, more, id);
    } catch (error) {
        console.error("Erro ao carregar mais posts da timeline:", error);
    } finally {
        loadingMore = false;
    }
}

export async function openProfileTimeline(posts, startIndex = 0, username = "", loadMoreFn = null) {
    const timeline = document.getElementById(TIMELINE_ID);
    const row = document.getElementById("timelineRow");
    const nameElement = document.getElementById("timelineName");

    if (!row) return;

    const id = ++session;

    observer?.disconnect();
    observer = null;
    loadMore = loadMoreFn;
    loadingMore = false;

    if (nameElement) nameElement.textContent = username;

    row.replaceChildren();
    bindPostInteractions(row);

    timeline?.classList.add(TIMELINE_OPEN_CLASS);

    await renderPosts(row, posts, id);

    if (id !== session) return;

    row.children[Math.max(startIndex, 0)]?.scrollIntoView({ block: "start" });
}

export function closeProfileTimeline() {
    session++;

    observer?.disconnect();
    observer = null;
    loadMore = null;
    loadingMore = false;

    document.getElementById(TIMELINE_ID)?.classList.remove(TIMELINE_OPEN_CLASS);
    document.getElementById("timelineRow")?.replaceChildren();
}

document.getElementById("timelineBack")?.addEventListener("click", closeProfileTimeline);