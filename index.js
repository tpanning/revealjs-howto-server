var config      = require('./config.js');
var express		= require('express');
var fs			= require('fs');
var io			= require('socket.io');
var crypto		= require('crypto');
var bodyParser  = require('body-parser');

var app			= express.createServer();
var staticDir	= express.static;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));

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
            if (!votes.hasOwnProperty(socket.id)) {
                votes[socket.id] = {};
            }
            // Store the vote
            votes[socket.id][key] = 1;
        }
        emitVotes();
    });
});

function emitVotes() {
    var tally = {};
    for (var socketId in votes) {
        for (var voteId in votes[socketId]) {
            tally[voteId] = tally[voteId] ? tally[voteId]+1 : 1;
        }
    }
    console.log(tally);

    // Notify everyone of the new vote totals, including the one that sent the vote
    io.emit('votes', tally);
}

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

app.post('/sms', function(req, res) {
    console.log('Got a POST request');
    if (req.body.AccountSid === config.twilio.accountSid) {
        if (!votes.hasOwnProperty(req.body.From)) {
            votes[req.body.From] = {}
        }
        res.send('Received');
        // Split on every non-alphanumeric character, so the only thing left should be alphanumeric
        // characters (and possibly empty strings at the beginning and end).
        var items = req.body.Body.split(/\W+/);
        console.log('Votes: ' + items);
        for (var i in items) {
            var item = items[i];
            if (item !== "") {
                var voteKey = item.toLowerCase();
                votes[req.body.From][voteKey] = 1;
            }
        }
        emitVotes();
    } else {
        res.send('Rejected');
    }
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
