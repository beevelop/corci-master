/**
 * @name Agent
 * @version 0.1.0
 * @fileoverview Agent socket
 */

var libs = require('corci-libs');
var Common = libs.Common;
var Logger = libs.Logger;
var FileStream = libs.FileStream;

var P = Common.Promise;
var ios = Common.socket.stream;

var BuildFile = libs.models.BuildFile;
var BuildStatus = libs.models.BuildStatus;
var BuildRequestStatus = libs.models.BuildRequestStatus;

var path = require('path');

function Agent(server, socket) {
    this.server = server;

    this._platform = null;
    //@todo: remove name support? (=> technically not required)
    this._name = null;
    this._AID = null;

    this._busy = true;

    this.socket = this.attachListeners(socket);
}

Agent.prototype.setAID = function (AID) {
    this._AID = AID;
};

Agent.prototype.getAID = function () {
    return this._AID;
};

Agent.prototype.setPlatform = function (platform) {
    this._platform = platform;
};

Agent.prototype.getPlatform = function () {
    return this._platform;
};

Agent.prototype.setName = function (name) {
    this._name = name;
};

Agent.prototype.getName = function () {
    return this._name;
};

Agent.prototype.laze = function () {
    this._busy = false;
};

Agent.prototype.work = function (build) {
    this._busy = build || true;
};

Agent.prototype.isBusy = function () {
    return this._busy;
};

Agent.prototype.canBuild = function (build) {
    return (this.getPlatform() === build.getPlatform()) && !this.isBusy();
};

Agent.prototype.attachListeners = function (socket) {
    Logger.extendSocket(this, socket, 'log', {
        mirror: true
    });

    socket.on('register', this.onRegister.bind(this));

    // Request
    socket.on('accept', this.onAccept.bind(this));

    //@todo: onStatus
    ios(socket).on('serve', this.onServe.bind(this));
    socket.on('conclude', this.onConclude.bind(this));
    socket.on('status', this.onStatus.bind(this));

    socket.on('fail', this.onFail.bind(this));
    socket.on('disconnect', this.onDisconnect.bind(this));

    //@todo: onError?
    return socket;
};

Agent.prototype.onRegister = function (AID, platform, name) {
    this.setAID(AID);
    this.setPlatform(platform);
    this.setName(name);

    Logger.verbose('Agent #%s for %s has registered', AID, platform);

    this.server.addAgent(this);
    this.laze();
};

Agent.prototype.transferBuild = function (build) {
    this.work(build);

    var bufis = build.getBuildFiles();
    this.socket.emit('hire', build.getBID(), bufis.length);
};

Agent.prototype.onAccept = function () {
    var build = this.isBusy();

    build.setStatus(BuildStatus.transferring);
    var bufis = build.getBuildFiles();
    Logger.log('Sending %d files to agent #%s', bufis.length, this.getAID());

    var _this = this;
    var files = BuildFile.toPaths(bufis);
    FileStream.sendAll(this.socket, 'transfer', files, build.getBID())
        .catch(function (err) {
            Logger.warn('Transfering Build #%s to Agent #%s failed', build.getBID(), _this.getAID(), err);
            build.setStatus(BuildStatus.failed);
            _this.laze();
        });
};

Agent.prototype.onConclude = function (BID, filecount) {
    this.filecount = filecount;
    Logger.client('Received BuildConclusion for #%s - expecting %d artifact(s)', BID, filecount);
    this.socket.emit('accept', BID);
};

Agent.prototype.onServe = function (stream, meta, BID) {
    var build = this.isBusy();
    if (build && build.getBID() !== BID) {
        this.log.warn('serve: Could not find Build by BID "%s"', BID);
        return;
    }

    var localdir = path.resolve(this.server.getLocation(), build.getBRID(), 'out', build.getPlatform());
    var localpath = path.resolve(localdir, meta.basename);

    var _this = this;
    return FileStream.save(stream, localpath)
        .then(function () {
            _this.log.server('Successfully received %s', meta.basename);
            var bufi = new BuildFile(build.getBRID(), localpath, build.getPlatform());
            build.addArtifact(bufi);
            _this.socket.emit('confirm', BID);
        })
        .catch(function (err) {
            _this.log.warn('The file %s could not be saved on the server', meta.basename, err);
            breq.setStatus(BuildRequestStatus.failed);
        })
        .then(function () {
            _this.filecount = _this.filecount - 1;
            if (_this.filecount === 0) {
                build.setStatus(BuildStatus.success);
                _this.laze(); // have a kitkat
            }
        });
};

Agent.prototype.onDisconnect = function () {
    Logger.verbose('Agent #%s disconnected', this.getAID());
    this.server.removeAgent(this);
    if (this.isBusy()) {
        var build = this.isBusy();
        Logger.build('Build #%s will be added back to BuildQueue', build.getBID());
        this.server.addBuild(build);
    }
};

//@todo: onStatus
Agent.prototype.onStatus = function () {
    Logger.info('Status', arguments);
};

Agent.prototype.onFail = function (BID, err) {
    var build = this.server.getBuild(BID);
    if (!build) {
        this.log.warn('fail: Could not find Build by BID "%s"', BID);
        return;
    }

    Logger.build('Build #%s failed', BID, err);
    build.setStatus(BuildStatus.failed);
    this.laze(); // time to chill
};

module.exports = Agent;