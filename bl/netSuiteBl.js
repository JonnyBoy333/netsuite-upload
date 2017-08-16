let vscode = require('vscode');
let fs = require('fs');
let path = require('path');
let nsRestClient = require('../helpers/netSuiteRestClient');
let codeChangeHelper = require('../helpers/codeChangeHelper');
let uiHelper = require('../helpers/uiHelper');
let netsuiteList = require('../helpers/netsuiteList');
let _ = require('underscore');

function hasError(data, message) {
    if (data.error) {
        var errorMessage = message ? message : JSON.parse(data.error.message).message;
        vscode.window.showErrorMessage(errorMessage);
        return true;
    }
    return false;
}

function downloadFileFromNetSuite(file) {
    nsRestClient.getFile(file, function(data) {
        if (hasError(data)) return;
        
        var relativeFileName = nsRestClient.getRelativePath(file.fsPath);
        
        fs.writeFile(file.fsPath, data[0].content.toString());
        vscode.window.showInformationMessage('File "' + relativeFileName + '" downloaded.');
    });
}

function uploadFileToNetSuite(file) {
    var fileContent = fs.readFileSync(file.fsPath, 'utf8');
    
    nsRestClient.postFile(file, fileContent, function(data) {
        if (hasError(data)) return;
        console.log('Return Data', data.toString());
        
        var relativeFileName = nsRestClient.getRelativePath(file.fsPath);

        vscode.window.showInformationMessage('File "' + relativeFileName + '" uploaded.');
    });
}

function deleteFileInNetSuite(file) {
    nsRestClient.deleteFile(file, function(data) {
        if (hasError(data)) return;
        
        var relativeFileName = nsRestClient.getRelativePath(file.fsPath);

        vscode.window.showInformationMessage('File "' + relativeFileName + '" deleted.');
    });
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
        configFile = await checkForFile(directory);
        if (Object.keys(configFile).length > 0) break;
        pathArray.pop();
    }
    return Object.keys(configFile).length > 0 ? configFile : vscode.workspace;
}

function previewFileFromNetSuite(file) {
    nsRestClient.getFile(file, function(data) {
        if (hasError(data, 'File does not exist in NetSuite')) return;
        
        getConfigFile(file.fsPath)
        .then(configFile => {
            var relativeFileName = nsRestClient.getRelativePath(file.fsPath);
            var tempFolder = configFile.getConfiguration('netSuiteUpload')['tempFolder'];
            var filePathArray = (relativeFileName.split('.')[0] + '.preview.' + relativeFileName.split('.')[1]).split('\\');
            var newPreviewFile = tempFolder + '\\' + filePathArray[filePathArray.length-1];

            fs.writeFile(newPreviewFile, data[0].content.toString());

            var nsFile = vscode.Uri.file(newPreviewFile);
            vscode.commands.executeCommand('vscode.diff', file, nsFile, 'Local <--> NetSuite');
        })
    });
}

function downloadDirectoryFromNetSuite(directory) {
    nsRestClient.getDirectory(directory, function(data) {
        // TODO: fix another error messages + check other functions and fix there as well
        if (hasError(data, 'Folder does not exist in NetSuite')) return;

        data.forEach(function(file) {
            var fullFilePath = vscode.workspace.rootPath + file.fullPath.split('/').join('\\');

            createDirectoryIfNotExist(fullFilePath + (file.type == 'folder' ? '\\_' : ''));
            
            if (file.type == 'file') {
                fs.writeFile(fullFilePath, file.content.toString());
            }
        });

        vscode.window.showInformationMessage('Folder successfully downloaded.');
    });
}

function createDirectoryIfNotExist(filePath) {
    var dirname = path.dirname(filePath);
    
    if (fs.existsSync(dirname)) {
        return true;
    }

    createDirectoryIfNotExist(dirname);
    fs.mkdirSync(dirname);
}

function addCustomDependencyToActiveFile(editor) {
    uiHelper.askForCustomDependency()
        .then(values => {
            addDependency(editor, values.depPath, values.depParam);            
        })
}

function addNetSuiteDependencyToActiveFile(editor) {
    let netsuiteLibs = netsuiteList.getSuiteScriptDependecies();

    uiHelper.showListOfNetSuiteDependecies(_.pluck(netsuiteLibs, 'path'))
        .then(value => {
            var depRecord = _.findWhere(netsuiteLibs, { path: value });
            addDependency(editor, depRecord.path, depRecord.param);
    })
}

function addDependency(editor, pathText, paramText) {
    let docContent = editor.document.getText();
    let coords = codeChangeHelper.getCoords(docContent);
    let oldParamsString = docContent.substring(coords.depParam.range[0], coords.depParam.range[1]);
    
    let newParamsString = codeChangeHelper.getUpdatedFunctionParams(paramText, oldParamsString);
    let newPathArrayString = codeChangeHelper.getUpdatedDepPath(pathText, 
        coords.depPath ? docContent.substring(coords.depPath.range[0], coords.depPath.range[1]) : null);

    if (coords.depPath) {
        codeChangeHelper.updateDocument(editor, coords.depParam.start.row - 1, coords.depParam.start.col, 
            coords.depParam.end.row - 1, coords.depParam.end.col, newParamsString);

        codeChangeHelper.updateDocument(editor, coords.depPath.start.row - 1, coords.depPath.start.col, 
            coords.depPath.end.row - 1, coords.depPath.end.col, newPathArrayString);
    } else { // Path array not defined
        codeChangeHelper.updateDocument(editor, coords.depParam.start.row - 1, coords.depParam.start.col, 
            coords.depParam.end.row - 1, coords.depParam.end.col, newPathArrayString + ', ' + newParamsString);
    }
}

exports.downloadFileFromNetSuite = downloadFileFromNetSuite;
exports.previewFileFromNetSuite = previewFileFromNetSuite;
exports.downloadDirectoryFromNetSuite = downloadDirectoryFromNetSuite;
exports.uploadFileToNetSuite = uploadFileToNetSuite;
exports.deleteFileInNetSuite = deleteFileInNetSuite;
exports.addCustomDependencyToActiveFile = addCustomDependencyToActiveFile;
exports.addNetSuiteDependencyToActiveFile = addNetSuiteDependencyToActiveFile;
