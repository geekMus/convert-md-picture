import fs from 'fs'
import path from 'path'
import axios from 'axios'
import dayjs from 'dayjs'
import { TaskStatus, MainToRendererEvent, TaskErrorEnum } from '@resources/src/common/const'

/** 发送进度事件 */
const reportProgress = (event, status, params) => {
    event.sender.send(MainToRendererEvent.taskNotify, status, params)
}

/** 创建 Markdown 图片正则 */
const getMarkdownImageRegex = () => {
    // 精确匹配 Markdown 图片语法并保留 alt 和 title
    return /^!\[([^\]]*)\]\(\s*((?:[^()]|\([^)]*\))*)\s*(?:"([^"]*)")?\)/
}

/** 解析 Markdown 图片信息 */
const parseMarkdownImageInfos = (content, mdFilePath) => {
    const imageRegex = getMarkdownImageRegex()

    const dirName = path.dirname(mdFilePath)
    const lines = content.split(/\r?\n/)
    const imageInfos = []

    for (const [index, line] of lines.entries()) {
        const match = line.match(imageRegex)
        if (match) {
            const imageUrl = match[2]
            const absolutePath = path.resolve(dirName, imageUrl)
            const isRemote = /^https?:\/\//i.test(imageUrl)

            imageInfos.push({
                absolutePath,
                imageUrl,
                lineIndex: index,
                isRemote,
                type: 'image'
            })
        }
    }

    return imageInfos
}

/** 解析 HTML img 标签图片信息 */
const parseHtmlImageInfos = (content, mdFilePath) => {
    const dirName = path.dirname(mdFilePath)
    const regex =
        /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|(\S+))(?:[^>]*\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?(?:[^>]*\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?[^>]*>/gi
    const imageInfos = []
    let match

    while ((match = regex.exec(content)) !== null) {
        const src = match[1] || match[2] || match[3]
        const absolutePath = path.resolve(dirName, src)
        const isRemote = /^https?:\/\//i.test(src)
        const lineIndex = content.substr(0, match.index).split(/\r?\n/).length - 1

        imageInfos.push({
            absolutePath,
            imageUrl: src,
            lineIndex,
            isRemote,
            type: 'html'
        })
    }

    return imageInfos
}

/** 合并解析图片信息 */
const parseImageInfosFromContent = (content, filePath) => {
    const markdownImages = parseMarkdownImageInfos(content, filePath)
    const htmlImages = parseHtmlImageInfos(content, filePath)
    return [...markdownImages, ...htmlImages]
}

/** 过滤网络图片并去重 */
const filterRemoteImagesAndDeduplicate = (imageInfos) => {
    return [
        ...new Map(imageInfos.filter((i) => !i.isRemote).map((item) => [item.absolutePath, item])).values()
    ]
}

/** 上传单个图片 */
const uploadSingleImage = async (absolutePath) => {
    try {
        const result = await axios.post(
            'http://127.0.0.1:36677/upload',
            JSON.stringify({ list: [absolutePath] })
        )
        return result.data
    } catch (e) {
        if (e.message.includes('Invalid URL')) {
            throw new Error(TaskErrorEnum.uploadAddressError)
        }
    }
}

/** 并发上传所有本地图片 */
const uploadAllLocalImages = async (event, id, localImages) => {
    const results = []
    const total = localImages.length
    let uploadedCount = 0

    const tasks = localImages.map((image) =>
        uploadSingleImage(image.absolutePath)
            .then((result) => {
                results.push({ lineIndex: image.lineIndex, requestResult: result })
            })
            .finally(() => {
                uploadedCount++

                // 通知上传进度
                reportProgress(event, TaskStatus.uploadProgress, {
                    id,
                    data: {
                        totalCount: total,
                        uploadedCount
                    }
                })
            })
    )

    await Promise.all(tasks)
    return results
}

/** 构建成功映射列表 */
const generateSuccessList = (uploadResults, localImageList, imageInfoList) => {
    const pathToRemoteUrl = new Map()
    const successList = []

    uploadResults
        .filter((res) => res.requestResult?.success)
        .forEach(({ lineIndex, requestResult }) => {
            const item = localImageList.find((i) => i.lineIndex === lineIndex)
            if (!item) return

            const { absolutePath } = item

            if (!pathToRemoteUrl.has(absolutePath)) {
                const remoteUrl = requestResult.result?.[0] || null
                pathToRemoteUrl.set(absolutePath, remoteUrl)
            }

            imageInfoList
                .filter((i) => !i.isRemote && i.absolutePath === absolutePath)
                .forEach((i) => {
                    successList.push({
                        lineIndex: i.lineIndex,
                        remoteUrl: pathToRemoteUrl.get(absolutePath)
                    })
                })
        })

    return successList
}

/** 替换单行 Markdown 图片 */
const replaceMarkdownImage = (line, remoteUrl) => {
    const imageRegex = getMarkdownImageRegex()
    if (!remoteUrl) return line

    const match = line.match(imageRegex)
    if (!match) return line

    const altText = match[1]
    const title = match[3] ? ` "${match[3]}"` : ''
    return `![${altText}](${remoteUrl}${title})`
}

/** 替换单行 HTML img 标签 src */
const replaceHtmlImage = (line, remoteUrl) => {
    if (!remoteUrl) return line

    const matchHtmlImg = line.match(/<img\b[^>]*>/i)
    if (!matchHtmlImg) return line

    const srcMatch = matchHtmlImg[0].match(/\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|(\S+))/i)
    if (!srcMatch) return line

    const beforeSrc = line.slice(0, srcMatch.index)
    const afterSrc = line.slice(srcMatch.index)
    return beforeSrc + afterSrc.replace(/\bsrc\s*=\s*(?:"[^"]+"|'[^']+'|\S+)/i, `src="${remoteUrl}"`)
}

/** 替换内容中的图片链接（单次遍历，避免重复处理） */
const replaceImageUrlsInContent = (content, successList) => {
    const lines = content.split(/\r?\n/)
    const urlMap = new Map(successList.map((item) => [item.lineIndex, item.remoteUrl]))

    // 存储已处理的行索引，防止重复处理
    const processedLines = new Set()

    const resultLines = lines.map((line, index) => {
        // 已处理，跳过
        if (processedLines.has(index)) return line

        let newLine = replaceMarkdownImage(line, urlMap.get(index))
        if (newLine !== line) {
            processedLines.add(index)
            return newLine
        }

        newLine = replaceHtmlImage(line, urlMap.get(index))
        if (newLine !== line) {
            processedLines.add(index)
            return newLine
        }

        // 未命中任何替换规则
        return line
    })

    const lineBreak = content.includes('\r\n') ? '\r\n' : '\n'
    return resultLines.join(lineBreak)
}

/** 写入新文件 */
const writeNewFile = (content, filePath, fileName) => {
    const dir = path.dirname(filePath)
    const [prefix, suffix] = fileName.split('.')
    const timestamp = dayjs().unix()
    const newFileName = `${prefix} - ${timestamp}.${suffix}`
    const outputPath = path.join(dir, newFileName)

    fs.writeFileSync(outputPath, content, 'utf-8')
    return outputPath
}

/** 主任务处理流程 */
const taskProcess = async (event, fileInfo) => {
    const { id, filePath, fileName } = fileInfo

    try {
        // 开始任务
        reportProgress(event, TaskStatus.startTask, { id })

        const content = fs.readFileSync(filePath, 'utf-8')
        const imageInfoList = parseImageInfosFromContent(content, filePath)

        const localImageList = filterRemoteImagesAndDeduplicate(imageInfoList)

        if (localImageList.length === 0) {
            // 任务中止
            reportProgress(event, TaskStatus.abortTask, {
                id,
                data: {
                    error: TaskErrorEnum.noParsed
                }
            })
            return
        }

        const uploadResults = await uploadAllLocalImages(event, id, localImageList)

        const successList = generateSuccessList(uploadResults, localImageList, imageInfoList)

        const newContent = replaceImageUrlsInContent(content, successList)
        const outputPath = writeNewFile(newContent, filePath, fileName)

        // 任务结束
        reportProgress(event, TaskStatus.endTask, {
            id,
            data: {
                isBuild: !!outputPath,
                outputPath
            }
        })
    } catch (e) {
        console.error(e)

        // 任务中止
        reportProgress(event, TaskStatus.abortTask, {
            id,
            data: {
                error: Object.values(TaskErrorEnum).includes(e.message)
                    ? e.message
                    : TaskErrorEnum.unknownError
            }
        })
    }
}

/** 上传任务入口函数 */
const uploadTask = async (event, fileList = []) => {
    try {
        const promises = fileList.map((item) => taskProcess(event, item))
        await Promise.all(promises)
    } catch (e) {
        console.error('handleUpload Error:', e)
    }
}

export { uploadTask }
