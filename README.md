[![Build Status](https://travis-ci.org/beevelop/corci-master.svg?branch=master)](https://travis-ci.org/beevelop/corci-master)
[![Dependency Status](https://gemnasium.com/beevelop/corci-master.svg)](https://gemnasium.com/beevelop/corci-master)
[![Code Climate](https://codeclimate.com/github/beevelop/corci-master/badges/gpa.svg)](https://codeclimate.com/github/beevelop/corci-master)
[![GitHub release](https://img.shields.io/github/release/beevelop/corci-master.svg?style=flat)](https://github.com/beevelop/corci-master/releases)
[![GitHub issues](https://img.shields.io/github/issues/beevelop/corci-master.svg?style=flat)](https://github.com/beevelop/corci-master/issues)

# CorCI-master

> A convenient way to handle your own cordova builds without relying on Phonegap Build.

# Disclaimer

This project is currently under heavy development and might be unstable. Don't use it in production (unless you're adventurous).

# Usage
```
corci-master

Options:
  --help                 Show help
  -v, --version          Show version number
  -p, --port             Port the server should use                                             [default: 8000]
  -q, --protocol         Protocol the server should use (https requires key and cert argument)  [default: "http"]
  -h, --host             Hostname the server should use                                         [default: "localhost"]
  -k, --keep             Amount of builds to keep (0 = unlimited)                               [default: 0]
  -l, --location         Path to the builds directory                                           [default: "builds"]
  --key                  Path to the SSL key
  --cert, --certificate  Path to the SSL certificate
```