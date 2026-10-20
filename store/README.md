# Chrome Web Store 上架材料

对照清单逐项上传 / 填写即可。

| 项目 | 文件 | 规格 | 状态 |
| --- | --- | --- | --- |
| 商店截图 ×5 | `screenshot-1.png` … `screenshot-5.png` | 1280×800 PNG | ✅ 已生成 |
| 小宣传图 | `promo-440x280.png` | 440×280 PNG | ✅ 已生成 |
| Marquee（可选） | `promo-1400x560.png` | 1400×560 PNG | ✅ 已生成 |
| 商店图标 | `icon-128.png` | 128×128，图形 96×96 + 16px 透明留白 | ✅ 已生成 |
| 商品文案 | `listing-zh-CN.md` | 名称 / 简短说明 / 详细说明 | ✅ 已写好 |
| 隐私政策 | `../PRIVACY.md` + `../docs/privacy.html` | 需公开 URL | ⚠️ 启用 Pages 后生效 |
| 隐私实践字段 | `privacy-practices.md` | 单一用途 / 权限理由 / 远程代码 / 数据使用 | ✅ 已写好 |
| 测试说明 | `test-instructions.md` | 审核备注 | ✅ 已写好 |
| 上传包 | `../pages-alive-1.0.0.zip` | manifest 在根目录 | ✅ 已打包 |

## 截图内容

1. `screenshot-1.png` — 设置页：站点列表 + 添加站点 + 快速添加
2. `screenshot-2.png` — 工具栏弹窗：一键开关当前站点
3. `screenshot-3.png` — B 站实测：切走再切回
4. `screenshot-4.png` — 工作原理：四件事
5. `screenshot-5.png` — 高级选项：帧循环 / 防回收 / 事件拦截

## 隐私政策 URL

1. 打开仓库 **Settings → Pages**
2. Source 选 **Deploy from a branch**
3. Branch 选 **main**，目录选 **/docs**，保存
4. 稍等 1 分钟，访问：
   `https://eliaukzzz.github.io/pages-alive/privacy.html`

如果暂时不想开 Pages，也可以先用仓库里的公开链接（Chrome 接受任意可公开访问的 URL）：

`https://github.com/Eliaukzzz/pages-alive/blob/main/PRIVACY.md`

## 重新生成素材

```bash
# 1. 把原始截图放到 .raw-shots/（见 tools/make_store_assets.py 顶部说明）
#    raw-options-top.png / raw-options-advanced.png / raw-popup.png / raw-bilibili.png
# 2. 生成
python3 tools/make_store_assets.py --raw-dir .raw-shots --out store
```

`.raw-shots/` 已在 `.gitignore` 中，不会提交。

## 打包上传

```bash
cd ..
rm -f pages-alive-1.0.0.zip
cd pages-alive
zip -r ../pages-alive-1.0.0.zip manifest.json src icons -x '*.DS_Store'
```
