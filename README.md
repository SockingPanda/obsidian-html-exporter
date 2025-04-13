# Obsidian HTML渲染导出器

这是一个用于 [Obsidian](https://obsidian.md) 的插件，可以将当前渲染视图导出为完整的HTML文件，保留所有样式和格式。

## 功能特点

- **保留样式**：导出的HTML文件包含所有必要的CSS样式，完美复制Obsidian的渲染效果
- **内联样式**：所有样式都内联在HTML文件中，无需额外的文件即可查看
- **支持暗/亮模式**：保留Obsidian的暗色/亮色主题设置
- **优化链接**：自动处理内部链接和图片路径
- **两种导出方式**：直接下载或保存到库中

## 使用方法

本插件提供两个命令：

1. **直接下载当前渲染内容**
   - 将HTML文件直接下载到您的下载文件夹
   - 使用浏览器的下载功能，便于立即分享

2. **保存当前渲染内容（简洁版）**
   - 将HTML文件保存到Obsidian库中
   - 优化文件大小，只保留必要的样式

使用步骤：
1. 在Obsidian中打开需要导出的文档
2. 按下 `Ctrl+P` 或 `Cmd+P` 打开命令面板
3. 输入"下载"或"保存"找到相应命令
4. 选择您喜欢的导出方式

## 安装方法

### 从Obsidian中安装

1. 打开Obsidian设置
2. 进入"第三方插件"
3. 禁用"安全模式"
4. 点击"浏览"
5. 搜索"HTML渲染导出器"
6. 点击安装
7. 启用插件

### 手动安装

1. 从[releases页面](https://github.com/SockingPanda/obsidian-html-exporter/releases)下载最新版本
2. 解压到您的Obsidian库的插件文件夹：`<vault>/.obsidian/plugins/`
3. 重新启动Obsidian
4. 在设置中启用插件

## 开发

- 克隆此仓库
- 运行 `npm i` 安装依赖
- 运行 `npm run dev` 开始开发

## 许可证

本项目采用 [MIT许可证](LICENSE)。

## 作者

由 [SockingPanda](https://github.com/SockingPanda) 开发。

## 支持

如果您发现任何问题或有改进建议，请在GitHub上[提交issue](https://github.com/SockingPanda/obsidian-html-exporter/issues)。
