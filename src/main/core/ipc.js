import { ipcMain } from 'electron'
import {
    getPackageJson,
    openSelectFilesDialog,
    closeWindow,
    minimizeWindow,
    openFolder
} from '@resources/src/main/utils'
import { uploadTask } from '@main/services/uploadTask'
import { RendererToMainEvent } from '@resources/src/common/const'

const setupIPC = () => {
    // Close app
    ipcMain.on(RendererToMainEvent.closeApp, (event) => {
        closeWindow(event)
    })

    // Minimize app
    ipcMain.on(RendererToMainEvent.minimize, (event) => {
        minimizeWindow(event)
    })

    // 获取 package.json
    ipcMain.handle(RendererToMainEvent.getPackageJson, () => {
        return getPackageJson()
    })

    // 选择文件
    ipcMain.handle(RendererToMainEvent.selectFiles, async () => {
        return await openSelectFilesDialog({
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'Markdown Files', extensions: ['md'] }]
        })
    })

    // 上传文件中的本地图片到图床
    ipcMain.handle(RendererToMainEvent.uploadImage, (event, filePathList) => {
        uploadTask(event, filePathList)
    })

    // 打开文件夹
    ipcMain.on(RendererToMainEvent.openFolder, (event, filePath) => {
        openFolder(filePath)
    })
}

export { setupIPC }
