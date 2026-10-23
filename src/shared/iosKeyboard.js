const STABILITY_MS = 80;
const MIN_KEYBOARD_HEIGHT = 120;
const TOP_MARGIN = 16;
const LIFT_CLASS = "keyboard-lift";
const FOLLOW_CLASS = "keyboard-follow";
const KEYBOARD_DURATION_MS = 250;
const KEYBOARD_TRANSITION = `translate ${KEYBOARD_DURATION_MS}ms cubic-bezier(0.17, 0.59, 0.4, 0.77)`;
const FIELD_SELECTOR = "input:not([type=file]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]), textarea, [contenteditable=true]";

const isIOS =
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const viewport = window.visualViewport;

const root = document.documentElement;

let keyboardHeight = 0;
let lastMeasuredHeight = 0;
let stabilityTimer = null;
let pendingHeight = 0;
let liftedElement = null;
let lockedScrollY = null;

const savedTransitions = new Map();
const restoreTimers = new Map();
const followers = new Map();

function addKeyboardTransition(element) {
    clearTimeout(restoreTimers.get(element));
    restoreTimers.delete(element);

    if (savedTransitions.has(element)) return;

    savedTransitions.set(element, element.style.transition);
    element.style.transition = `${getComputedStyle(element).transition}, ${KEYBOARD_TRANSITION}`;
}

function restoreTransitionLater(element) {
    if (!savedTransitions.has(element)) return;

    clearTimeout(restoreTimers.get(element));
    restoreTimers.set(element, setTimeout(() => {
        element.style.transition = savedTransitions.get(element);
        savedTransitions.delete(element);
        restoreTimers.delete(element);
    }, KEYBOARD_DURATION_MS + 50));
}

function attachFollower(element) {
    if (followers.has(element)) return;

    followers.set(element, {
        basePadding: parseFloat(getComputedStyle(element).paddingTop) || 0,
        applied: 0
    });

    addKeyboardTransition(element);
    element.classList.add(FOLLOW_CLASS);
}

function syncFollowers() {
    if (liftedElement) {
        document.querySelectorAll("[data-keyboard-follow]").forEach(element => {
            if (element.parentElement?.contains(liftedElement)) attachFollower(element);
        });
    }

    followers.forEach((state, element) => {
        const height = liftedElement ? keyboardHeight : 0;
        const delta = height - state.applied;

        if (delta) {
            const scrollTop = element.scrollTop;
            element.style.paddingTop = `${state.basePadding + height}px`;
            element.scrollTop = Math.max(0, scrollTop + delta);
            state.applied = height;
        }

        if (!liftedElement) {
            element.classList.remove(FOLLOW_CLASS);
            element.style.removeProperty("padding-top");
            restoreTransitionLater(element);
            followers.delete(element);
        }
    });
}

function setKeyboardHeight(height) {
    keyboardHeight = height;
    root.style.setProperty("--keyboard-height", `${height}px`);
    root.classList.toggle("keyboard-open", height > 0);
    syncFollowers();
}

function measureKeyboard() {
    return Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
}

function commitHeight() {
    const height = pendingHeight >= MIN_KEYBOARD_HEIGHT ? pendingHeight : 0;

    if (height) {
        lastMeasuredHeight = height;
        setKeyboardHeight(height);
        return;
    }

    setKeyboardHeight(0);
    releaseLift();
}

function handleViewportResize() {
    pendingHeight = measureKeyboard();
    clearTimeout(stabilityTimer);
    stabilityTimer = setTimeout(commitHeight, STABILITY_MS);
}

function findLiftTarget(field) {
    return field.closest("[data-keyboard-lift]");
}

function lockScroll() {
    if (lockedScrollY === null) lockedScrollY = window.scrollY;
}

function unlockScroll() {
    lockedScrollY = null;
}

function handleWindowScroll() {
    if (lockedScrollY === null || !liftedElement) return;
    if (window.scrollY !== lockedScrollY) window.scrollTo(0, lockedScrollY);
}

function applyLift(target, field) {
    if (liftedElement && liftedElement !== target) {
        liftedElement.classList.remove(LIFT_CLASS);
        restoreTransitionLater(liftedElement);
    }

    addKeyboardTransition(target);

    if (field) {
        const fieldTop = field.getBoundingClientRect().top;
        const currentLift = target.classList.contains(LIFT_CLASS)
            ? Math.abs(parseFloat(getComputedStyle(target).translate.split(" ")[1]) || 0)
            : 0;
        const maxLift = Math.max(0, Math.round(fieldTop + currentLift - TOP_MARGIN));
        target.style.setProperty("--keyboard-lift-max", `${maxLift}px`);
    }

    liftedElement = target;
    target.classList.add(LIFT_CLASS);
    lockScroll();
    syncFollowers();
}

function releaseLift() {
    if (liftedElement) {
        liftedElement.classList.remove(LIFT_CLASS);
        liftedElement.style.removeProperty("--keyboard-lift-max");
        restoreTransitionLater(liftedElement);
    }

    liftedElement = null;
    unlockScroll();
    syncFollowers();
}

export function triggerPreLift(target, field) {
    if (!target) return;

    applyLift(target, field);

    if (lastMeasuredHeight && !keyboardHeight) setKeyboardHeight(lastMeasuredHeight);
}

function handleTouchStart(event) {
    const field = event.target.closest?.(FIELD_SELECTOR);

    if (!field || field.disabled || field.readOnly || document.activeElement === field) return;

    const target = findLiftTarget(field);
    if (!target) return;

    event.preventDefault();
    triggerPreLift(target, field);
    field.focus({ preventScroll: true });
}

function handleMouseDown(event) {
    if (!liftedElement?.contains(event.target)) return;
    if (event.target.closest(FIELD_SELECTOR)) return;
    if (!event.target.closest("button, [role=button], a, label")) return;

    event.preventDefault();
}

function handleFocusOut(event) {
    const next = event.relatedTarget;

    if (next && liftedElement?.contains(next)) return;

    setTimeout(() => {
        const active = document.activeElement;

        if (active && active.matches?.(FIELD_SELECTOR) && liftedElement?.contains(active)) return;
        if (!keyboardHeight) releaseLift();
    }, STABILITY_MS * 4);
}

if (isIOS && viewport) {
    root.classList.add("ios-keyboard");
    setKeyboardHeight(0);

    viewport.addEventListener("resize", handleViewportResize);
    viewport.addEventListener("scroll", handleViewportResize);
    window.addEventListener("scroll", handleWindowScroll, { passive: true });
    document.addEventListener("touchstart", handleTouchStart, { capture: true, passive: false });
    document.addEventListener("mousedown", handleMouseDown, { capture: true });
    document.addEventListener("focusout", handleFocusOut);
}
