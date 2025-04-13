import { Plugin, Notice, TFile, MetadataCache, MarkdownRenderer, Vault, Component, MarkdownView } from 'obsidian';

export default class HTMLExporterPlugin extends Plugin {
  // 转换图片为base64格式的函数
  async getImageBase64(file: TFile): Promise<string> {
    try {
      const arrayBuffer = await this.app.vault.readBinary(file);
      const base64 = this.arrayBufferToBase64(arrayBuffer);
      const mimeType = this.getMimeType(file.extension);
      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      console.error(`Error converting image to base64: ${file.path}`, error);
      return '';
    }
  }
  
  // 将ArrayBuffer转换为base64
  arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
  
  // 根据文件扩展名获取MIME类型
  getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'webp': 'image/webp',
      'bmp': 'image/bmp',
      'tiff': 'image/tiff',
      'tif': 'image/tiff'
    };
    
    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
  }

  // 规范化文件路径，处理空格和查询参数
  normalizePath(path: string): string {
    // 移除查询参数（?之后的内容）
    if (path.includes('?')) {
      path = path.split('?')[0];
    }
    
    // 确保路径中的空格被正确处理
    path = path.replace(/%20/g, ' ').replace(/\+/g, ' ');
    
    // 移除URL前缀
    path = path.replace(/^app:\/\/.*?\//, '');
    
    // 规范化路径分隔符
    path = path.replace(/\\/g, '/');
    
    return path;
  }

  // 查找文件的辅助函数
  findFile(path: string): TFile | null {
    const vault = this.app.vault;
    
    // 尝试直接通过完整路径查找
    let file = vault.getFiles().find(f => f.path === path);
    if (file) return file;
    
    // 尝试通过文件名查找
    const basename = path.split('/').pop() || '';
    file = vault.getFiles().find(f => f.basename === basename || f.name === basename);
    if (file) return file;
    
    // 尝试通过部分路径匹配查找
    file = vault.getFiles().find(f => f.path.endsWith(path) || f.path.includes(path));
    if (file) return file;
    
    // 尝试不区分大小写查找
    const lowerPath = path.toLowerCase();
    const lowercaseFile = vault.getFiles().find(f => 
      f.path.toLowerCase() === lowerPath || 
      f.path.toLowerCase().endsWith(lowerPath) ||
      f.basename.toLowerCase() === lowerPath.split('/').pop()
    );
    
    return lowercaseFile || null;
  }

  // 处理Obsidian内部链接
  async processInternalLinks(element: HTMLElement): Promise<void> {
    // 获取元数据缓存
    const metadataCache = this.app.metadataCache;
    const vault = this.app.vault;
    
    // 处理图片链接
    const imageElements = element.querySelectorAll('img');
    const processedPaths: Record<string, string> = {};
    
    for (let i = 0; i < imageElements.length; i++) {
      const img = imageElements[i];
      const src = img.getAttribute('src');
      
      if (src) {
        // 处理Obsidian内部图片链接
        if (src.startsWith('app://') || src.startsWith('data:')) {
          // 尝试从src提取文件路径
          try {
            // 检查是否已处理过相同的路径
            if (processedPaths[src]) {
              img.setAttribute('src', processedPaths[src]);
              continue;
            }
            
            // 规范化路径
            let path = this.normalizePath(src);
            console.log(`处理图片路径: ${path}`);
            
            // 查找对应的文件
            const file = this.findFile(path);
            
            if (file) {
              // 转换为base64并替换src
              const base64 = await this.getImageBase64(file);
              if (base64) {
                img.setAttribute('src', base64);
                img.removeAttribute('data-src'); // 移除可能存在的data-src属性
                processedPaths[src] = base64; // 缓存处理结果
              }
            } else {
              console.warn(`File not found: ${path}`);
              // 替换为空白图片，防止断链
              img.setAttribute('src', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=');
              img.setAttribute('alt', `(图片未找到: ${path})`);
              processedPaths[src] = img.getAttribute('src') || ''; // 缓存处理结果
            }
          } catch (error) {
            console.error('Error processing image:', error);
          }
        }
      }
    }
    
    // 处理internal-embed类的span元素（通常是粘贴的图片）
    const embedSpans = element.querySelectorAll('span.internal-embed');
    
    for (let i = 0; i < embedSpans.length; i++) {
      const span = embedSpans[i];
      const srcAttr = span.getAttribute('src');
      const altAttr = span.getAttribute('alt');
      
      if (srcAttr && srcAttr.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i)) {
        try {
          // 查找对应的图片文件
          let path = srcAttr;
          console.log(`处理内嵌图片: ${path}`);
          
          // 查找文件
          const file = this.findFile(path);
          
          if (file) {
            // 转换为base64格式
            const base64 = await this.getImageBase64(file);
            
            if (base64) {
              // 创建img元素替换span
              const img = document.createElement('img');
              img.setAttribute('src', base64);
              img.setAttribute('alt', altAttr || file.basename);
              if (span.classList.contains('image-embed')) img.classList.add('image-embed');
              span.parentElement?.replaceChild(img, span);
            }
          } else {
            console.warn(`内嵌图片未找到: ${path}`);
            // 替换为空白图片，防止断链
            const img = document.createElement('img');
            img.setAttribute('src', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=');
            img.setAttribute('alt', `(图片未找到: ${path})`);
            span.parentElement?.replaceChild(img, span);
          }
        } catch (error) {
          console.error('处理内嵌图片错误:', error);
        }
      }
    }
    
    // 处理Obsidian内部链接（双链）
    const linkElements = element.querySelectorAll('a.internal-link');
    
    for (let i = 0; i < linkElements.length; i++) {
      const link = linkElements[i];
      const href = link.getAttribute('href');
      
      if (href) {
        try {
          // 解析链接
          let linkPath = href;
          let linkSection = '';
          
          // 从app://开头的链接中提取路径
          if (href.startsWith('app://')) {
            linkPath = this.normalizePath(href);
          }
          
          // 分离文件路径和片段部分(#部分)
          if (linkPath.includes('#')) {
            const parts = linkPath.split('#');
            linkPath = parts[0];
            linkSection = parts[1] || '';
          }
          
          // 使用元数据缓存解析链接对应的实际文件
          let file: TFile | null = null;
          
          if (linkPath) {
            // 尝试使用metadataCache.getFirstLinkpathDest获取文件
            const resolvedFile = metadataCache.getFirstLinkpathDest(linkPath, '');
            if (resolvedFile) {
              file = resolvedFile;
            } else {
              // 如果上面的方法找不到，尝试直接在vault中查找
              file = this.findFile(linkPath);
            }
          }
          
          // 获取链接文本作为替代显示
          const linkText = link.textContent || href;
          
          // 更新链接属性
          link.setAttribute('href', '#');
          link.classList.add('exported-internal-link');
          
          // 准备链接显示的提示信息
          let tooltipInfo = '';
          if (file) {
            tooltipInfo = `文件: ${file.basename}`;
            if (linkSection) {
              tooltipInfo += ` • 位置: ${linkSection}`;
            }
          } else {
            tooltipInfo = `内部链接: ${linkText}`;
          }
          
          link.setAttribute('title', tooltipInfo);
          
          // 添加一个特殊的数据属性，用于可能的进一步处理
          if (file) {
            link.setAttribute('data-link-path', file.path);
            if (linkSection) {
              link.setAttribute('data-link-section', linkSection);
            }
          }
        } catch (error) {
          console.error('Error processing link:', error);
          // 保留一个基本的链接显示
          link.setAttribute('href', '#');
          link.setAttribute('title', `内部链接处理错误`);
          link.classList.add('exported-internal-link');
        }
      }
    }
  }

  async onload() {
    // 添加新的命令：强制渲染整个文件并导出
    this.addCommand({
      id: 'export-full-file-content',
      name: '导出整个文件内容（强制渲染所有部分）',
      callback: async () => {
        try {
          // 获取当前活动编辑器
          const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
          
          if (!activeView) {
            new Notice('没有找到活动的Markdown文件');
            return;
          }
          
          // 获取文件对象
          const file = activeView.file;
          if (!file) {
            new Notice('无法获取当前文件');
            return;
          }
          
          // 显示处理中提示
          new Notice('正在渲染整个文件内容，请稍候...');
          
          // 读取文件内容
          const fileContent = await this.app.vault.read(file);
          
          // 创建临时元素来渲染内容
          const tempDiv = document.createElement('div');
          tempDiv.className = 'markdown-preview-view markdown-rendered';
          
          // 使用Obsidian的MarkdownRenderer渲染整个内容
          await MarkdownRenderer.renderMarkdown(
            fileContent, 
            tempDiv, 
            file.path, 
            this
          );
          
          // 处理所有内部链接和图片
          await this.processInternalLinks(tempDiv);
          
          // 内联所有CSS样式
          const styles = Array.from(document.styleSheets).map(sheet => {
            try {
              return Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n');
            } catch (e) {
              console.warn('跳过一个无法读取的样式表', e);
              return '';
            }
          }).join('\n');
          
          const styleTag = document.createElement('style');
          styleTag.textContent = styles;
          
          // 创建完整HTML
          const fullHtml = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${file.basename}</title>
  ${styleTag.outerHTML}
  <style>
    body { 
      margin: 0; 
      padding: 20px; 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
      line-height: 1.6;
      background-color: var(--background-primary);
      color: var(--text-normal);
    }
    
    /* 禁用所有外部字体加载，使用系统字体 */
    @font-face {
      font-family: 'all-external-fonts';
      src: local('Arial');
      font-display: swap;
    }
    
    /* 使用系统字体代替所有其他字体 */
    * {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
    }
    
    .markdown-preview-view {
      padding: 0;
      margin: 0 auto;
    }
    
    .theme-dark {
      --background-primary: #202020;
      --background-secondary: #303030;
      --text-normal: #dcddde;
      --text-muted: #999;
      --text-accent: #7f6df2;
      --interactive-accent: #7f6df2;
    }
    
    .theme-light {
      --background-primary: #ffffff;
      --background-secondary: #f5f6f8;
      --text-normal: #1f2937;
      --text-muted: #6b7280;
      --text-accent: #705dcf;
      --interactive-accent: #705dcf;
    }
    
    /* 确保水平分隔线样式正确 */
    hr {
      border: none;
      border-top: 1px solid var(--text-muted);
      height: 1px;
      margin: 2em 0;
      background-color: var(--text-muted);
    }

    /* 导出的内部链接样式 */
    .exported-internal-link {
      color: var(--text-accent);
      text-decoration: none;
      border-bottom: 1px dashed var(--text-accent);
      cursor: help;
      position: relative;
    }
    
    .exported-internal-link:hover {
      text-decoration: none;
      border-bottom: 1px solid var(--text-accent);
    }
    
    .exported-internal-link[data-link-section]:after {
      content: attr(data-link-section);
      font-size: 0.8em;
      opacity: 0.7;
      margin-left: 0.3em;
      vertical-align: super;
    }
    
    /* 移动设备响应式调整 */
    @media (max-width: 800px) {
      body {
        padding: 15px;
      }
    }
  </style>
</head>
<body class="${document.body.className}">
  ${tempDiv.outerHTML}
</body>
</html>`;
          
          // 创建并触发下载
          const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${file.basename}_完整内容_${Date.now()}.html`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          new Notice('完整HTML导出成功！');
        } catch (error) {
          console.error('导出失败:', error);
          new Notice('导出失败: ' + error.message);
        }
      }
    });

    // 添加简洁版的全文渲染导出命令
    this.addCommand({
      id: 'save-full-rendered-content',
      name: '保存整个文件内容（简洁版）',
      callback: async () => {
        try {
          // 获取当前活动编辑器
          const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
          
          if (!activeView) {
            new Notice('没有找到活动的Markdown文件');
            return;
          }
          
          // 获取文件对象
          const file = activeView.file;
          if (!file) {
            new Notice('无法获取当前文件');
            return;
          }
          
          // 显示处理中提示
          new Notice('正在渲染整个文件内容，请稍候...');
          
          // 读取文件内容
          const fileContent = await this.app.vault.read(file);
          
          // 创建临时元素来渲染内容
          const tempDiv = document.createElement('div');
          tempDiv.className = 'markdown-preview-view markdown-rendered node-insert-event is-readable-line-width allow-fold-headings allow-fold-lists show-indentation-guide show-properties';
          
          // 添加tabindex div
          const tabIndexDiv = document.createElement('div');
          tabIndexDiv.tabIndex = -1;
          
          // 添加markdown-preview-sizer
          const previewSizerDiv = document.createElement('div');
          previewSizerDiv.className = 'markdown-preview-sizer markdown-preview-section';
          
          tempDiv.appendChild(tabIndexDiv);
          tabIndexDiv.appendChild(previewSizerDiv);
          
          // 使用Obsidian的MarkdownRenderer渲染整个内容
          await MarkdownRenderer.renderMarkdown(
            fileContent, 
            previewSizerDiv, 
            file.path, 
            this
          );
          
          // 处理所有内部链接和图片
          await this.processInternalLinks(previewSizerDiv);
          
          // 创建一个简化版本的HTML文档
          let html = '<!DOCTYPE html>\n<html>\n<head>\n';
          html += '<meta charset="UTF-8">\n';
          html += '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
          html += `<title>${file.basename || 'Obsidian内容'}</title>\n`;
          html += '<style>\n';
          
          // 只收集必要的样式
          const essentialStyles = [
            // 基本样式
            'body', '.theme-dark', '.theme-light', 
            // 内容样式
            '.markdown-preview-view', '.markdown-rendered', 
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'blockquote',
            'code', 'pre', '.admonition', '.callout',
            // 表格样式
            'table', 'th', 'tr', 'td',
            // 链接和图片
            'a', 'img', '.image-embed', '.internal-embed',
            // 各种格式
            'strong', 'em', 'mark', 'del',
            // 各种块和引用
            '.block-language-', '.math', '.MathJax', 
            // 图表
            '.chart-container',
            // 常用样式类
            '.cm-', '.is-', '.mod-', '.nav-', '.view-',
            '.frontmatter', '.frontmatter-container',
            // 水平分隔线
            'hr', '.markdown-preview-section hr'
          ];
          
          // 使用正则表达式过滤相关样式
          const stylePatterns = essentialStyles.map(s => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
          
          // 收集样式
          const styleSheets = document.styleSheets;
          for (let i = 0; i < styleSheets.length; i++) {
            try {
              const cssRules = styleSheets[i].cssRules;
              for (let j = 0; j < cssRules.length; j++) {
                const rule = cssRules[j];
                // 只保留与内容相关的样式规则
                if (stylePatterns.some(pattern => pattern.test(rule.cssText))) {
                  html += rule.cssText + '\n';
                }
              }
            } catch (e) {
              console.warn('无法访问样式表:', e);
            }
          }
          
          // 添加额外的自定义样式以确保外观正确
          html += `
            body { 
              margin: 0; 
              padding: 20px; 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
              line-height: 1.6;
              background-color: var(--background-primary);
              color: var(--text-normal);
            }
            
            /* 禁用所有外部字体加载，使用系统字体 */
            @font-face {
              font-family: 'all-external-fonts';
              src: local('Arial');
              font-display: swap;
            }
            
            /* 使用系统字体代替所有其他字体 */
            * {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
            }
            
            .markdown-preview-view {
              padding: 0;
              margin: 0 auto;
            }
            
            .theme-dark {
              --background-primary: #202020;
              --background-secondary: #303030;
              --text-normal: #dcddde;
              --text-muted: #999;
              --text-accent: #7f6df2;
              --interactive-accent: #7f6df2;
            }
            
            .theme-light {
              --background-primary: #ffffff;
              --background-secondary: #f5f6f8;
              --text-normal: #1f2937;
              --text-muted: #6b7280;
              --text-accent: #705dcf;
              --interactive-accent: #705dcf;
            }
            
            /* 确保水平分隔线样式正确 */
            hr {
              border: none;
              border-top: 1px solid var(--text-muted);
              height: 1px;
              margin: 2em 0;
              background-color: var(--text-muted);
            }


            /* 导出的内部链接样式 */
            .exported-internal-link {
              color: var(--text-accent);
              text-decoration: none;
              border-bottom: 1px dashed var(--text-accent);
              cursor: help;
              position: relative;
            }
            
            .exported-internal-link:hover {
              text-decoration: none;
              border-bottom: 1px solid var(--text-accent);
            }
            
            .exported-internal-link[data-link-section]:after {
              content: attr(data-link-section);
              font-size: 0.8em;
              opacity: 0.7;
              margin-left: 0.3em;
              vertical-align: super;
            }

            /* 移动设备响应式调整 */
            @media (max-width: 800px) {
              body {
                padding: 15px;
              }
            }
          `;
          
          html += '</style>\n</head>\n<body class="' + document.body.className + '">\n';
          
          // 添加内容
          html += tempDiv.outerHTML;
          html += '\n</body>\n</html>';
          
          // 使用当前文档名作为文件名基础
          const baseFileName = file.basename.replace(/[^\w\s]/gi, '') || 'ObsidianFullRendered';
          const fileName = `${baseFileName}_完整内容_${Date.now()}.html`;
          
          await this.app.vault.create(fileName, html);
          new Notice(`完整渲染内容已保存: ${fileName}`);
        } catch (error) {
          console.error('保存内容失败:', error);
          new Notice('保存内容失败: ' + error.message);
        }
      },
    });
  }
}
