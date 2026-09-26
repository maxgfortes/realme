const commentsArea = document.getElementById('commentsArea');
const commentsOverlay = document.getElementById('commentsOverlay');
const commentsContainer = document.getElementById('commentsContainer');

const openCommentsBtn = document.getElementById('openComments');

function openComments(){
    commentsArea.classList.add('active');
    commentsOverlay.classList.add('active');
    commentsContainer.classList.add('active');
    document.body.classList.add('scroll-locked');
}

function closeComments(){
    commentsArea.classList.remove('active');
    commentsOverlay.classList.remove('active');
    commentsContainer.classList.remove('active');
    document.body.classList.add('scroll-locked');
}

openCommentsBtn.addEventListener('click', openComments);
commentsOverlay.addEventListener('click', closeComments);