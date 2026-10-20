# 隐私实践（Privacy practices）填写内容

Chrome 开发者后台 →「隐私权」标签页，逐项粘贴。

## 单一用途说明（Single purpose）

```
让用户指定的视频网站认为标签页始终可见、聚焦，从而在切到后台时保持视频播放，避免播放器降级为纯音频以及切回时的卡顿。
```

## 权限理由（Permission justification）

**storage**

```
保存用户添加的站点列表、全局开关与高级选项。数据仅存于浏览器本地（chrome.storage.sync），不上传。
```

**scripting**

```
在用户指定的站点以 document_start 注入两段脚本：一段改写可见性/焦点判断，一段在扩展世界与页面之间传递配置。
```

**主机权限 `<all_urls>`**

```
站点列表由用户自行填写，扩展需要具备向任意站点注册内容脚本的能力。实际注册只发生在用户列表中的站点，
未加入列表的网站不会被注入脚本、也不会被读取内容。
```

## 远程代码（Remote code）

```
No — 本扩展不使用远程代码。所有 JavaScript 都包含在安装包内，不加载远程脚本，也不在运行时获取或执行任何远程代码。
```

## 数据使用（Data usage）

- 收集的数据类型：**全不勾选**（不收集任何用户数据）
- 承诺：
  - 不出售或转让用户数据
  - 不将数据用于与单一用途无关的目的
  - 不将数据用于判定信用度或放贷

## 隐私政策 URL

```
https://eliaukzzz.github.io/pages-alive/privacy.html
```

（仓库里的 `docs/privacy.html`；在 GitHub 仓库 Settings → Pages 里选择 `main` 分支的 `/docs` 目录即可启用。）
