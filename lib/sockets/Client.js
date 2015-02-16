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

    this._socket = socket;
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
    socket.on('error', this.onError.bind(this));
    socket.on('register', this.onRegister.bind(this));
    socket.on('request', this.onRequest.bind(this));
    ios(socket).on('upload', this.onUpload.bind(this));
    socket.on('uploaded', this.onUploaded.bind(this));
    socket.on('disconnect', this.onDisconnect.bind(this));
};

//@todo: broadcast to all clients via io.socket.emit,...

Client.prototype.onRegister = function (CID, save) {
    this._CID = CID;
    this._save = !!save;
    Logger.verbose('Client #%s has registered!', this.getCID());
};

Client.prototype.onDisconnect = function () {
    Logger.verbose('Client #%s has disconnected!', this.getCID());
};

Client.prototype.onRequest = function (BRID, platforms) {
    if (platforms.indexOf('autodetect') > -1) {
        platforms = Object.keys(this.server.getSupportedPlatforms());
    }

    var breq = new BuildRequest(BRID, platforms, this);
    breq.on('status', this.onBuildRequestStatus.bind(this));
    this.server.addBuildRequest(breq);
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
        });
};

Client.prototype.onUploaded = function (BRID) {
    var breq = this.server.getBuildRequest(BRID);
    if (!breq) {
        this.log.warn("upload-done: Could not find build by BRID");
        return;
    }

    var builds = breq.getBuilds();
    this.log.build('Adding %d build(s) to the BuildQueue', builds.length);

    var _this = this;
    builds.forEach(function (build) {
        _this.server.addBuild(build);
    });
};

Client.prototype.onBuildRequestStatus = function (breq, status) {
    switch (status) {
        case BuildRequestStatus.success:
            if (this.wantSave()) {
                this.serve(breq);
            }
            break;
        default:
            Logger.verbose('BuildRequest #%s has a new status', breq.getBRID(), status);
            console.log(status);
            break;
    }
};

Client.prototype.serve = function (breq) {
    var artifacts = breq.getArtifacts();

    var _this = this;
    FileStream.sendAll(this.socket, 'serve', artifacts, breq.getBRID())
        .then(function () {
            _this.socket.emit('conclude', BID);
        });
};

Client.prototype.onError = function (BRID) {
    var breq = this.server.getBuildRequest(BRID);
    if (breq) {
        breq.setStatus(BuildRequest.STATUS.failed);
    }
};

module.exports = Client;