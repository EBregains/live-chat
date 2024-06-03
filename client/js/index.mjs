import { createRequire } from "module";
const require = createRequire(import.meta.url);
const io = require('https://cdn.socket.io/4.7.5/socket.io.esm.min.js')

const getUsername = async () => {
  const username = localStorage.getItem('username')
  if (username) {
    return username;
  }

  const res = await fetch('https://random-data-api.com/api/users/random_user')
  const { username: randomUsername } = await res.json();

  localStorage.setItem('username', randomUsername)
  return randomUsername;
}

let session_username;
(async () => {
  session_username = await getUsername();
})();

const socket = io({
  auth: {
    serverOffset: 0,
    username: session_username,
    login_timestamp: 0,
    color: 0,
  }
});

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const users_list = document.getElementById('users_list');
const warn_new_messages = document.getElementById('warn_new_messages') // To scroll all the way up id the user is reading older messages

socket.on('users_list', (connectedUsers) => {
  let item = ''
  connectedUsers.map(([name, color]) => {
    item += `<li>
          <p style='color: ${color};'>
            ${name}
          </p>
          </li>
        `
  })
  users_list.innerHTML = item;
})

socket.on('chat message', (msg, serverOffset, username, timestamp, color) => {
  const align = username === session_username ? "end" : "start";
  const item = `<li style='width: 80%; align-self: ${align};'>
        <p>${msg}</p>
        <div style='display: flex; margin-top: 2px;'>
          <small style='color: ${color};'>${username}</small>
          <small style='color: #666; flex: 1; text-align: right;'>${timestamp}</small>
          <div>
        </li>`;
  messages.insertAdjacentHTML('afterbegin', item)
  socket.auth.serverOffset = serverOffset;
  // scroll to bottom automaticly

  if (messages.scrollTop > messages.offsetHeight * 1.5) {
    warn_new_messages.style.visibility = 'visible';
  } else {
    messages.scrollTop = 0;
  }
})

messages.addEventListener('scrollend', () => {
  // The +twenty is a 20px safety range from the bottom
  if (messages.scrollTop < 20)
    warn_new_messages.style.visibility = 'hidden';
})

form.addEventListener('submit', (e) => {
  e.preventDefault()

  if (input.value) {
    socket.emit('chat message', input.value);
    input.value = "";
    messages.scrollTop = 0;
  }
})

warn_new_messages.addEventListener('click', () => {
  messages.scrollTop = 0;
  warn_new_messages.style.visibility = 'hidden';
})
