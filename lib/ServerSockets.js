/**
 * @name ServerSockets
 * @version 0.1.0
 * @fileoverview Defines all Server sockets (agents, clients, wwws)
 *               exclusively used by {@link Server}
 */

var WWW = require('./sockets/WWW');

function ServerSockets() {}

/**
 * WWWSocket (/www): Handle rebuild and cancel requests
 * @returns Socket
 */
//@todo: rewrite
ServerSockets.wwwsSocket = function () {
    var _self = this;
    return _self._socket
        .of('/www')
        .on('connection', function (socket) {
            var www = new WWW(socket);
            _self.monitors.push(www);
            www.onConnect(_self);
            socket.on('disconnect', function () {
                www.onDisconnect();
                _self.monitors.remove(www);
            });
            socket.on('rebuild', function (buildID) {
                var build = _self.builds[buildID];
                if (build) {
                    _self.updateBuildStatus(build, 'queued');
                    var platforms = build.master ? [build] : build.platforms;
                    _self.log(new Msg(build, build.client, 'S', Msg.status, 'This build as been rescheduled for rebuild'), build.client);

                    platforms.forEach(function (platformBuild) {
                        _self.buildsQueue.push(platformBuild);
                    });
                }
            });
            socket.on('cancel', function (buildID) {
                var build = _self.builds[buildID];
                if (build) {
                    _self.updateBuildStatus(build, 'cancelled');
                    _self.buildsQueue.remove(build);
                    if (build.client) {
                        if (build.client._socket) {
                            try {
                                build.client._socket.emit('build-failed', build._CID);
                            } catch (e) {
                            }
                        }
                    }
                    _self.log(new Msg(build, build.agent, 'S', Msg.error, 'The build has been cancelled on user\'s request'), build.client);
                    if (build.agent) {
                        if (build.agent._socket) {
                            try {
                                build.agent._socket.emit('cancel', build._CID);
                            } catch (e) {
                            }
                        }
                        build.agent.busy = null;
                    }
                }
            });
        });
};

module.exports = ServerSockets;