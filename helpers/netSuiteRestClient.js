let vscode = require('vscode');
let RestClient = require('node-rest-client').Client;
let fs = require('fs');
let JSON5 = require('json5');

function getRelativePath(absFilePath) {
    return absFilePath.slice(vscode.workspace.rootPath.length);
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

    console.log('Path Array', pathArray);
    function checkForFile(directory) {
        return new Promise(function(resolve) {
            fs.stat(directory + '/.nsupload.json', function(err, stat) {
                if(err == null) {
                    console.log('Found File', directory);
                    fs.readFile(directory + '/.nsupload.json', function(err, data) {
                        //console.log('File Data', data);
                        configFile = {
                            options: JSON5.parse(data),
                            getConfiguration: function(prop) {
                                configObj = {};
                                configObj[prop] = this.options[prop];
                                return this.options;
                            }
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
        console.log('Directory', directory);
        configFile = await checkForFile(directory);
        if (Object.keys(configFile).length > 0) break;
        pathArray.pop();
    }
    return Object.keys(configFile).length > 0 ? configFile : vscode.workspace;
}

function getData(type, objectPath, callback) {
    var relativeName = getRelativePath(objectPath);
    
    var client = new RestClient();
    var args = {
        path: { name: relativeName },
        headers: {                
            "Content-Type": "application/json",
            "Authorization": vscode.workspace.getConfiguration('netSuiteUpload')['authentication']
        }
    };

    var baseRestletURL = vscode.workspace.getConfiguration('netSuiteUpload')['restlet'];
    client.get(baseRestletURL + '&type=' + type + '&name=${name}', args, function (data) {
        callback(data);
    });
}

function postFile(file, content, callback) {
    postData('file', file.fsPath, content, callback);
}

function postData(type, objectPath, content, callback) {
    getConfigFile(objectPath)
    .then(configFile => {
        console.log('Config File', configFile);
        console.log('Realm', configFile.getConfiguration('netSuiteUpload')['realm']);
        var relativeName = getRelativePath(objectPath);
        
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
        client.post(baseRestletURL, args, function (data) {
            callback(data);
        });
    })
}

function deleteFile(file, callback) {
    deletetData('file', file.fsPath, callback);
}

function deletetData(type, objectPath, callback) {
    var relativeName = getRelativePath(objectPath);
    
    var client = new RestClient();
    var args = {
        path: { name: relativeName },
        headers: {                
            "Content-Type": "application/json",
            "Authorization": vscode.workspace.getConfiguration('netSuiteUpload')['authentication']
        }
    };

    var baseRestletURL = vscode.workspace.getConfiguration('netSuiteUpload')['restlet'];
    client.delete(baseRestletURL + '&type=' + type + '&name=${name}', args, function (data) {
        callback(data);
    });
}

exports.getRelativePath = getRelativePath;
exports.getFile = getFile;
exports.postFile = postFile;
exports.deleteFile = deleteFile;
exports.getDirectory = getDirectory;
