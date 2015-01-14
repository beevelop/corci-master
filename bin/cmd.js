#!/usr/bin/env node
require('corci-libs').utils;

var Common = require('corci-libs').Common;
var extend = Common.extend;
var yargs = Common.yargs;

var Server = require('../lib/Server');
var patch = require('corci-libs').patch;
// patch on to support binding with multiple events at once
patch(process.EventEmitter.prototype, ["on", "addListener"]);

// should be solved by yargs / need to test and remove later
/*try {
    process.openStdin().on('keypress', function(chunk, key) {
        if (key && key.name === 'c' && key.ctrl) {
            process.emit('SIGINT');
            process.exit();
        }
    });

    if (process.platform === 'win32') {
        var readLine = require('readline');
        var rl = readLine.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.on('SIGINT', function() {
            process.emit('SIGINT');
        });
    }
} catch (e) {
    //@TODO: error-handling?
}*/


var conf = yargs
    .help('help')
    .version('0.0.1', 'v')
    .alias('v', 'version')
    .showHelpOnFail(true)
    .usage('Starts the corCI-Master.\nUsage: $0')
    .options('p', {
        alias: 'port',
        default: 8000,
        describe: 'Port the server should use'
    })
    .options('q', {
        alias: 'protocol',
        default: 'http',
        describe: 'Protocol the server should use (https requires key and cert argument)'
    })
    .options('h', {
        alias: 'host',
        default: 'localhost',
        describe: 'Hostname the server should use'
    })
    .options('k', {
        alias: 'keep',
        default: 0,
        describe: 'Amount of builds to keep (0 = unlimited)'
    })
    .options('l', {
        alias: 'location',
        default: 'builds',
        describe: 'Path to the builds directory'
    })
    .options('key', {
        describe: 'Path to the SSL key'
    })
    .options('cert', {
        alias: 'certificate',
        describe: 'Path to the SSL certificate'
    })
    .argv;

var server = new Server(conf);
server.init();
