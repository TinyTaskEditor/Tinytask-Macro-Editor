import { app, BrowserWindow, Menu } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Use a local variable for APP_ROOT instead of mutating process.env
const APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(APP_ROOT, 'dist')

// Define VITE_PUBLIC as a constant
export const VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

// Remove the default application menu
Menu.setApplicationMenu(null)

function createWindow() {
    win = new BrowserWindow({
        // Use the constant VITE_PUBLIC which is guaranteed to be a string
        icon: path.join(VITE_PUBLIC, 'vite.svg'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        },
    })

    // Disable the menu bar
    win.removeMenu()

    // Prevent opening DevTools via keyboard shortcuts
    win.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.shift && input.key.toLowerCase() === 'i') {
            event.preventDefault()
        }
        if (input.key === 'F12') {
            event.preventDefault()
        }
        if (input.control && input.shift && input.key.toLowerCase() === 'r') {
            event.preventDefault()
        }
    })

    // Test active push message to Renderer-process.
    win.webContents.on('did-finish-load', () => {
        win?.webContents.send('main-process-message', (new Date).toLocaleString())
    })

    if (VITE_DEV_SERVER_URL) {
        win.loadURL(VITE_DEV_SERVER_URL)
    } else {
        // win.loadFile('dist/index.html')
        win.loadFile(path.join(RENDERER_DIST, 'index.html'))
    }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
        win = null
    }
})

app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})

app.whenReady().then(createWindow)
