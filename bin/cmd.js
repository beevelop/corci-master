#!/usr/bin/env node
var Common = require('corci-libs').Common;
var yargs = Common.yargs;

var Server = require('../lib/Server');

var conf = yargs
    .help('help')
    .version('0.1.0', 'v')
    .alias('v', 'version')
    .showHelpOnFail(true)
    .usage('Starts the corCI-Master.\nUsage: $0')
    .config('c')
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
