# dsh-action-float

**DeepSeek Harness 的操作浮现插件**——用轻量浮层实时显示真实文件 diff 和命令状态。

[English](README.md)

AI 修改文件或执行命令时，插件把实际发生的操作显示在当前回复区域或输入框上方；不占排版空间、不推挤对话，也不注册聊天节点。

## 当前效果

- **自动定位**：找当前回合第一块回复内容和输入框，取两者更高的顶部作为锚点，浮层停在其上方 8px；滚动、缩放时持续重算。
- **纯文字优先**：默认没有明显卡片边框；使用主题色光晕、双层径向底衬和 5px 毛玻璃，中心清楚、边缘柔和。底衬只包住文字行，右侧空白不铺毛玻璃。
- **悬停**：暂停淡出，显示完整文本框和 12px 背景模糊。
- **最多 5 行**：超出部分排队，大 diff 用代表性行 + 摘要，避免动画积压。
- **不改变排版**：固定浮层、零布局占位；不注册 `conversation.chat.*`，避免破坏对话投影。
- **按会话隔离**：事件按 `sessionId` 分桶，设置支持当前会话覆盖。
- **主题适配**：颜色全部来自 Harness 主题 token，支持明暗主题。

## 显示内容

### 文件修改

- 新增：绿色 `+ 代码`。
- 删除：红色 `− 代码`。
- 替换：红色旧行 + 绿色新行。
- 每行附 `文件名:行号`。
- 数据来自 `edit` / `write` 工具结果的真实 `before` / `after`，不是猜测模型参数。
- 详情最多展示 2000 行。

### 命令执行

- 开始：蓝色命令行 + “运行中”。
- 成功：绿色“成功”；失败：橙色“失败”；附耗时和退出码。
- 完整输出按需加载，最多 24 KB。
- 前台、后台、超时和中止命令统一处理。

## 安装

将本目录安装为本地 bundle：

```text
plugin_manager action=install_bundle target=C:\path\to\dsh-action-float
```

也可以从 Plugin Manager 选择本地目录安装。安装后刷新一次 Web UI，让最新 Client bundle 生效。

### 从 npm 安装

包已发布到 npm，可直接按包名安装：

```text
plugin_manager action=install_bundle target=dsh-action-float
```

需要固定版本时使用 `dsh-action-float@1.0.1`。包页面地址为 `https://www.npmjs.com/package/dsh-action-float`。

## 使用

1. 让 AI 执行命令或修改文件。
2. 浮层显示在回复区域或输入框上方。
3. 鼠标移入暂停淡出并显示文本框。
4. 点击一行查看完整内容；`Esc` 或点击外部关闭。
5. 打开 **Settings → dsh-action-float** 调整。

## 设置

- 应用范围：所有会话 / 当前会话。
- 字号：9–20px。
- 停留时间：2–15 秒。
- 动画速度：400–4000ms。
- 恢复默认、实时预览。

位置自动计算，不提供手动位置选项。设置保存在本机浏览器。

## 设计

- **Host**：监听 `tools/execute` / `tools/result`，按会话缓存事件；用 `webServer` 提供 SSE 与详情接口，并用 `ctx.connection` 做浏览鉴权。
- **Client**：只注册 `conversation.input.dock` 和 `settings.section`；通过页面锚点计算固定浮层位置，不注册 `conversation.chat.node`。
- **定位公式**：`anchorTop = max(12, min(回复块顶部, 输入框顶部))`，浮层底部在其上方 8px。
- **动画**：`requestAnimationFrame` 控制每行上移/淡出；悬停或查看详情时暂停。

## 测试

```powershell
cd dsh-action-float
node --check index.js
node --check client.js
node --test test/*.test.js
```

当前 17 项测试通过，覆盖行号、增删、替换、跨 hunk、大改动退化、5 行折叠、详情截断、包元数据、语言资源、定位与可读性样式不变量。

## 限制

- 同时最多 5 行、24 行待播；详情 2000 行，命令输出 24 KB。
- 使用 DSH 默认插件图标，不附带自定义图标。
- 锚点依赖当前 Harness Web UI 的 DOM 数据属性；变化时回退到输入框上方。
- 不做自动化像素级截图回归；升级 Harness 后建议人工确认位置。

## 作者

chenqi18357

## 许可证

MIT，见 [LICENSE](LICENSE)。

Copyright © 2026 chenqi18357.
