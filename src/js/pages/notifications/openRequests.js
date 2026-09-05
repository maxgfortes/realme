const requestsArea = document.getElementById('requestsArea');
const closeRequestsArea = document.getElementById('closeRequestsArea');
const openRequestsArea = document.getElementById('openRequestsArea');
const notificationsContainer = document.getElementById('notificationsContainer');


function openRequestsTab(){
    requestsArea.classList.add('active');
    notificationsContainer.classList.add('hidden');
}

function closeRequestsTab(){
    requestsArea.classList.remove('active');
    notificationsContainer.classList.remove('hidden');
}

openRequestsArea.addEventListener('click', openRequestsTab);
closeRequestsArea.addEventListener('click', closeRequestsTab);