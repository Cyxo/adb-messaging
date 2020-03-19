const { app, BrowserWindow, screen, ipcMain, dialog } = require('electron');
const Store = require('electron-store');
const store = new Store();

const path = require('path');
const spawnSync = require("child_process").spawnSync;

const sqlite3 = require('sqlite3');
let contactDB;
let smsDB;

APPNAME = "ADB Messaging";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) { // eslint-disable-line global-require
  app.quit();
}

const createWindow = () => {
  onReady();

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  // Create the browser window,
  const mainWindow = new BrowserWindow({
    width: Math.floor(600/height*width),
    height: 600,
    title: APPNAME,
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

  //mainWindow.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q

  try{ smsDB.close(); } catch (e){}
  try{ contactDB.close(); } catch (e){}

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

function quit(){
  smsDB.close();
  contactDB.close();
  app.quit();
}

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

function onReady(){
  try{
    let adb = spawnSync("adb", ["version"]);
    if (adb.status !== 0){
      dialog.showErrorBox("ADB not found", "Please install ADB on your system and add it to your path");
      quit();
    }
  } catch (e) {
    dialog.showErrorBox("ADB not found", "Please install ADB on your system and add it to your path");
    quit();
  }

  let su = spawnSync("adb", ["shell", "su", "--version", ";", "echo", "$?"]);
  let code = parseInt(su.stdout.toString().split("\n")[1]);
  if (code){
    dialog.showErrorBox("Phone doesn't have root", `${APPNAME} requires your phone to be root`);
    quit();
  }

  hasADB();
}

ipcMain.on('asynchronous-message', (event, arg) => {
  console.log(arg); // affiche "ping"
  event.reply('asynchronous-reply', 'pong');
});

ipcMain.on('synchronous-message', (event, arg) => {
  console.log(arg); // affiche "ping"
  event.returnValue = 'pong';
});

let adbInsecure = false;
function hasADB(){
  verifs();

  contacts = {};
  let tscontact = 0;
  function getContacts(){
    if (store.get('permissions.contact')){let modified = spawnSync("adb", [
        "shell", "su", "-c",
          "ls", "-l", "/data/data/com.android.providers.contacts/databases/contacts*.db"
      ]);
      let last = parseInt(modified.stdout.toString().match(/\d{5,}/g)[0]);
      if (last != tscontact){
        spawnSync("adb", [
          "shell", "su", "-c '\n",
            "mkdir -p /sdcard/tmp\n",
            "cp", "/data/data/com.android.providers.contacts/databases/contacts*.db", "/sdcard/tmp/contacts.db'"
        ]);
        spawnSync("adb", ["pull", "/sdcard/tmp/contacts.db", __dirname + "/contacts.db"]);
        // spawnSync("adb", ["shell", "rm", "-rf", "/sdcard/tmp"]);
        contactDB = new sqlite3.Database(__dirname + '/contacts.db');
        tscontact = last;

        contactDB.serialize(function(){
          contactDB.each(`SELECT DISTINCT c.display_name AS name, p.normalized_number AS num FROM raw_contacts c JOIN phone_lookup p ON c._id = p.raw_contact_id`, function(err, row){
            if (err) console.error(err, row);
            else contacts[row.num] = row.name;
          });
        });
      }
    }
  }

  getContacts();
  setInterval(getContacts, 1000*60*2);

  tssms = 0;
  function getSMS(){
    let modified = spawnSync("adb", [
      "shell", "su", "-c",
        "ls", "-l", "/data/data/com.android.providers.telephony/databases/mmssms.db"
    ]);
    let last = parseInt(modified.stdout.toString().match(/\d{5,}/g)[0]);
    if (last != tssms){
      spawnSync("adb", [
        "shell", "su", "-c '\n",
          "mkdir -p /sdcard/tmp\n",
          "cp /data/data/com.android.providers.telephony/databases/mmssms.db /sdcard/tmp/mmssms.db'"
      ]);
      spawnSync("adb", ["pull", "/sdcard/tmp/mmssms.db", __dirname + "/mmssms.db"]);
      // spawnSync("adb", ["shell", "rm", "-rf", "/sdcard/tmp"]);
      smsDB = new sqlite3.Database(__dirname + '/mmssms.db');
      tssms = last;
    }
  }

  ipcMain.on('get-convos', (event) => {
    getSMS();

    smsDB.serialize(function() {
      let messages = [];
      smsDB.each("WITH myrows AS ( \
                SELECT address, content, date, ROW_NUMBER() OVER ( \
                  PARTITION BY address ORDER BY date DESC) AS rowsn FROM messages) \
                SELECT * FROM myrows \
                WHERE rowsn = 1 AND DATETIME(date/1000,'unixepoch','localtime') < CURRENT_TIMESTAMP \
                ORDER BY date DESC LIMIT 15;", function(err, row) {
        if (err) console.log(error);
        messages.push({
          addr: row.address,
          num: (contacts[row.address] ? contacts[row.address] : row.address),
          msg: row.content,
          date: row.date
        });
      }, function(err){
        if (err) console.error(err);
        event.returnValue = messages;
      });
    });
  });

  ipcMain.on('get-messages', (event, args) => {
    getSMS();

    smsDB.serialize(function() {
      let messages = [];
      smsDB.each(`SELECT content, date, date_sent
                  FROM messages WHERE address = "${args.address}"
                  ORDER BY date DESC LIMIT 20;`,
      function(err, row) {
        if (err) console.log(error);
        messages.push({
          msg: row.content,
          date: row.date,
          sent: row.date_sent == 0
        });
      }, function(err){
        if (err) console.error(err);
        event.returnValue = messages;
      });
    });
  });
}

function verifs(){
  if (!store.get('permissions.sms', false)){
    let rep = dialog.showMessageBoxSync({
      title: "Allow SMS access",
      message: "Do you allow the access do your SMS?",
      type: "question",
      buttons: ["No", "Yes"]
    });
    if (rep){
      store.set('permissions.sms', true);
    } else {
      dialog.showErrorBox("SMS permission needed", `${APPNAME} needs the permission to access your SMS`);
      quit();
      return;
    }
  }
  if (!store.get('permissions.contact', false)){
    let rep = dialog.showMessageBoxSync({
      title: "Allow Contacts access",
      message: "Do you allow the access to your contacts?",
      type: "question",
      buttons: ["No", "Yes"]
    });
    if (rep){
      store.set('permissions.contact', true);
    }
  }
  let adbi = spawnSync("adb", ["root"]);
  if (adbi.stdout.toString().match(/cannot run as root/g)){
    setTimeout(() => {
      dialog.showMessageBox({
        title: "ADB is secure",
        message: "We found that you're using production ADB. We recommend you use adb-insecure to allow for faster access to your SMS",
        type: "info",
        buttons: ["Ok"]
      });
    }, 3000);
  } else {
    adbInsecure = true;
  }
}
