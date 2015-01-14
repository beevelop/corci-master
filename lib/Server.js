/**
 * @name Server
 * @version 0.1
 * @fileoverview Handles the servers BuildServer
 */

var Build = require('corci-libs').Build;
var Msg = require('corci-libs').Msg;
var fs = require('corci-libs').Common.fsExtra;
var multiGlob = require('corci-libs').Common.multiGlob;
var async = require('corci-libs').Common.async;

var ServerSockets = require('./ServerSockets');
var util = require('util');
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
    console.log(conf);
    this.conf = conf;

    this.agents = {};
    this.clients = {};
    this.wwws = {};

    this.builds = [];
    this.buildsQueue = [];
    this.platforms = {};
    this.logs = [];

    this.location = path.resolve(conf.location);
}

/**
 * Reads + parses the found builds and stores the generated {@link Build} objects
 * @param {Object}  [err]   - error object (globbing failed) or null
 * @param {Object}   builds - array of found build.json files
 */
Server.prototype.readPreviousBuilds = function (err, builds) {
    var _self = this;

    builds.sort();
    var loadedBuilds = [];
    var orderedBuilds = {};
    async.each(builds, function (buildPath, cb) {
        /* Instantiate Build object from JSON */
        fs.readFile(buildPath, function (err, data) {
            var buildJSON;
            try {
                buildJSON = JSON.parse(data);
            } catch (e) {
                return cb(e);
            }
            var build = new Build(buildJSON);
            loadedBuilds.push(build);
            orderedBuilds[buildPath] = build;
            cb();
        });
    }, function (err) {
        builds.forEach(function (buildPath) {
            var build = orderedBuilds[buildPath];
            if (build) {
                _self.builds.push(build);
                _self.builds[build.id] = build;
                if (build.platforms) {
                    build.platforms.forEach(function (platformBuild) {
                        _self.builds[platformBuild.id] = platformBuild;
                    });
                }
            }
        });

        var _msg;
        if (loadedBuilds.length) {
            _msg = '{2} previous build(s) were successfully read from the disk';
            _self.log(new Msg(null, null, 'S', Msg.debug, _msg, loadedBuilds.length));
        }
        if (err) {
            _msg = 'an error occurred while trying to read previous build(s) from the disk\n{2}';
            _self.log(new Msg(null, null, 'S', Msg.debug, _msg, err));
        }
    });
};

/**
 * Initialise the Server
 *  and bind the sockets (Agent, Client, WWW)
 *  and begin reading the previous builds afterwards
 */
Server.prototype.init = function () {
    var conf = this.conf;

    var buildserver = this.start(conf.protocol);
    this.socket = this.getSocket(buildserver);
    this.socket.set('transports', ['websocket', 'polling']); // enable all transports

    this.agents.socket = ServerSockets.agentsSocket.call(this);
    this.clients.socket = ServerSockets.clientsSocket.call(this);
    this.wwws.socket = ServerSockets.wwwsSocket.call(this);

    this.processQueueInterval = setInterval(this.processQueue.bind(this), 1000);

    buildserver.listen(conf.port, conf.host, function () {
        console.log('Master is hosted at {0}://{1}{2}/\n'.format(
                conf.protocol, conf.host,
                conf.port === 80 ? '' : ':' + conf.port)
        );

        console.log(buildserver.address());
    });

    multiGlob.glob(this.location + '/*/build.json', this.readPreviousBuilds.bind(this));
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

/**
 * Initiates socket
 * @return {Socket} - new socket object
 */
Server.prototype.getSocket = function (httpServer) {
    return io(httpServer, {
        'destroy buffer size': Infinity
    });
};

/**
 * Clear the processQueue interval,
 * close the socket and exit the process
 */
Server.prototype.stop = function () {
    clearInterval(this.processQueueInterval);
    this.socket.server.close();
    process.exit();
};

Server.prototype.notifyStatusAllWWWs = function (kind, what, obj) {
    this.wwws.socket.emit('news', arguments.length === 1 ? kind : {
        kind: kind,
        what: what,
        obj: obj
    });
};

Server.prototype.updateBuildStatus = function (build, status, doNotLogOnMaster) {
    var buildParam = build;
    var server = this;
    if (build && !build.updateStatus) {
        //self detect build if an id was passed
        build = server.builds[build];
    }
    if (!build) {
        server.log(new Msg(null, null, 'S', Msg.error, 'Build not found with id: {2}', buildParam));
        return;
    }
    if (build.master && !doNotLogOnMaster && build.status !== status) {
        var msg = new Msg(build.master, null, 'S', Msg.status, 'Platform {2} update status: {3}', build.conf.platform, status);
        server.log(msg, null);
    }
    if (build && build.updateStatus) {
        if (status === 'deleted') {
            delete server.builds[build.id];
            server.builds.remove(build);
            server.buildsQueue.remove(build);
            if (build.master) {
                build.master.platforms.remove(build);
            } else if (build.platforms) {
                build.platforms.forEach(function (platformBuild) {
                    delete server.builds[platformBuild.id];
                    server.builds.remove(platformBuild);
                    server.buildsQueue.remove(platformBuild);
                });
            }
        } else {
            build.updateStatus(status, server.location);
        }
        server.notifyStatusAllWWWs(status, 'build', build.serialize({platforms: 1}));
    } else {
        var _msg = "A request to change a build's status to {2} was made but that build cannot be found. " +
            "We have tried to identify it by {3}";
        server.log(buildParam, null, 'S', Msg.error, _msg, status, buildParam);
    }
};

Server.prototype.processQueue = function () {
    var build = this.buildsQueue.shift();
    while (build) {
        var platform = build.conf.platform;
        var startBuilding = false;
        var agents = this.platforms[platform];
        if (agents) {
            startBuilding = this.loopAgents(agents, build);
        }
        if (!startBuilding) {
            this.buildsQueue.push(build);
            build = null;
        } else {
            build = this.buildsQueue.shift();
        }
    }
};

Server.prototype.loopAgents = function (agents, build) {
    var startBuilding = false;
    agents.every(function (agent) {
        if (!agent.busy) {
            agent.startBuild(build);
            startBuilding = true;
            return false;
        }
        return true;
    });
    return startBuilding;
};

Server.prototype.log = function (msg, forwardToClientOrAgent) {
    if (this.conf.mode !== 'all' || !forwardToClientOrAgent) {
        console.log(msg.toString());
    }
    if (/Command failed/i.test(msg && msg.message)) {
        var e = new Error("server stack");
        msg.message += e.stack;
    }
    //broadcast the log to all wwws
    var build = this.findBuildById(msg.buildId);
    if (build && build.conf) {
        build.conf.logs.unshift(msg);
    }

    this.logs.unshift(msg);
    this.notifyStatusAllWWWs('log', 'log', msg);
    if (forwardToClientOrAgent) {
        forwardToClientOrAgent.emitLog(msg);
    }
};

Server.prototype.forwardLog = function (build, sender, msg, to) {
    //timestamp msg with server's time
    if (msg) {
        msg.date = new Date();
    }
    if (!to) {
        build = this.findBuildById(build);
        to = build && build.client;
    }
    if (build) {
        build.conf.logs.unshift(msg);
    }
    if (to && to !== sender) {
        to.emitLog(msg);
    }
    this.logs.unshift(msg);
    this.notifyStatusAllWWWs('log', 'log', msg);
};

Server.prototype.findBuildById = function (build) {
    if (typeof build === 'string' || build && build.id) {
        /* return found build */
        return this.builds[build && build.id || build] || build && build.id && build;
    } else {
        if (build) {
            console.error(build);
            throw "could not parse build";
        }
    }
    return build;
};

module.exports = Server;