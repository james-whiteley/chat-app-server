var app = require('express')();
var http = require('http').createServer(app);
var io = require('socket.io')(http, { cookie: true });

var session = require("express-session")({
    secret: "my-secret",
    resave: true,
    saveUninitialized: true,
		cookie: { secure: false }
});
var sharedsession = require("express-socket.io-session");
 
// Use express-session middleware for express
app.use(session);
 
// Use shared session middleware for socket.io
// setting autoSave:true
io.use(sharedsession(session, {
    autoSave:true
}));

io.on('connection', function(socket) {
	var usernameSet = false;

	socket.on('set username', function(username){
		if (usernameSet) return;

		socket.username = username;
		usernameSet = true;

		emitOnlineUserList();
  });

	socket.on('join room', function(room) {
		socket.join(room);

		// Save room to session so clients know where to send messages
		socket.handshake.session.room = room;
  	socket.handshake.session.save();
	});

	socket.on('message', function(messageObject) {
		socket.in(messageObject.room).emit('message', { message: messageObject.message, timestamp: messageObject.timestamp, room: socket.handshake.session.room });
	})

	socket.on('get online users', function() {
		emitOnlineUserList();
	});
});

function emitOnlineUserList() {
	io.of('/').clients((error, clients) => {
		if (error) throw error;
		
		let onlineUsers = [];
		for (var i=0; i < clients.length; i++) {	
			let client = io.of('/').connected[clients[i]];
			
			onlineUsers.push({
				username: client.username,
				room: client.handshake.session.room
			});
		}
		
		io.of('/').emit('online users', onlineUsers);
	});
}

http.listen(3001, function(){
  console.log('listening on *:3001');
});