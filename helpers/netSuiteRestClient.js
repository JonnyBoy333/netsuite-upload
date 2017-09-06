let vscode = require('vscode');
let RestClient = require('node-rest-client').Client;
let OAuth = require('oauth-1.0a');
let crypto  = require('crypto');
let fs = require('fs');
let JSON5 = require('json5');

function getRelativePath(absFilePath, configFile) {
    var rootDirectory = configFile.getConfiguration('netSuiteUpload')['rootDirectory'];
    if (rootDirectory) {
        return rootDirectory + absFilePath.slice(configFile.path.length);
    } else {
        return 'SuiteScripts' + absFilePath.slice(vscode.workspace.rootPath.length);
    }
}

function getFile(file, callback) {
    getData('file', file.fsPath, callback);
}

function getDirectory(directory, callback) {
    getData('directory', directory.fsPath, callback);
}

async function getConfigFile(objectPath) {
    let pathArray = objectPath.split('/');
    pathArray.pop();
    let len = pathArray.length;
    let configFile = {};

    function checkForFile(directory) {
        return new Promise(function(resolve) {
            fs.stat(directory + '/.nsupload.json', function(err, stat) {
                if(err == null) {
                    console.log('Found File', directory);
                    fs.readFile(directory + '/.nsupload.json', function(err, data) {
                        configFile = {
                            options: JSON5.parse(data),
                            getConfiguration: function(prop) {
                                return this.options;
                            },
                            path: directory
                        };
                        resolve(configFile);
                    });
                } else {
                    resolve({});
                }
            });
        })
    }

    for (let i = 0; i < len - 1; i++) {
        let directory = pathArray.join('/');
        configFile = await checkForFile(directory);
        if (Object.keys(configFile).length > 0) break;
        pathArray.pop();
    }
    return Object.keys(configFile).length > 0 ? configFile : vscode.workspace;
}

function getOauthHeader(configFile, method) {
    var oauth = OAuth({
        consumer: {
            key: configFile.getConfiguration('netSuiteUpload')['netsuite-key'],
            secret: configFile.getConfiguration('netSuiteUpload')['netsuite-secret']
        },
        signature_method: 'HMAC-SHA1',
        hash_function: function(base_string, key) {
            return crypto.createHmac('sha1', key).update(base_string).digest('base64');
        }
    });
    var token = {
        key: configFile.getConfiguration('netSuiteUpload')['consumer-token'],
        secret: configFile.getConfiguration('netSuiteUpload')['consumer-secret']
    };
    var baseRestletURL = configFile.getConfiguration('netSuiteUpload')['restlet'];
    var headerWithRealm = oauth.toHeader(oauth.authorize({ url: baseRestletURL, method: method }, token));
    headerWithRealm.Authorization += ', realm="' + configFile.getConfiguration('netSuiteUpload')['realm'] + '"';
    if (method === 'POST') headerWithRealm['Content-Type'] = 'application/json';
    console.log('Header with realm', headerWithRealm);
    return headerWithRealm;
}

function getData(type, objectPath, callback) {
    
    getConfigFile(objectPath)
    .then(configFile => {
        var relativeName = getRelativePath(objectPath, configFile);
        var client = new RestClient();
        var args = {
            path: { name: relativeName },
            headers: {                
                "Authorization": configFile.getConfiguration('netSuiteUpload')['authentication']
            }
        };

        var baseRestletURL = configFile.getConfiguration('netSuiteUpload')['restlet'];

        // Support for Oath authentication
        if (!args.headers.Authorization) {    
            args.headers = getOauthHeader(configFile, 'GET');
        }

        var baseRestletURL = configFile.getConfiguration('netSuiteUpload')['restlet'];
        console.log('Restlet URL', baseRestletURL);
        console.log('Get Args', args);
        client.get(baseRestletURL + '&type=' + type + '&name=${name}', args, function (data) {
            console.log('Return Data from Restlet', data);
            callback(data);
        });
    })
    .catch(err => {
        vscode.window.showErrorMessage(err);
    });
}

function postFile(file, content, callback) {
    postData('file', file.fsPath, content, callback);
}

function postData(type, objectPath, content, callback) {
    console.log('Posting file', '<-----------');
    getConfigFile(objectPath)
    .then(configFile => {
        console.log('Config File', configFile);
        var relativeName = getRelativePath(objectPath, configFile);
        console.log('Relative Name', relativeName);
        
        var client = new RestClient();
        var args = {
            headers: {                
                "Content-Type": "application/json",
                "Authorization": configFile.getConfiguration('netSuiteUpload')['authentication']
            },
            data: {
                type: 'file',
                name: relativeName,
                content: content
            }
        };
        
        var baseRestletURL = configFile.getConfiguration('netSuiteUpload')['restlet'];

        // Support for Oath authentication
        if (!args.headers.Authorization) {
            args.headers = getOauthHeader(configFile, 'POST');
        }
        console.log('Restlet URL', baseRestletURL);
        console.log('Post Args', args);
        client.post(baseRestletURL, args, function (data) {
            console.log('Return Post Data from Restlet', data);
            callback(data);
        });
    })
    .catch(err => {
        vscode.window.showErrorMessage(err);
    });
}

function deleteFile(file, callback) {
    deletetData('file', file.fsPath, callback);
}

function deletetData(type, objectPath, callback) {
    getConfigFile(objectPath)
    .then(configFile => {
        var relativeName = getRelativePath(objectPath, configFile);
        console.log('Config File', configFile);
        var client = new RestClient();
        var args = {
            path: { name: relativeName },
            headers: {                
                "Content-Type": "application/json",
                "Authorization": configFile.getConfiguration('netSuiteUpload')['authentication']
            }
        };

        var baseRestletURL = configFile.getConfiguration('netSuiteUpload')['restlet'];

        // Support for Oath authentication
        if (!args.headers.Authorization) {    
            args.headers = getOauthHeader(configFile, 'DELETE');
        }

        client.delete(baseRestletURL + '&type=' + type + '&name=${name}', args, function (data) {
            callback(data);
        });
    })
    .catch(err => {
        vscode.window.showErrorMessage(err);
    });
}

exports.getRelativePath = getRelativePath;
exports.getFile = getFile;
exports.postFile = postFile;
exports.deleteFile = deleteFile;
exports.getDirectory = getDirectory;
exports.getConfigFile = getConfigFile;
