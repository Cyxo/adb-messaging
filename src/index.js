const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3');
const contactDB = new sqlite3.Database(__dirname + '/contacts.db');
const smsDB = new sqlite3.Database(__dirname + '/mmssms.db');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) { // eslint-disable-line global-require
  app.quit();
}

const createWindow = () => {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  // Create the browser window,
  const mainWindow = new BrowserWindow({
    width: Math.floor(600/height*width),
    height: 600,
    webPreferences: {
      preload: path.join(app.getAppPath(), 'src/preload.js')
    },
  });

  // position it
  const bounds = mainWindow.getBounds();
  mainWindow.setPosition(width/2 - bounds.width/2, height/2 - bounds.height / 2, false);

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Hide menu bar
  mainWindow.setMenu(null);

  mainWindow.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q

  smsDB.close();
  contactDB.close();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

ipcMain.on('asynchronous-message', (event, arg) => {
  console.log(arg); // affiche "ping"
  event.reply('asynchronous-reply', 'pong');
});

ipcMain.on('synchronous-message', (event, arg) => {
  console.log(arg); // affiche "ping"
  event.returnValue = 'pong';
});

contacts = {};
contactDB.serialize(function(){
  contactDB.each(`SELECT DISTINCT c.display_name AS name, p.normalized_number AS num FROM raw_contacts c JOIN phone_lookup p ON c._id = p.raw_contact_id`, function(err, row){
    if (err) console.error(err, row);
    else contacts[row.num] = row.name;
  });
});

ipcMain.on('get-convos', (event, arg) => {
  smsDB.serialize(function() {
    let messages = [];
    smsDB.each("WITH myrows AS ( \
              SELECT address, content, date, ROW_NUMBER() OVER ( \
                PARTITION BY address ORDER BY date DESC) AS rowsn FROM messages) \
              SELECT * FROM myrows \
              WHERE rowsn = 1 AND DATETIME(date/1000,'unixepoch','localtime') < CURRENT_TIMESTAMP \
              ORDER BY date DESC;", function(err, row) {
      let name;
      messages.push({
        num: (contacts[row.address] ? contacts[row.address] : row.address),
        msg: row.content,
        date: row.date
      });
    }, function(err, cnt){
      event.returnValue = messages;
    });
  });
});
