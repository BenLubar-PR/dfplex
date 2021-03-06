/*
 * dfplex.js
 * Copyright (c) 2014 mifki, ISC license.
 */

/*jslint browser:true */

var params = getParams();
// TODO: tag colors
var colors = [
	32, 39, 49,
	0, 106, 255,
	68, 184, 57,
	114, 156, 251,
	212, 54, 85,
	176, 50, 255,
	217, 118, 65,
	170, 196, 178,
	128, 151, 156,
	48, 165, 255,
	144, 255, 79,
	168, 212, 255,
	255, 82, 82,
	255, 107, 255,
	255, 232, 102,
	255, 250, 232
];

var MAX_FPS = 20;

var port = params.port;
var protocol = params.protocol;
var tileSet = params.tiles;
var textSet = params.text;
var ovrSet = params.overworld;
var colorscheme = params.colors;
var nick = params.nick;
var secret = params.secret;

var wsUri = 'ws://' + location.hostname + ':' + port +
	'/' + encodeURIComponent(nick) +
	'/' + encodeURIComponent(secret);
console.log(wsUri);
var active = false;
var lastFrame = 0;

var tilewh = 16; // TODO: remove vars
var tilew  = 16;
var tileh  = 16;

var cmd = {
	"update":  110,
	"sendKey": 111,
	"connect": 115,
	"resize": 117,
	"requestTurn": 116
};

// Converts integer value in seconds to a time string, HH:MM:SS
function toTime(n) {
	var h = Math.floor(n / 60  / 60);
	var m = Math.floor(n / 60) % 60;
	var s = n % 60;
	return ("0" + h).slice(-2) + ":" +
	       ("0" + m).slice(-2) + ":" +
	       ("0" + s).slice(-2);
}

function plural(n, unit)
{
	return n + " " + unit + (n === 1 ? "" : "s");
}

// Converts an integer value in ticks to the dwarven calendar
function toGameTime(n) {
	var years = Math.floor(n / 12 / 28 / 1200);
	var months = Math.floor(n / 28 / 1200) % 12;
	var days = Math.floor(n / 1200) % 28;
	var ticks = n % 1200;

	var times = [];
	if (years > 0) {
		times.push(plural(years, "year"));
	}
	if (months > 0) {
		times.push(plural(months, "month"));
	} else if (days > 0) {
		times.push(plural(days, "day"));
	} else {
		times.push(plural(ticks, "tick"));
	}

	return times.join(", ");
}

function setStats(userCount, loadframes) {
	var u = document.getElementById('user-count');
	// var t = document.getElementById('time-left');
	u.innerHTML = String(userCount) + " <i class='fa fa-users'></i> ";
}

function setDebug(debugInfo) {
	var c = document.getElementById('trace-container');
	var u = document.getElementById('trace');
	if (debugInfo == "")
	{
		u.innerHTML = "";
		//c.setAttribute("style","width:0px");
	}
	else
	{
		var ih = "<pre>" + debugInfo + "</pre>";
		if (u.innerHTML != ih)
		{
			u.innerHTML = ih;
		}
		//c.setAttribute("style","width:200px");
	}
}

function setStatus(text, color, onclick) {
	var m = document.getElementById('message');
	if (m.innerHTML != text)
	{
		m.innerHTML = text;
	}
	var st = m.parentNode;
	if (onclick) {
		st.addEventListener('click', onclick);
	}
	st.style.backgroundColor = color;
}

function connect() {
	setStatus('Connecting...', 'orange');
	websocket = new WebSocket(wsUri, [protocol, 'DFPlex-invalid']);
	websocket.binaryType = 'arraybuffer';
	websocket.onopen  = onOpen;
	websocket.onclose = onClose;
	websocket.onerror = onError;
}

function onOpen(evt) {
	setStatus('Connected, initializing...', 'orange');

	websocket.send(new Uint8Array([cmd.connect]));

	websocket.send(new Uint8Array([cmd.update]));
	websocket.onmessage = onMessage;
}

var isError = false;
function onClose(evt) {
	console.log("Disconnect code #" + evt.code + ", reason: " + evt.reason);
	console.log(isError);
	if (isError) {
		isError = false;
		setStatus('Connection Error. Click to retry', 'red', connect);
	} else if (evt.reason) {
		setStatus(evt.reason + ' Click to try again.', 'red', connect);
	} else {
		setStatus('Unknown disconnect: Check the console (Ctrl-Shift-J), then click to reconnect.', 'red', connect);
	}
}

function onError(ev) {
	console.log("error triggered.");
	isError = true;
}

function requestTurn() {
	websocket.send(new Uint8Array([cmd.requestTurn]));
}

function renderQueueStatus(s) {
	var display = s.currentPlayer || "Connected.";
	active = true;
	var colour = 'yellow';
	if (display == "Connected." || display.startsWith("(MP)"))
		colour = 'green'
	if (display.startsWith("(UP)"))
		colour = 'grey'
	setStatus(display, colour, requestTurn);
	setStats(s.playerCount, s.load);
	setDebug(s.debugInfo);
}

// TODO: document, split
function renderUpdate(ctx, data, offset) {
	var t = []; // text tile indices
	var ovr = []; // overworld tile indices
	var k;
	var x;
	var y;
	var s;
	var bg;
	var fg;
	var tilew2 = tilew * tilew;
	var tileh2 = tileh * tileh;

	for (k = offset; k < data.length; k += 5) {
		x = data[k + 0];
		y = data[k + 1];

		s = data[k + 2];
		bg = data[k + 3] % tilew;
		fg = data[k + 4];

		var bg_x = ((bg % 4) * tilew2) + 15 * tilew;
		var bg_y = (Math.floor(bg / 4) * tileh2) + 15 * tileh;
		ctx.drawImage(
			// source image (tileset)
			cd,
			// source rect
			bg_x, bg_y, tilew, tileh,
			// dest rect
			x * tilew, y * tileh, tilew, tileh
		);

		// 6th bit: text. 7th bit: overworld
		if ((data[k + 3] & 64)) {
			t.push(k);
			continue;
		}
		if ((data[k + 3] & 128)) {
			ovr.push(k);
			continue;
		}
		var fg_x = (s % 16) * tilew + ((fg % 4) * tilew2);
		var fg_y = Math.floor(s / 16) * tileh + (Math.floor(fg / 4) * tileh2);
		ctx.drawImage(
			// source image (tileset)
			cd,
			// source rect
			fg_x, fg_y, tilew, tileh,
			// dest rect
			x * tilew, y * tileh, tilew, tileh
		);
	}

	// draw text
	for (var m = 0; m < t.length; m++) {
		k = t[m];
		x = data[k + 0];
		y = data[k + 1];

		s = data[k + 2];
		bg = data[k + 3];
		fg = data[k + 4];

		var i = (s % 16) * tilew + ((fg % 4) * tilew2);
		var j = Math.floor(s / 16) * tileh + (Math.floor(fg / 4) * tileh2);
		ctx.drawImage(
			// source image (textset)
			ct,
			// source rect
			i, j, tilew, tileh,
			// dest rect
			x * tilew, y * tileh, tilew, tileh
		);
	}
	
	for (var m = 0; m < ovr.length; m++) {
		k = ovr[m];
		x = data[k + 0];
		y = data[k + 1];

		s = data[k + 2];
		bg = data[k + 3];
		fg = data[k + 4];

		var i = (s % 16) * tilew + ((fg % 4) * tilew2);
		var j = Math.floor(s / 16) * tileh + (Math.floor(fg / 4) * tileh2);
		ctx.drawImage(
			// source image (textset)
			covr,
			// source rect
			i, j, tilew, tileh,
			// dest rect
			x * tilew, y * tileh, tilew, tileh
		);
	}
}

function updateCanvasDOM() {
	canvas.style.width  = ""
	canvas.style.height  = ""
	
	var maxw = canvas.parentNode.offsetWidth;
    var maxh = canvas.parentNode.offsetHeight - document.getElementById('status-id').offsetHeight;
	
	console.log(canvas.width + "x" + canvas.height + " in " + maxw + "x" + maxh);
		
	if (maxw >= canvas.width && maxh >= canvas.height) {
		canvas.style.left = (maxw - canvas.width) / 2 + "px";
		return
	}
		
	var aspectRatio = canvas.width / canvas.height;
	var constrainWidth = (maxw / maxh < aspectRatio);
	
	console.log("constrainWidth: " + constrainWidth)
	canvas.style.left = "0"
	
	if (constrainWidth) {
	   canvas.style.width  = "100%";
	   canvas.style.height = ""
	} else {
	   canvas.style.width  = "";
	   canvas.style.height = "100%";
   }
}

function onMessage(evt) {
	var data = new Uint8Array(evt.data);

	var ctx = canvas.getContext('2d');
	if (data[0] === cmd.update) {
		if (stats) { stats.begin(); }
		var gameStatus = {};
		gameStatus.playerCount = data[1] & 127;

		gameStatus.isActive = (data[2] & 1) !== 0;
		
		// removed
		gameStatus.isNoPlayer = false;
		gameStatus.ingameTime = false;
		gameStatus.timeLeft = -1;
		
		// # of frames overall
		gameStatus.load =
			(data[3]<<0) |
			(data[4]<<8) |
			(data[5]<<16) |
			(data[6]<<24);

		var neww = data[7] * tilew;
		var newh = data[8] * tileh;
		if (neww != canvas.width || newh != canvas.height) {
			canvas.width = neww;
			canvas.height = newh;
			
			updateCanvasDOM()
		}

		var nickSize = data[9];
		// this only works because we know the input is uri-encoded ascii
		var activeNick = "";
		for (var i = 10; (i < 10 + nickSize) && data[i] !== 0; i++) {
			activeNick += String.fromCharCode(data[i]);
		}
		gameStatus.currentPlayer = decodeURIComponent(activeNick);
		
		var offset = 10 + nickSize;
		
		var debugInfoSize = data[offset] | (data[offset + 1] << 8);
		offset += 2;
		var debugInfo = ""
		for (var i = 0; i < debugInfoSize && data[offset + i] !== 0; ++i) {
			debugInfo += String.fromCharCode(data[offset + i]);
		}
		offset += debugInfoSize;
		gameStatus.debugInfo = debugInfo;

		renderQueueStatus(gameStatus);
		renderUpdate(ctx, data, offset);

		var now = performance.now();
		var nextFrame = (1000 / MAX_FPS) - (now - lastFrame);
		if (nextFrame < 4) {
			websocket.send(new Uint8Array([cmd.update]));
		} else {
			setTimeout(function() {
				websocket.send(new Uint8Array([cmd.update]));
			}, nextFrame);
		}
		lastFrame = performance.now();
		if (stats) { stats.end(); }
	}
}

// FIXME: tilewh-ify
function colorize(img, cnv) {
	var ctx3 = cnv.getContext('2d');

	for (var j = 0; j < 4; j++) {
		for (var i = 0; i < 4; i++) {
			var c = j * 4 + i;

			ctx3.drawImage(img, i * 256, j * 256);

			var idata = ctx3.getImageData(i * 256, j * 256, 256, 256);
			var pixels = idata.data;

			for (var u = 0, len = pixels.length; u < len; u += 4) {
				pixels[u] = pixels[u] * (colors[c * 3 + 0] / 255);
				pixels[u + 1] = pixels[u + 1] * (colors[c * 3 + 1] / 255);
				pixels[u + 2] = pixels[u + 2] * (colors[c * 3 + 2] / 255);
			}
			ctx3.putImageData(idata, i * 256, j * 256);

			ctx3.fillStyle = 'rgb(' +
					colors[c * 3 + 0] + ',' +
					colors[c * 3 + 1] + ',' +
					colors[c * 3 + 2] + ')';

			ctx3.fillRect(i * 256 + 16 * 15, j * 256 + 16 * 15, 16, 16);
		}
	}
}

// Crazy closures, Batman, what's going on here?
var make_loader = function() {
	var loading = 0;
	return function() {
		loading += 1;
		return function() {
			loading -= 1;
			if (loading <= 0) {
				init();
			}
		};
	};
}();

var cd, ct, covr;
function init() {
	document.body.style.backgroundColor =
		'rgb(' + colors[0] + ',' + colors[1] + ',' + colors[2] + ')';

	cd = document.createElement('canvas');
	cd.width = cd.height = 1024;
	colorize(ts, cd);

	ct = document.createElement('canvas');
	ct.width = ct.height = 1024;
	colorize(tt, ct);
	
	covr = document.createElement('canvas');
	covr.width = covr.height = 1024;
	colorize(tovr, covr);

	lastFrame = performance.now();

	connect();
}

var stats;
if (params.show_fps) {
	stats = new Stats();
	document.body.appendChild(stats.domElement);
	stats.domElement.style.position = "absolute";
	stats.domElement.style.bottom = "0";
	stats.domElement.style.left   = "0";
}

function getFolder(path) {
	return path.substring(0, path.lastIndexOf('/') + 1);
}

var root = getFolder(window.location.pathname);

// tileset
var ts = document.createElement('img');
ts.src =  root + "art/" + tileSet;
ts.onload = make_loader();

// textset
var tt = document.createElement('img');
tt.src = root + "art/" + textSet;
tt.onload = make_loader();

// overworldset
var tovr = document.createElement('img');
tovr.src = root + "art/" + ovrSet;
tovr.onload = make_loader();

if (colorscheme !== undefined) {
	var colorReq = new XMLHttpRequest();
	var colorLoader = make_loader();
	colorReq.onload = function() {
		colors = JSON.parse(this.responseText);
		colorLoader();
	};
	colorReq.open("get", root + "colors/" + colorscheme);
	colorReq.send();
}


var canvas = document.getElementById('myCanvas');
canvas.style.position="absolute"
canvas.style.left="0"
canvas.style.top="0"
document.onkeydown = function(ev) {
	if (!active)
		return;

	if (ev.keyCode === 18 ||
	    ev.keyCode === 17 ||
	    ev.keyCode === 16) {
		return;
	}

    var mod = ev.shiftKey | (ev.ctrlKey << 1) | (ev.altKey << 2);
    var charCode = 0;
    if (ev.key.length == 1){
      charCode = ev.key.charCodeAt(0)
    }
    var data = new Uint8Array([cmd.sendKey, ev.keyCode, charCode, mod]);
    logKeyCode(ev);
    websocket.send(data);
    ev.preventDefault();
};

function udpateScreenSize() {
	var maxw = canvas.parentNode.offsetWidth;
	var maxh = canvas.parentNode.offsetHeight - document.getElementById('status-id').offsetHeight;
	var gridw = Math.min(Math.floor(maxw / tilew), 255);
	// need to subtract 1, likely the header.
	var gridh = Math.min(Math.floor(maxh / tileh), 255);
	
	// request resize from server.
	var data = new Uint8Array([cmd.resize, gridw, gridh]);
	
	// TODO: only send if screen size changed.
	websocket.send(data);
}

window.onresize = udpateScreenSize;
window.onload   = udpateScreenSize;

// this is fine.
setTimeout(udpateScreenSize, 10);
setTimeout(udpateScreenSize, 100);
setTimeout(udpateScreenSize, 200);
setTimeout(udpateScreenSize, 400);
setTimeout(udpateScreenSize, 800);
setInterval(udpateScreenSize, 3000);