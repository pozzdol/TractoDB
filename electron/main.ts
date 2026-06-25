import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import path from 'node:path'
import { IPC, type MenuAction } from '../shared/ipc'
import { registerIpcHandlers } from './ipc'
import { connectionManager } from './ipc/connection'

function buildMenu(): void {
  const sendAction = (action: MenuAction): void => {
    BrowserWindow.getFocusedWindow()?.webContents.send(IPC.MENU.ACTION, action)
  }
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [{ role: 'appMenu' as const }]
      : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'Database',
      submenu: [
        {
          label: 'Tools',
          submenu: [
            { label: 'Backup…', click: () => sendAction('backup') },
            { label: 'Restore…', click: () => sendAction('restore') },
          ],
        },
      ],
    },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// vite-plugin-electron injects this in dev; undefined in a packaged build.
const DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 880,
    minHeight: 560,
    show: false,
    title: 'DBStudio',
    // Matches the light-theme --color-bg-primary so there's no white flash on
    // load. Phase 11 will sync this with the persisted theme preference.
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Security: renderer never gets Node. Everything crosses via the
      // contextBridge in preload.ts (CLAUDE.md / AGENTS.md).
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (DEV_SERVER_URL) {
    void mainWindow.loadURL(DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app
  .whenReady()
  .then(() => {
    registerIpcHandlers()
    buildMenu()
    createWindow()

    app.on('activate', () => {
      // macOS: re-create a window when the dock icon is clicked and none are open.
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
  .catch((err: unknown) => {
    console.error('Failed to start DBStudio:', err)
    app.quit()
  })

app.on('window-all-closed', () => {
  // Standard non-macOS behaviour: quit when all windows are closed.
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  // Close DB connections cleanly on shutdown.
  void connectionManager.disconnectAll()
})
