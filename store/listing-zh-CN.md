# Chrome Web Store 商品信息（zh-CN）

## 名称

```
Keep Alive · 后台视频常亮
```

## 简短说明

```
让指定网站以为标签页一直在前台：切到后台视频也不降级为纯音频，切回不卡顿、不重新缓冲。
```

## 详细说明

```
Keep Alive 让指定网站以为标签页一直在前台。

很多视频网站会在你切到其它标签页时把视频降级为纯音频（只保留声音、停掉画面），切回来时再重新初始化视频解码器 —— 这就是那一下卡顿、黑屏和「缓冲中」的来源。

Keep Alive 会在页面加载前注入一段小脚本，让页面：
• 读到的 document.visibilityState 永远是 "visible"
• 读到的 document.hidden 永远是 false
• 调用 document.hasFocus() 永远返回 true
• 收不到 visibilitychange 和窗口 blur 事件
• 后台时 requestAnimationFrame 不再完全停摆

于是播放器根本不知道你切走了，也就不会降级、不会重建解码器。

【功能】
• 站点列表：只在你自己添加的网站里生效，其它网站完全不受影响
• 一键开关：点工具栏图标即可启用 / 停用当前站点
• 快速添加：内置 B 站、YouTube、腾讯视频、爱奇艺、优酷、芒果 TV、斗鱼、虎牙、Twitch、Netflix 等 16 个常用站点
• 自定义匹配：支持域名、带路径的链接和 * 通配符
• 高级选项：可单独关闭后台帧循环（省电）或拦截后台事件

【使用】
1. 安装后默认已加入 bilibili.com
2. 打开 B 站视频页并刷新一次
3. 播放视频，切到别的标签页再切回来：进度条应该一直在走，画面连续

【隐私】
• 不收集任何数据，不发起任何网络请求
• 所有代码都在安装包内，无远程代码
• 设置只保存在浏览器本地

【说明】
• 需要 Chrome / Edge 111+
• 浏览器底层的省电调度无法绕过；后台帧循环会受浏览器节流（约每秒 1 次）
• Worker 内的检测、DRM 视频、服务端心跳无法拦截
```

## 分类

工具（Tools）

## 语言

中文（简体）

## 支持与主页

- 主页 URL：`https://github.com/Eliaukzzz/pages-alive`
- 支持 URL：`https://github.com/Eliaukzzz/pages-alive/issues`
- 隐私政策 URL：`https://eliaukzzz.github.io/pages-alive/privacy.html`
