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
        var errorMessage = message ? message : data.error.message;
        vscode.window.showErrorMessage(errorMessage);
        return true;
    }
    return false;
}

function downloadFileFromNetSuite(file) {
    nsRestClient.getFile(file, function(data) {
        console.log('Data', data);
        if (hasError(data)) return;

        nsRestClient.getConfigFile(file.fsPath)
        .then(configFile => {
                var relativeFileName = nsRestClient.getRelativePath(file.fsPath, configFile);
                
                console.log('File Path', file.fsPath);
                console.log('Content', data[0].content.toString());
                fs.writeFile(file.fsPath, data[0].content.toString());
                vscode.window.showInformationMessage('File "' + relativeFileName + '" downloaded.');
        })
        .catch(err => {
            vscode.window.showErrorMessage(err);
        });
    });
}

function uploadFileToNetSuite(file) {
    var fileContent = fs.readFileSync(file.fsPath, 'utf8');
    
    nsRestClient.postFile(file, fileContent, function(data) {
        if (hasError(data)) return;

        nsRestClient.getConfigFile(file.fsPath)
        .then(configFile => {
            var relativeFileName = nsRestClient.getRelativePath(file.fsPath, configFile);
            console.log('Relative Name', relativeFileName);
    
            vscode.window.showInformationMessage('File "' + relativeFileName + '" uploaded successfully.');
        })
        .catch(err => {
            vscode.window.showErrorMessage(err);
        });
    });
}

function deleteFileInNetSuite(file) {
    nsRestClient.deleteFile(file, function(data) {
        if (hasError(data)) return;

        nsRestClient.getConfigFile(file.fsPath)
        .then(configFile => {

            var relativeFileName = nsRestClient.getRelativePath(file.fsPath, configFile);
    
            vscode.window.showInformationMessage('File "' + relativeFileName + '" deleted.');
        })
        .catch(err => {
            vscode.window.showErrorMessage(err);
        });
    });
}

function previewFileFromNetSuite(file) {
    nsRestClient.getFile(file, function(data) {
        if (hasError(data, 'File does not exist in NetSuite')) return;
        console.log('File', file);
        
        nsRestClient.getConfigFile(file.fsPath)
        .then(configFile => {
            var relativeFileName = nsRestClient.getRelativePath(file.fsPath, configFile);
            var tempFolder = configFile.getConfiguration('netSuiteUpload')['tempFolder'];
            var filePathArray = (relativeFileName.split('.')[0] + '.preview.' + relativeFileName.split('.')[1]).split('\\');
            var newPreviewFile = tempFolder + '\\' + filePathArray[filePathArray.length-1];

            fs.writeFile(newPreviewFile, data[0].content.toString());

            var nsFile = vscode.Uri.file(newPreviewFile);
            vscode.commands.executeCommand('vscode.diff', file, nsFile, 'Local <--> NetSuite');
        })
        .catch(err => {
            vscode.window.showErrorMessage(err);
        });
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
    .catch(err => {
        vscode.window.showErrorMessage(err);
    });
}

function addNetSuiteDependencyToActiveFile(editor) {
    let netsuiteLibs = netsuiteList.getSuiteScriptDependecies();

    uiHelper.showListOfNetSuiteDependecies(_.pluck(netsuiteLibs, 'path'))
    .then(value => {
        var depRecord = _.findWhere(netsuiteLibs, { path: value });
        addDependency(editor, depRecord.path, depRecord.param);
    })
    .catch(err => {
        vscode.window.showErrorMessage(err);
    });
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
