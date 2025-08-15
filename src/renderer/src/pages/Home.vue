<template>
    <div class="home">
        <div class="select-box">
            <v-btn @click="selectFiles">{{ $t('home.selectFile') }}</v-btn>
        </div>

        <div class="handler-box">
            <el-scrollbar :data="fileList">
                <div class="task-list-box">
                    <a-list item-layout="horizontal" :data-source="fileList">
                        <template #renderItem="{ item }">
                            <div><Task :item="item" /></div> </template
                    ></a-list>
                </div>
            </el-scrollbar>
        </div>
    </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { v4 as uuidV4 } from 'uuid'
import Task from '@renderer/components/Task.vue'
import { TaskStatus } from '@resources/src/common/const'

const fileList = ref([])

const selectFiles = async () => {
    const selectedFiles = await window.api.selectFiles()

    const mapList = selectedFiles.map((item) => {
        return {
            id: uuidV4(),
            fileName: item.fileName,
            filePath: item.filePath,
            status: TaskStatus.waiting
        }
    })

    if (selectedFiles.length > 0) {
        // 追加而不是覆盖
        fileList.value = [...fileList.value, ...mapList]

        await window.api.uploadImage(mapList)
    }
}

// 更新任务状态
const changeTaskStatus = (status, params) => {
    const { id, data } = params

    const index = fileList.value.findIndex((item) => item.id === id)

    if (index > -1) {
        fileList.value[index].status = status
        fileList.value[index].data = data
    }
}

onMounted(async () => {
    await window.api.onTaskNotify((event, status, params) => {
        changeTaskStatus(status, params)
    })
})
</script>

<style lang="less" scoped>
.home {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;

    .select-box {
        width: 100%;
        min-height: 100px;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        top: 0;
    }

    .handler-box {
        width: 100%;
        position: relative;
        top: 0;
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding-right: 1px;

        border-top: 1px solid #e0e0e0;
        background-color: #fafafa;

        box-shadow: inset 0 1px 0 rgba(0, 0, 0, 0.02);

        .task-list-box {
            width: 100%;
            height: 100%;
        }
    }
}
</style>
