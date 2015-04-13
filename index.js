var express		= require('express');
var fs			= require('fs');
var io			= require('socket.io');
var crypto		= require('crypto');

var app			= express.createServer();
var staticDir	= express.static;

io				= io.listen(app);

var opts = {
	port: 1948,
	baseDir : __dirname + '/../../'
};

var votes = {};

io.sockets.on('connection', function(socket) {
    // From the master presentation when a slide changes
	socket.on('slidechanged', function(slideData) {
		if (typeof slideData.secret == 'undefined' || slideData.secret == null || slideData.secret === '') return;
		if (createHash(slideData.secret) === slideData.socketId) {
			slideData.secret = null;
            // So that client presentations know to update
			socket.broadcast.emit(slideData.socketId, slideData);
		};
	});

    // Receive a vote from any client
    socket.on('vote', function(voteData) {
        var keys = Object.keys(voteData);
        var keyInd;
        for (keyInd in keys) {
            var key = keys[keyInd];
            if (key === 'socketId') {
                continue;
            }
            if (!votes.hasOwnProperty(key)) {
                votes[key] = 0;
            }
            // Store the vote
            votes[key]++;
        }
        console.log(votes);
        // Notify everyone of the new vote totals, including the one that sent the vote
        io.emit('votes', votes);
    });
});

app.configure(function() {
	[ 'css', 'js', 'plugin', 'lib' ].forEach(function(dir) {
		app.use('/' + dir, staticDir(opts.baseDir + dir));
	});
});

app.get("/", function(req, res) {
	res.writeHead(200, {'Content-Type': 'text/html'});
	fs.createReadStream(opts.baseDir + '/index.html').pipe(res);
});

app.get("/token", function(req,res) {
	var ts = new Date().getTime();
	var rand = Math.floor(Math.random()*9999999);
	var secret = ts.toString() + rand.toString();
	res.send({secret: secret, socketId: createHash(secret)});
});

var createHash = function(secret) {
	var cipher = crypto.createCipher('blowfish', secret);
	return(cipher.final('hex'));
};

// Actually listen
app.listen(opts.port || null);

var brown = '\033[33m',
	green = '\033[32m',
	reset = '\033[0m';

console.log( brown + "reveal.js:" + reset + " Multiplex running on port " + green + opts.port + reset );
