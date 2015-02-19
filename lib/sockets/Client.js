var libs = require('corci-libs');
var FileStream = libs.FileStream;
var Logger = libs.Logger;
var Common = libs.Common;

var BuildFile = libs.models.BuildFile;
var BuildRequest = libs.models.BuildRequest;
var BuildRequestStatus = libs.models.BuildRequestStatus;

var ios = Common.socket.stream;

var path = require('path');

function Client(server, socket) {

    Logger.extendSocket(this, socket, 'log', {
        mirror: true
    });

    this.socket = socket;
    this._CID = null;
    this._save = false;
    this.server = server;

    this.attachListeners(socket);
}

Client.prototype.wantSave = function () {
    return this._save;
};

Client.prototype.getCID = function () {
    return this._CID;
};

Client.prototype.attachListeners = function (socket) {
    // Request
    socket.on('request', this.onRequest.bind(this));
    ios(socket).on('upload', this.onUpload.bind(this));

    // Response
    socket.on('accept', this.onAccept.bind(this));

    // Error-Handling
    socket.on('error', this.onError.bind(this));
    socket.on('disconnect', this.onDisconnect.bind(this));
};

//@todo: broadcast to all clients via io.socket.emit,...


Client.prototype.onRequest = function (BRID, save, platforms, filecount) {
    this._CID = BRID;
    this._save = !!save;
    this.filecount = filecount;
    if (platforms.indexOf('autodetect') > -1) {
        platforms = Object.keys(this.server.getSupportedPlatforms());
    }

    Logger.verbose('Client #%s issued a BuildRequest for %s!', this.getCID(), platforms.toString());

    var breq = new BuildRequest(BRID, platforms, this);
    breq.on('status', this.onBuildRequestStatus.bind(this));
    this.server.addBuildRequest(breq);

    this.socket.emit('accept', BRID);
};

Client.prototype.onUpload = function (stream, meta, BRID, platform) {
    var breq = this.server.getBuildRequest(BRID);
    if (!breq) {
        this.log.warn('upload: Could not find Build by BRID "%s"', BRID);
        return;
    }

    var localdir = path.resolve(this.server.getLocation(), breq.getBRID(), 'in');
    var localpath = path.resolve(localdir, meta.basename);

    var _this = this;
    return FileStream.save(stream, localpath)
        .then(function () {
            _this.log.server('Successfully received %s for BuildRequest #%s', meta.basename, BRID);
            var bufi = new BuildFile(BRID, localpath, platform);
            breq.addBuildFile(bufi);
        })
        .catch(function (err) {
            _this.log.warn('The file %s could not be saved on the server', meta.basename, err);
            breq.setStatus(BuildRequestStatus.failed);
        })
        .then(function () {
            _this.filecount = _this.filecount - 1;
            if (_this.filecount === 0) {
                _this.queueBuildRequest(breq);
            }
        });
};

Client.prototype.queueBuildRequest = function (breq) {
    var builds = breq.getBuilds();
    this.log.build('Adding %d build(s) to the BuildQueue', builds.length);

    var server = this.server;
    builds.forEach(function (build) {
        server.addBuild(build);
    });

    breq.setStatus(BuildRequestStatus.processing);
};

Client.prototype.onBuildRequestStatus = function (breq, status) {
    switch (status) {
        case BuildRequestStatus.finished:
            if (this.wantSave()) {
                this.conclude(breq);
            }
            break;
        case BuildRequestStatus.failed:
            // @todo: emit fail
            break;
        case BuildRequestStatus.cancelled:
            // @todo: emit cancelled
            break;
        default:
            Logger.verbose('BuildRequest #%s has a new status: %s', breq.getBRID(), status.value);
            break;
    }
};

Client.prototype.conclude = function (breq) {
    var artifacts = breq.getArtifacts();
    this.socket.emit('conclude', breq.getBRID(), artifacts.length);
};

Client.prototype.onAccept = function (BRID) {
    var breq = this.server.getBuildRequest(BRID);
    if (!breq) {
        this.log.warn('accept: Could not find Build by BRID "%s"', BRID);
        return;
    }

    var artifacts = breq.getArtifacts();
    var files = BuildFile.toPaths(artifacts);
    FileStream.sendAll(this.socket, 'serve', files, breq.getBRID());
};

Client.prototype.onDisconnect = function () {
    Logger.verbose('Client #%s has disconnected!', this.getCID());
};

Client.prototype.onError = function (BRID) {
    var breq = this.server.getBuildRequest(BRID);
    if (breq) {
        breq.setStatus(BuildRequest.STATUS.failed);
    }
};

module.exports = Client;