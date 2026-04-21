/**
 * RunningHub Bridge - 专属线上 Web (韭菜盒子) 的全栈 API 中间件
 * 完全抛弃 Python 脚本，采用纯原生 JS Fetch，内置 31 个精简模型二维字典和参数魔法补全
 */

const BASE_URL = "https://www.runninghub.cn/openapi/v2";
const POLL_ENDPOINT = "/query";

// 二维目录映射字典（分类 -> 模型名称 -> 真实端点）
// 这个字典和你在前端 UI 上渲染的 <select> 选项完全对齐
const ENDPOINT_MAP = {
    "文生图": {
        "全能图片PRO": "rhart-image-n-pro/text-to-image",
        "GPT2.0": "2046514150500524033",
        "全能图片G-1.5": "rhart-image-g-1.5/text-to-image",
        "全能图片V2": "rhart-image-n-g31-flash/text-to-image",
        "全能图片V1": "rhart-image-v1/text-to-image",
        "全能图片X": "rhart-image-g/text-to-image"
    },
    "图生图": {
        "全能图片PRO": "rhart-image-n-pro/edit",
        "GPT2.0": "2046503667076751361",
        "全能图片G-1.5": "rhart-image-g-1.5/edit",
        "全能图片V2": "rhart-image-n-g31-flash/image-to-image",
        "全能图片V1": "rhart-image-v1/edit",
        "全能图片X": "rhart-image-g/image-to-image"
    },
    "文生视频": {
        "Seedance2.0": "2034917373414539273",
        "Seedance2.0-Fast": "2034917373414539274",
        "全能视频S": "rhart-video-s/text-to-video",
        "全能视频S-Pro": "rhart-video-s/text-to-video-pro",
        "全能视频V3.1-Pro": "rhart-video-v3.1-pro/text-to-video",
        "全能视频V3.1-Fast": "rhart-video-v3.1-fast/text-to-video",
        "全能视频X": "rhart-video-g/text-to-video"
    },
    "图生视频": {
        "Seedance2.0": "2034917373414539275",
        "Seedance2.0-Fast": "2034917373414539276",
        "全能视频S": "rhart-video-s/image-to-video",
        "全能视频S-Pro": "rhart-video-s/image-to-video-pro",
        "全能视频V3.1-Pro": "rhart-video-v3.1-pro/image-to-video",
        "全能视频V3.1-Fast": "rhart-video-v3.1-fast/image-to-video",
        "全能视频X": "rhart-video-g/image-to-video",
        "全能视频S(异步)": "rhart-video-s/image-to-video-asyn",
        "全能视频R": "rhart-video-r/gen4-turbo/image-to-video"
    },
    "首尾帧视频": {
        "全能视频V3.1-Pro": "rhart-video-v3.1-pro/start-end-to-video",
        "全能视频V3.1-Fast": "rhart-video-v3.1-fast/start-end-to-video"
    },
    "多模态视频": {
        "Seedance2.0": "2034917373414539277",
        "Seedance2.0-Fast": "2034917373414539278"
    }
};

const SEEDANCE_ENDPOINTS = [
    "2034917373414539273", "2034917373414539274",
    "2034917373414539275", "2034917373414539276",
    "2034917373414539277", "2034917373414539278"
];

class RunningHubBridge {
    constructor(apiKey) {
        if (!apiKey) throw new Error("RunningHub API Key is required");
        this.apiKey = apiKey;
    }

    /**
     * 根据前端的输入选项，组装最合规的下沉 Payload
     */
    _buildPayload(taskType, modelName, uiParams) {
        const categoryMap = ENDPOINT_MAP[taskType];
        if (!categoryMap) throw new Error(`不支持的任务类型: ${taskType}`);
        
        const endpoint = categoryMap[modelName];
        if (!endpoint) throw new Error(`类型 ${taskType} 下不存在模型: ${modelName}`);

        let payload = { ...uiParams };

        // ======== 脏活累活自动拦截处理区 ========

        // 1. 如果是 Seedance 相关的，强行将我们 UI 解析出的 2k/4k 替换为底层独占的 `native1080p` 
        if (SEEDANCE_ENDPOINTS.includes(endpoint)) {
            // 特殊魔法替换
            payload.resolution = "native1080p";
            payload.real_person_mode = true;
            if(!payload.duration) payload.duration = "5";
            if(!payload.ratio) payload.ratio = "16:9";
        } else {
            // 其他模型则使用 1k, 2k, 4k 这种通用方案 (部分前端可能是 1080p，这里统一保持原样)
            if(!payload.resolution) payload.resolution = "1080p";
        }

        return { endpoint, payload };
    }

    /**
     * 公共生成接口（发起与一键返回结果）
     * 适合给 WebServer 发起
     */
    async generateMedia(taskType, modelName, uiParams) {
        const { endpoint, payload } = this._buildPayload(taskType, modelName, uiParams);
        
        console.log(`[RunningHub-Bridge] 提交 ${taskType} (${modelName}) 任务 -> ${endpoint}`);
        
        const submitUrl = `${BASE_URL}/${endpoint}`;
        
        // 1. 提交任务
        const submitRes = await fetch(submitUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(payload)
        });

        if (!submitRes.ok) throw new Error(`[RunningHub网络错误] ${submitRes.status} ${submitRes.statusText}`);
        
        const submitJson = await submitRes.json();
        const taskId = submitJson.taskId;
        if (!taskId) {
            throw new Error(`[RunningHub创建失败] ${JSON.stringify(submitJson)}`);
        }
        
        // 如果极个别极速模型无需轮询直接返回，则提取 URL
        if (submitJson.status === "SUCCESS" && submitJson.results?.length > 0) {
            return this._extractResult(submitJson);
        }

        // 2. 否则进入轮询等待
        return await this.pollTask(taskId);
    }

    /**
     * 轮询任务封装
     */
    async pollTask(taskId, maxTimeoutSec = 1200, intervalMs = 5000) {
        const pollUrl = `${BASE_URL}${POLL_ENDPOINT}`;
        const startTime = Date.now();

        console.log(`[RunningHub-Bridge] 开始轮询任务: ${taskId}`);

        while (Date.now() - startTime < maxTimeoutSec * 1000) {
            await new Promise(resolve => setTimeout(resolve, intervalMs));
            
            const pollRes = await fetch(pollUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({ taskId })
            });

            if (!pollRes.ok) continue; // 容忍偶尔的网络抖动
            
            const pollJson = await pollRes.json();
            const status = pollJson.status;

            if (status === "SUCCESS") {
                return this._extractResult(pollJson);
            } 
            if (status === "FAILED") {
                throw new Error(`[任务生成失败] ${pollJson.errorMessage || "未知原因"} (Code: ${pollJson.errorCode})`);
            }
            // "RUNNING" 等状态则继续
        }

        throw new Error(`[超时] 轮询超过最大等待时间`);
    }

    /**
     * 提取结果及花费
     */
    _extractResult(respJson) {
        if (!respJson.results || respJson.results.length === 0) {
            throw new Error("API 返回了成功但结果为空！");
        }

        const resultItem = respJson.results[0];
        const resultUrl = resultItem.url || resultItem.outputUrl;
        const textResult = resultItem.text || resultItem.content || resultItem.output;

        const usage = respJson.usage || {};
        const cost = usage.consumeMoney || usage.thirdPartyConsumeMoney || 0;

        return {
            url: resultUrl || null,
            text: textResult || null,
            cost: cost,
            taskId: respJson.taskId
        };
    }
}

module.exports = { RunningHubBridge, ENDPOINT_MAP };
