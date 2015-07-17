/**
 * @name WWW
 * @version 0.1
 * @fileoverview Handles some of the WWW-Sockets events
 */

/**
 * Creates a new WWW Object
 *
 * @class
 * @param {Socket} socket - the WWW socket.
 */
function WWW(socket) {
    this._socket = socket;
}

/**
 * Set eventhandlers
 *
 * @param {Server} server instance of the calling {@link Server}.
 */
WWW.prototype.onConnect = function (server) {
    this.server = server;
    this._socket.on('refresh', this.onRefresh.bind(this));
    this._socket.on('disconnect', this.onDisconnect.bind(this));
    this.onRefresh();
};

/**
 * Handle disconnect
 */
WWW.prototype.onDisconnect = function () {
};

/**
 * Handle refresh and update metadata (builds, agents, clients,...)
 */
WWW.prototype.onRefresh = function () {
    var server = this.server;
    var response = {
        'status': 1,
        logs: server.logs,
        builds: server.builds.map(function (build) {
            return build.serialize({platforms: 1});
        }),
        agents: server.agents.map(function (agent) {
            return agent.conf;
        }),
        clients: server._clients.map(function (client) {
            return client.conf;
        }),
        latestBuild: server.latestBuild
    };
    this._socket.emit('status', response);
};

module.exports = WWW;