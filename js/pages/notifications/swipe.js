const swipeWidth = 90;

let openedItem = null;


function closeItem(item) {

    if (!item) {
        return;
    }

    const content = item.querySelector(".notification-item-content");
    const options = item.querySelector(".notification-item-options");

    item.classList.remove("open");

    content.style.transition = "transform .25s ease";
    content.style.transform = "translateX(0)";

    setTimeout(function() {
        if (!item.classList.contains("open")) {
            options.classList.remove("active");
        }
    }, 250);

    if (openedItem === item) {
        openedItem = null;
    }
}


function closeOtherItems(current) {

    const items = document.querySelectorAll(".notification-item");

    items.forEach(function(item) {
        if (item !== current) {
            closeItem(item);
        }
    });
}


export function enableSwipe(item, onDelete) {

    const content = item.querySelector(".notification-item-content");
    const deleteButton = item.querySelector(".item-btn.delete");
    const options = item.querySelector(".notification-item-options");

    if (!content || !deleteButton || !options) {
        console.log("swipe.js: não achei os elementos dentro do item, então não vou ativar o swipe nesse item.");
        console.log(item.innerHTML);
        return;
    }

    let startX = 0;
    let currentX = 0;
    let startPosition = 0;
    let dragging = false;
    let moved = false;

    content.addEventListener("pointerdown", function(event) {

        if (event.pointerType === "mouse" && event.button !== 0) {
            return;
        }

        closeOtherItems(item);

        startX = event.clientX;
        currentX = startX;
        startPosition = item.classList.contains("open") ? -swipeWidth : 0;
        dragging = true;
        moved = false;
        options.classList.add("active");
        content.style.transition = "none";
        content.setPointerCapture(event.pointerId);
    });

    content.addEventListener("pointermove", function(event) {

        if (!dragging) {
            return;
        }

        currentX = event.clientX;

        const difference = currentX - startX;

        let position = startPosition + difference;

        if (position > 0) {
            position = 0;
        }

        if (position < -swipeWidth) {
            position = -swipeWidth;
        }

        if (Math.abs(difference) > 5) {
            moved = true;
        }

        content.style.transform = "translateX(" + position + "px)";
    });

    content.addEventListener("pointerup", function(event) {

        if (!dragging) {
            return;
        }

        dragging = false;

        if (content.hasPointerCapture(event.pointerId)) {
            content.releasePointerCapture(event.pointerId);
        }

        content.style.transition = "transform .25s ease";

        const difference = currentX - startX;

        if (startPosition === 0) {

            if (difference < -40) {
                item.classList.add("open");
                options.classList.add("active");
                content.style.transform = "translateX(-" + swipeWidth + "px)";
                openedItem = item;
            } else {
                closeItem(item);
            }

        } else {

            if (difference > 40) {
                closeItem(item);
            } else {
                item.classList.add("open");
                options.classList.add("active");
                content.style.transform = "translateX(-" + swipeWidth + "px)";
                openedItem = item;
            }
        }
    });

    content.addEventListener("pointercancel", function(event) {

        if (!dragging) {
            return;
        }

        dragging = false;
        content.style.transition = "transform .25s ease";

        if (item.classList.contains("open")) {
            content.style.transform = "translateX(-" + swipeWidth + "px)";
            options.classList.add("active");
        } else {
            content.style.transform = "translateX(0)";
            setTimeout(function() {
                if (!item.classList.contains("open")) {
                    options.classList.remove("active");
                }
            }, 250);
        }
    });

    content.addEventListener("click", function(event) {
        if (moved) {
            event.preventDefault();
            event.stopPropagation();
            moved = false;
        }
    });

    deleteButton.addEventListener("click", function(event) {

        event.preventDefault();
        event.stopPropagation();

        const height = item.offsetHeight;

        item.style.height = height + "px";
        item.style.transition = "height .25s ease, opacity .25s ease, transform .25s ease";
        item.style.overflow = "hidden";

        requestAnimationFrame(function() {
            item.style.height = "0";
            item.style.opacity = "0";
            item.style.transform = "translateX(-30px)";
        });

        setTimeout(function() {
            item.remove();

            if (openedItem === item) {
                openedItem = null;
            }

            if (onDelete) {
                onDelete();
            }
        }, 250);
    });
}


document.addEventListener("pointerdown", function(event) {
    if (openedItem && !openedItem.contains(event.target)) {
        closeItem(openedItem);
    }
});