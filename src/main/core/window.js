import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '@resources/resources/icon.png?asset'

const createWindow = () => {
    const mainWindow = new BrowserWindow({
        width: 860,
        height: 580,
        show: false,
        center: true,
        fullscreen: false,
        transparent: true,
        fullscreenable: false,
        autoHideMenuBar: true,
        frame: false,
        maximizable: false,
        titleBarStyle: 'hidden',
        hasShadow: true,
        resizable: false,
        ...(process.platform === 'linux' ? { icon } : {}),
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            sandbox: false
        }
    })

    mainWindow.on('ready-to-show', () => {
        mainWindow.show()
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)

        return { action: 'deny' }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }

    // 禁用标题栏右键菜单
    mainWindow.hookWindowMessage(0x116, () => {
        mainWindow.setEnabled(false)
        setTimeout(() => {
            mainWindow.setEnabled(true)
        }, 50)
    })

    return mainWindow
}

export { createWindow }
