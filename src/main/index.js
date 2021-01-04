/* eslint-disable max-len */
/* eslint-disable prefer-promise-reject-errors */
/* eslint-disable consistent-return */
/* eslint-disable no-param-reassign */
/* eslint-disable no-unused-vars */
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-console */
/* eslint-disable comma-dangle */
/* eslint-disable prefer-destructuring */
import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { format as formatUrl } from 'url';
import { spawn } from 'child_process';
import fs from 'fs';
import setConfig from '../utils/setConfig';
import setTranslate from '../utils/setTranslate';
import setPAR from '../utils/setPAR';
/* import { NewReleases } from '@material-ui/icons'; */

const FileType = require('file-type');
const request = require('request');
const fetch = require('node-fetch');

const isDevelopment = process.env.NODE_ENV !== 'production';

let mainWindow;
const factor = screen.getPrimaryDisplay().scaleFactor;

async function createMainWindow() {
  const window = new BrowserWindow({
    minWidth: 1280,
    minHeight: 800,
    title: 'JHove 2020',
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: true,
      enableRemoteModule: true,
      zoomFactor: 1.0 / factor,
    },
  });

  window._id = 'main';

  if (isDevelopment) {
    window.webContents.openDevTools();
  }

  if (isDevelopment) {
    window.loadURL(`http://localhost:${process.env.ELECTRON_WEBPACK_WDS_PORT}`);
  } else {
    window.loadURL(
      formatUrl({
        pathname: path.join(__dirname, 'index.html'),
        protocol: 'file',
        slashes: true,
      }),
    );
  }

  window.on('closed', () => {
    mainWindow = null;
  });

  window.webContents.on('devtools-opened', () => {
    window.focus();
    setImmediate(() => {
      window.focus();
    });
  });

  const translate = await setTranslate(isDevelopment);
  const config = await setConfig(isDevelopment);
  const PAR = await setPAR(isDevelopment);
  window.webContents.on('did-finish-load', () => {
    window.webContents.send('translate', translate);
    window.webContents.send('config', config);
    window.webContents.send('PAR', PAR);
  });

  return window;
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    mainWindow = createMainWindow();
  }
});

const download = (url, dest) => new Promise((resolve, reject) => {
  const file = fs.createWriteStream(dest);

  const sendReq = request.get(url);

  sendReq.on('response', response => {
    if (response.statusCode === 200) {
      sendReq.pipe(file);
    } else {
      file.close();
      fs.unlink(dest, () => {});
      reject(`Server responded with ${response.statusCode}: ${response.statusMessage}`);
    }
  });

  sendReq.on('error', err => {
    file.close();
    fs.unlink(dest, () => {});
    reject(err.message);
  });

  file.on('finish', () => {
    resolve();
  });

  file.on('error', err => {
    file.close();

    if (err.code === 'EEXIST') {
      reject('File already exists');
    } else {
      fs.unlink(dest, () => {});
      reject(err.message);
    }
  });
});

ipcMain.on('check-mime-type', async (event, arg) => {
  const fStream = await fetch(arg);
  const type = await FileType.fromStream(fStream.body);
  event.sender.send('receive-mime-type', type);
});

app.on('ready', () => {
  mainWindow = createMainWindow();
});

const runScript = (toolPath, filePath, actionName, toolID, optionID, outFol, mimeType) => {
  const reportDate = spawn('python3', [toolPath, filePath, actionName, toolID, optionID, outFol, mimeType]);
  reportDate.stdout.on('data', data => {
    const win = new BrowserWindow({
      minWidth: 1037,
      minHeight: 700,
      title: 'JHove 2020',
      frame: false,
      titleBarStyle: 'hidden',
      webPreferences: {
        nodeIntegration: true,
        enableRemoteModule: true,
      },
    });
    win._id = 'report';

    win.webContents.once('did-finish-load', async () => {
      const translate = await setTranslate(isDevelopment);
      win.webContents.send('translate', translate);
      win.webContents.send('receiver', { report: data.toString(), path: filePath });
    });

    if (isDevelopment) {
      win.webContents.openDevTools();
    }

    if (isDevelopment) {
      win.loadURL(`http://localhost:${process.env.ELECTRON_WEBPACK_WDS_PORT}`);
    } else {
      win.loadURL(
        formatUrl({
          pathname: path.join(__dirname, 'index.html'),
          protocol: 'file',
          slashes: true,
        }),
      );
    }
  });
};

const getDateString = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const mins = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}${month}${day}${hours}${mins}`;
};

ipcMain.on('execute-file-action', (event, arg) => {
  const toolPath = isDevelopment
    ? `./libs/${arg.tool.path}`
    : path.join(__dirname, '..', 'libs', arg.tool.path);
  if (arg.fileOrigin === 'url') {
    if (!fs.existsSync(path.join(__dirname, '..', 'DownloadedFiles'))) {
      fs.mkdirSync(path.join(__dirname, '..', 'DownloadedFiles'));
    }
    arg.filePath = path.join(__dirname, '..', 'DownloadedFiles', `${getDateString()}-${arg.fileName}`);
    try {
      download(arg.path, arg.filePath)
        .then(() => runScript(
          toolPath,
          arg.filePath,
          arg.action.preservationActionName,
          arg.tool.toolID,
          arg.option.optionId,
          arg.outputFolder,
          arg.mimeType,
        ),)
        .catch(err => console.log(err));
    } catch (err) {
      console.log(err);
    }
  } else {
    arg.filePath = arg.path;
    runScript(
      toolPath,
      arg.filePath,
      arg.action.preservationActionName,
      arg.tool.toolID,
      arg.option.optionId,
      arg.outputFolder,
      arg.mimeType,
    );
  }
});
