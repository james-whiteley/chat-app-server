const app = require('express')();
const http = require('http').createServer(app);
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const io = require('socket.io')(http, { cookie: true });
const redis = require('async-redis');

const SALT_ROUNDS = 10;

// Create redis client
const redisClient = redis.createClient(6379, "localhost");

const session = require("express-session")({
    secret: "my-secret",
    resave: true,
    saveUninitialized: true,
		cookie: { secure: false }
});
const sharedsession = require("express-socket.io-session");
 
// Use express-session middleware for express
app.use(session);

// Add support for JSON encoded request bodies
app.use(bodyParser.json());
 
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

app.post('/users', async (req, res) => {
	var name = req.body.name;
	var email = req.body.email;
	var password = req.body.password;

	// Check if user already exists
	let user = await redisClient.hgetall(`user:${email}`);

	if (user) {
		res.sendStatus(409);
		return false;
	}

	try {
		// Generate salt to hash password
		let salt = await bcrypt.genSalt(SALT_ROUNDS);

		// Hash password before pushing to database
		let hashedPassword = await bcrypt.hash(password, salt);

		// Save user to redis
		await redisClient.hset(`user:${email}`, ["name", name, "password", hashedPassword]);

		res.sendStatus(201);
	} catch (error) {
		res.sendStatus(400);
	}

	return;
});

http.listen(3001, () => {
  console.log('listening on *:3001');
});