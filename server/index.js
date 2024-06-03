import express from 'express';
import logger from 'morgan';
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';
import path from 'path';
import { fileURLToPath } from 'url';

import { Server } from 'socket.io';
import { createServer } from 'node:http';
import { generateNewColor } from './utils.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

dotenv.config()

const PORT = process.env.PORT ?? 3000;

const app = express();

// Set up rate limiter: maximum of twenty requests per minute
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20,
});
// Apply rate limiter to all requests
app.use(limiter);


// TO LOAD CSS 
const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(path.dirname(__filename)); // get the name of the directory
app.use(express.static(__dirname + '/client'));

const server = createServer(app);
const io = new Server(server, {
  connectionStateRecovery: {}
});

const db = createClient({
  url: "libsql://my-db-ebregains.turso.io",
  authToken: process.env.TURSO_TOKEN,
})

await db.execute(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    username TEXT,
    timestamp DATE DEFAULT (date())
  )
`)

const connectedUsers = new Map();

io.on('connection', async (socket) => {
  socket.handshake.auth.login_timestamp = new Date();
  socket.handshake.auth.color = generateNewColor();
  console.log(socket.handshake.auth.login_timestamp);

  connectedUsers.set(socket.handshake.auth.username, socket.handshake.auth.color)
  console.log(connectedUsers.get(socket.handshake.auth.username));

  io.emit('users_list', [...connectedUsers]);

  console.log('a user has connected');

  socket.on('disconnect', () => {
    connectedUsers.delete(socket.handshake.auth.username)
    io.emit('users_list', [...connectedUsers])
    console.log("a user has disconnected");
  })

  socket.on('chat message', async (msg) => {
    const username = socket.handshake.auth.username ?? 'Anonimo';
    const date = new Date();
    const timestamp = date.toLocaleString();
    let result
    try {
      result = await db.execute({
        sql: `INSERT INTO messages(content, username, timestamp) VALUES( :msg, :username, :timestamp )`,
        args: { msg, username, timestamp }
      });
    } catch (e) {
      console.error(e);
      return;
    }

    const color = connectedUsers.get(username) ?? "#999";
    io.emit('chat message', msg, result.lastInsertRowid.toString(), username, timestamp, color)
  })

  if (!socket.recovered) {
    try {
      const results = await db.execute({
        sql: 'SELECT id, content, username, timestamp FROM messages WHERE id > ?',
        args: [socket.handshake.auth.serverOffset ?? 0]
      })
      results.rows.forEach(row => {
        const color = connectedUsers.get(row.username) ?? '#AAA';
        socket.emit('chat message', row.content, row.id.toString(), row.username, row.timestamp, color)
      })

    } catch (e) {
      console.log(e);
    }
  }
})

app.use(logger('dev'));

app.use('/', (req, res, next) => {
  if (connectedUsers.size < 3) {
    next()
  }
  else {
    res.redirect('/waitlist')
    next()
  }
})

app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/client/index.html')
})

// app.get('/styles/css'), (req, res) => {
//   res.sendFile(process.cwd() + '/client/styles.css')
// }

server.listen(PORT, () => {
  console.log(`Server listening on localhost:${PORT} `);
})