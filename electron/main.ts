import { app, BrowserWindow, ipcMain, Menu, type MenuItemConstructorOptions } from 'electron'
import path from 'node:path'
import { IPC, type MenuAction } from '../shared/ipc'
import { registerIpcHandlers } from './ipc'
import { connectionManager } from './ipc/connection'
import { runStartupMigrations } from './ipc/config'

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

/** Frameless window controls driven by the custom title bar (Linux/Windows). */
function registerWindowControls(): void {
  const winOf = (e: Electron.IpcMainEvent): BrowserWindow | null =>
    BrowserWindow.fromWebContents(e.sender)
  ipcMain.on('window:minimize', (e) => winOf(e)?.minimize())
  ipcMain.on('window:maximize', (e) => {
    const win = winOf(e)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window:close', (e) => winOf(e)?.close())
  ipcMain.on('window:toggleFullscreen', (e) => {
    const win = winOf(e)
    if (win) win.setFullScreen(!win.isFullScreen())
  })
  ipcMain.on('window:isMaximized', (e) => {
    e.returnValue = winOf(e)?.isMaximized() ?? false
  })
}

// vite-plugin-electron injects this in dev; undefined in a packaged build.
const DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'TractoDB',
    // Frameless — the renderer draws a custom VS Code-style title bar.
    frame: false,
    titleBarStyle: 'hidden', // keeps macOS traffic lights, hides native title
    transparent: false,
    // Dark default avoids a white flash before the theme applies.
    backgroundColor: '#1E1E1E',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Security: renderer never gets Node. Everything crosses via the
      // contextBridge in preload.ts (CLAUDE.md / AGENTS.md).
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // macOS: keep the native traffic lights visible over our frameless chrome.
  if (process.platform === 'darwin') {
    mainWindow.setWindowButtonVisibility(true)
  }

  const win = mainWindow
  win.on('maximize', () => win.webContents.send('window:maximized', true))
  win.on('unmaximize', () => win.webContents.send('window:maximized', false))
  win.on('enter-full-screen', () => win.webContents.send('window:fullscreen', true))
  win.on('leave-full-screen', () => win.webContents.send('window:fullscreen', false))

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
  .then(async () => {
    await runStartupMigrations() // DBStudio → TractoDB data migration (one-time)
    registerIpcHandlers()
    registerWindowControls()
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
    console.error('Failed to start TractoDB:', err)
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
