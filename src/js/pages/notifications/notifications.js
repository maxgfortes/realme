import { db, auth } from "../../../config/config.js";

import {
    collection,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    doc,
    getDoc,
    updateDoc,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

import { formatDate } from "./formatDate.js";
import { getUser } from "./getUser.js";
import { getNotificationMessage } from "./notificationMessages.js";
import { groupByDay } from "./groupByDay.js";
import { deleteNotification } from "./deleteNotification.js";
import {
    acceptFriendRequest,
    declineFriendRequest,
    updateFriendRequestsBadge
} from "./friendRequests.js";
import { enableSwipe } from "./swipe.js";


const notificationsList =
    document.querySelector("#notifications-list");


const defaultAvatar =
    "../public/img/default.jpg";


const posts = {};


let unsubscribeNotifications = null;


function renderEmpty() {

    notificationsList.innerHTML = `
        <div class="nt-empty">
            <p class="nt-empty-title">Sem notificações</p>
            <p class="nt-empty-sub">Interaja para receber notificações</p>
        </div>
    `;
}


async function getPost(postId) {

    if (!postId) {
        return null;
    }


    if (posts[postId]) {
        return posts[postId];
    }


    const postReference =
        doc(
            db,
            "posts",
            postId
        );


    const postResult =
        await getDoc(
            postReference
        );


    if (!postResult.exists()) {
        return null;
    }


    posts[postId] = postResult.data();

    return posts[postId];
}


function createNotification(
    notification,
    user,
    post,
    meUid
) {

    const item =
        document.createElement("div");


    item.classList.add(
        "notification-item"
    );


    item.dataset.notificationId =
        notification.id;


    const message =
        getNotificationMessage(
            notification.type
        );


    const date =
        formatDate(
            notification.createdAt
        );


    let preview = "";


    if (post) {

        if (post.imgs) {

            if (post.imgs.length > 0) {

                preview = `
                    <div class="notification-social">

                        <div class="post-preview">

                            <img
                                src="${post.imgs[0]}"
                                alt="Publicação"
                                onerror="this.parentElement.style.display='none'"
                            >

                        </div>

                    </div>
                `;
            }
        }
    }


    let actions = "";

    if (notification.type === "friend_request") {
        actions = `
            <div class="notification-friend-actions">
                <button class="friend-accept-btn" type="button">Aceitar</button>
                <button class="friend-decline-btn" type="button">Recusar</button>
            </div>
        `;
    }


    item.innerHTML = `

        <div class="notification-item-content">

            <div class="notification-user-pfp">

                <img
                    src="${user.userphoto}"
                    alt="${user.username}"
                    onerror="this.onerror=null; this.src='${defaultAvatar}'"
                >

            </div>


            <div class="notification-body">

                <div class="notification-content">

                    <span class="notification-name" data-uid="${notification.fromUid}" style="cursor: pointer;">
                        ${user.username}
                    </span>

                    ${message}

                    <span class="notification-date">
                        ${date}
                    </span>

                    ${actions}

                </div>

            </div>


            ${preview}

        </div>


        <div class="notification-item-options">

            <button
                class="item-btn delete"
                type="button"
            >

                <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path d="M432,144,403.33,419.74A32,32,0,0,1,371.55,448H140.46a32,32,0,0,1-31.78-28.26L80,144" style="fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:32px"></path><rect x="32" y="64" width="448" height="80" rx="16" ry="16" style="fill:none;;stroke-linecap:round;stroke-linejoin:round;stroke-width:32px"></rect><line x1="312" y1="240" x2="200" y2="352" style="fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:32px"></line><line x1="312" y1="352" x2="200" y2="240" style="fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:32px"></line></g></svg>
          

                </svg>

            </button>

        </div>
    `;


    const nameElement =
        item.querySelector(".notification-name");

    nameElement.addEventListener("click", function() {
        window.location.href = "perfil.html?uid=" + notification.fromUid;
    });


    if (notification.type === "friend_request") {

        const acceptButton =
            item.querySelector(".friend-accept-btn");

        const declineButton =
            item.querySelector(".friend-decline-btn");

        acceptButton.addEventListener("click", async function() {
            acceptButton.disabled = true;
            declineButton.disabled = true;
            await acceptFriendRequest(notification.fromUid, meUid);
            deleteNotification(notification.id);
            item.remove();
            updateFriendRequestsBadge(meUid);
        });

        declineButton.addEventListener("click", async function() {
            acceptButton.disabled = true;
            declineButton.disabled = true;
            await declineFriendRequest(notification.fromUid, meUid);
            deleteNotification(notification.id);
            item.remove();
            updateFriendRequestsBadge(meUid);
        });
    }


    enableSwipe(item, function() {
        deleteNotification(notification.id);
    });


    return item;
}


function cacheKey(uid) {
    return "rm_notifications_cache_" + uid;
}


function saveNotificationsCache(uid, resolvedList) {

    try {

        const serializable = resolvedList.map(function(item) {

            return {
                notification: {
                    ...item.notification,
                    createdAt: item.notification.createdAt
                        ? item.notification.createdAt.toISOString()
                        : null
                },
                user: item.user,
                post: item.post
            };
        });

        localStorage.setItem(
            cacheKey(uid),
            JSON.stringify(serializable)
        );

    } catch (error) {
        console.log("notifications.js: não consegui salvar o cache de notificações.", error);
    }
}


function loadNotificationsCache(uid) {

    try {

        const raw = localStorage.getItem(cacheKey(uid));

        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw);

        return parsed.map(function(item) {

            return {
                notification: {
                    ...item.notification,
                    createdAt: item.notification.createdAt
                        ? new Date(item.notification.createdAt)
                        : null
                },
                user: item.user,
                post: item.post
            };
        });

    } catch (error) {
        console.log("notifications.js: não consegui ler o cache de notificações.", error);
        return null;
    }
}


async function resolveNotification(notification) {

    const user =
        await getUser(
            notification.fromUid
        );


    let post = null;


    if (notification.postId) {

        post =
            await getPost(
                notification.postId
            );
    }


    return {
        notification: notification,
        user: user,
        post: post
    };
}


function renderResolvedNotifications(resolvedList, uid) {

    notificationsList.innerHTML = "";


    if (resolvedList.length === 0) {
        renderEmpty();
        return;
    }


    const resolvedById = {};

    resolvedList.forEach(function(item) {
        resolvedById[item.notification.id] = item;
    });


    const notifications =
        resolvedList.map(function(item) {
            return item.notification;
        });


    const grouped =
        groupByDay(notifications);


    for (const label of grouped.order) {

        const groupTitle =
            document.createElement("div");

        groupTitle.classList.add(
            "notification-group-title"
        );

        groupTitle.textContent = label;

        notificationsList.appendChild(groupTitle);


        for (const notification of grouped.groups[label]) {

            const resolved = resolvedById[notification.id];

            const notificationElement =
                createNotification(
                    notification,
                    resolved.user,
                    resolved.post,
                    uid
                );


            notificationsList.appendChild(
                notificationElement
            );
        }
    }
}


function loadNotifications(uid) {

    const cached = loadNotificationsCache(uid);

    if (cached) {
        renderResolvedNotifications(cached, uid);
    }


    const date =
        new Date();


    date.setDate(
        date.getDate() - 60
    );


    const notificationsReference =
        collection(
            db,
            "notifications"
        );


    const notificationsQuery =
        query(

            notificationsReference,

            where(
                "toUid",
                "==",
                uid
            ),

            where(
                "visible",
                "!=",
                false
            ),

            where(
                "createdAt",
                ">=",
                Timestamp.fromDate(date)
            ),

            orderBy(
                "createdAt",
                "desc"
            ),

            limit(50)
        );


    unsubscribeNotifications =
        onSnapshot(
            notificationsQuery,
            async function(result) {

                const notifications = [];


                for (
                    const notificationDocument
                    of result.docs
                ) {

                    const notificationData =
                        notificationDocument.data();


                    const notification = {

                        id:
                            notificationDocument.id,

                        ...notificationData

                    };


                    if (
                        notification.createdAt
                    ) {

                        notification.createdAt =
                            notification.createdAt.toDate();
                    }


                    if (!notification.read) {
                        updateDoc(
                            doc(db, "notifications", notification.id),
                            { read: true }
                        );
                    }


                    notifications.push(notification);
                }


                const resolvedList = [];

                for (const notification of notifications) {

                    const resolved =
                        await resolveNotification(notification);

                    resolvedList.push(resolved);
                }


                renderResolvedNotifications(resolvedList, uid);

                saveNotificationsCache(uid, resolvedList);
            }
        );
}

onAuthStateChanged(
    auth,
    function(user) {

        if (unsubscribeNotifications) {
            unsubscribeNotifications();
            unsubscribeNotifications = null;
        }

        if (!user) {
            renderEmpty();
            return;
        }

        loadNotifications(
            user.uid
        );

        updateFriendRequestsBadge(
            user.uid
        );
    }
);