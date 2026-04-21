# RunningHub 专属 Web API 映射配置册

本文档专门为“韭菜盒子”前端适配 RunningHub 生成能力而编写。
摒弃了原来的助理命令行规则，直指底层 API 的二维映射和格式校验，你的前端组件可直接参照该清单向后端下发指令。

## 一、 通用通信规范

任何一次调用，Web 后端或 Bridge JS 会组装 JSON 并提交请求。
参数分为**基础必填**与**模型特色参数**。

### 核心 Payload
```json
{
  "taskId": "<映射后的 Endpoint ID>",
  "prompt": "用户填写的文本提示词",
  "resolution": "1080p", // 有部分模型强制转为 native1080p
  "duration": "5",       // 视频默认
  // 其他多模态图片数组、视频数组等依不同任务提供
}
```

---

## 二、 二维映射名册：任务分类 -> UI 模型名 -> Endpoint 

你的前端根据【第一维度：任务类型】和【第二维度：模型选择】，查表获得【Endpoint】进行调用。

### 1. 文生图 (Task: text-to-image)
| UI 模型名推荐 | 实际 Endpoint | 特殊参数要求 |
| --- | --- | --- |
| 全能图片PRO | `rhart-image-n-pro/text-to-image` |  |
| GPT2.0 | `2046514150500524033` |  |
| 全能图片G-1.5 | `rhart-image-g-1.5/text-to-image` |  |
| 全能图片V2 | `rhart-image-n-g31-flash/text-to-image` |  |
| 全能图片V1 | `rhart-image-v1/text-to-image` |  |
| 全能图片X | `rhart-image-g/text-to-image` |  |

### 2. 图生图 (Task: image-to-image)
| UI 模型名推荐 | 实际 Endpoint | 特殊参数要求 |
| --- | --- | --- |
| 全能图片PRO | `rhart-image-n-pro/edit` | 需 imageUrls |
| GPT2.0 | `2046503667076751361` | 需 imageUrls |
| 全能图片G-1.5 | `rhart-image-g-1.5/edit` | 需 imageUrls |
| 全能图片V2 | `rhart-image-n-g31-flash/image-to-image` | 需 imageUrls |
| 全能图片V1 | `rhart-image-v1/edit` | 需 imageUrls |
| 全能图片X | `rhart-image-g/image-to-image` | 需 imageUrls |

### 3. 文生视频 (Task: text-to-video)
| UI 模型名推荐 | 实际 Endpoint | 特殊参数要求 |
| --- | --- | --- |
| Seedance2.0 | `2034917373414539273` | **resolution需强制转为 "native1080p", real_person_mode=true** |
| Seedance2.0-Fast | `2034917373414539274` | **同上** |
| 全能视频S | `rhart-video-s/text-to-video` |  |
| 全能视频S-Pro | `rhart-video-s/text-to-video-pro` |  |
| 全能视频V3.1-Pro | `rhart-video-v3.1-pro/text-to-video` |  |
| 全能视频V3.1-Fast | `rhart-video-v3.1-fast/text-to-video` |  |
| 全能视频X | `rhart-video-g/text-to-video` |  |

### 4. 图生视频 (Task: image-to-video)
| UI 模型名推荐 | 实际 Endpoint | 特殊参数要求 |
| --- | --- | --- |
| Seedance2.0 | `2034917373414539275` | 需 imageUrls。**resolution强制转 "native1080p", real_person_mode=true** |
| Seedance2.0-Fast | `2034917373414539276` | **同上** |
| 全能视频S | `rhart-video-s/image-to-video` |  |
| 全能视频S-Pro | `rhart-video-s/image-to-video-pro` |  |
| 全能视频V3.1-Pro | `rhart-video-v3.1-pro/image-to-video` |  |
| 全能视频V3.1-Fast | `rhart-video-v3.1-fast/image-to-video` |  |
| 全能视频X | `rhart-video-g/image-to-video` |  |
| 全能视频S (异步) | `rhart-video-s/image-to-video-asyn` |  |
| 全能视频R | `rhart-video-r/gen4-turbo/image-to-video`|  |

### 5. 首尾帧视频 (Task: start-end-to-video)
| UI 模型名推荐 | 实际 Endpoint | 特殊参数要求 |
| --- | --- | --- |
| 全能视频V3.1-Pro | `rhart-video-v3.1-pro/start-end-to-video` |  |
| 全能视频V3.1-Fast | `rhart-video-v3.1-fast/start-end-to-video` |  |

### 6. 多模态视频 / 参考视频 (Task: video-other)
| UI 模型名推荐 | 实际 Endpoint | 特殊参数要求 |
| --- | --- | --- |
| Seedance2.0 | `2034917373414539277` | **resolution强制转 "native1080p", real_person_mode=true** |
| Seedance2.0-Fast | `2034917373414539278` | **同上** |

### 7. 其他辅助 (Task: upload-character)
| UI 模型名推荐 | 实际 Endpoint | 特殊参数要求 |
| --- | --- | --- |
| 全能视频S-角色上传 | `rhart-video-s/sora-upload-character` | 角色图生视频前置操作 |

---

## 三、 Bridge/JS 中间件如何转换？

在配合 Web 的 Node.js 或前端代码中，通常执行以下伪代码逻辑拦截即可：

```javascript
// 假设用户在 UI 选择了 2k 分辨率
let payloadResolution = uiParams.resolution; // 例如 "2k"

const seedanceEndpoints = [
  "2034917373414539273", "2034917373414539274",
  "2034917373414539275", "2034917373414539276",
  "2034917373414539277", "2034917373414539278"
];

// 如果使用的是新版 Seedance 直连，强制开启黑科技参数
if (seedanceEndpoints.includes(apiEndpoint)) {
    payloadResolution = "native1080p"; // 拦截 UI 选择并覆写
    payload.real_person_mode = true;
}

payload.resolution = payloadResolution;
```
