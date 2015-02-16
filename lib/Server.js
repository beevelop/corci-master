/**
 * @name Server
 * @version 0.1.0
 * @fileoverview Handles the servers BuildServer
 */

var libs = require('corci-libs');
var Common = libs.Common;
var Logger = libs.Logger;

var Build = libs.models.Build;
var BuildQueue = libs.models.BuildQueue;

var fs = Common.fsExtra;

var ServerSockets = require('./ServerSockets');
var Client = require('./sockets/Client');
var Agent = require('./sockets/Agent');
var path = require('path');
var express = require('express');
var http = require('http');
var io = require('socket.io');

/**
 * Constructor of server
 * @class
 * @param {Object} conf - configuration (console options)
 */
function Server(conf) {
    this.conf = conf;
    this._location = path.resolve(conf.location);

    this._socket = null;

    this.monitors = [];

    this._queue = new BuildQueue();
    this._buildRequests = [];

    Logger.addLevels({
        server: 3,
        build: 2
    }, {
        server: 'blue',
        build: 'yellow'
    });
}

Server.prototype.getLocation = function () {
    return this._location;
};

Server.prototype.getSocket = function () {
    return this._socket;
};

Server.prototype.addAgent = function (agent) {
    this._queue.addTarget(agent);
    //@todo: notify monitors
};

Server.prototype.removeAgent = function (agent) {
    this._queue.removeTarget(agent);
    //@todo: notify monitors
};

Server.prototype.getSupportedPlatforms = function () {
    return this._queue.getSupportedPlatforms();
};

Server.prototype.addBuild = function (build) {
    this._queue.add(build);
};

Server.prototype.getBuild = function (BID) {
    return this._queue.getBuild(BID);
};

Server.prototype.getBuildRequest = function (BRID) {
    return this._buildRequests.findOne(function (breq) {
        return breq.getBRID() === BRID;
    });
};

Server.prototype.addBuildRequest = function (breq) {
    this._buildRequests.push(breq);

    //@todo: listener on status event for www notify
    //@todo: listen on Breq's builds statuses too
};

/**
 * Initialise the Server
 *  and bind the sockets (Agent, Client, WWW)
 *  and begin reading the previous builds afterwards
 */
Server.prototype.init = function () {
    var conf = this.conf;

    var buildserver = this.start(conf.protocol);
    this._socket = io(buildserver);

    // @todo: ServerSockets to individual Sockets (Client, Agent, Monitor)
    var _this = this;
    this.clientSocket = this.getSocket().of('client');
    this.clientSocket.on('connection', function (socket) {
        new Client(_this, socket);
    });

    this.agentSocket = this.getSocket().of('agent');
    this.agentSocket.on('connection', function (socket) {
        new Agent(_this, socket);
    });


    this.monitors._socket = ServerSockets.wwwsSocket.call(this);

    buildserver.listen(conf.port, conf.host, function () {
        var port = buildserver.address().port;
        var host = buildserver.address().address;
        Logger.info('Master is hosted at {0}://{1}{2}'.format(
                conf.protocol, host,
                port === 80 ? '' : ':' + port)
        );
    });

    //multiGlob(this.getLocation() + '/*/build.json', this.readPreviousBuilds.bind(this));
};

/**
 * Initiates the http server with express
 */
Server.prototype.start = function (protocol, key, cert) {
    var buildServerApp = express();
    var options = {};
    if (protocol.indexOf('https') > -1) {
        options = {
            key: fs.readFileSync(key),
            cert: fs.readFileSync(cert)
        };
        return http.createServer(options, buildServerApp);
    }

    return http.createServer(buildServerApp);
};

//@todo: function to notify all monitors (nsp.emit?)
Server.prototype.notifyStatusAllWWWs = function (kind, what, obj) {
    this.monitors._socket.emit('news', arguments.length === 1 ? kind : {
        kind: kind,
        what: what,
        obj: obj
    });
};

module.exports = Server;