import { Plugin, Notice, TFile, MetadataCache, MarkdownRenderer, Vault } from 'obsidian';

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
    // 添加直接下载HTML的命令
    this.addCommand({
      id: 'download-rendered-content',
      name: '直接下载当前渲染内容',
      callback: async () => {
        try {
          // 尝试获取Markdown渲染内容
          const contentEl = 
            document.querySelector('.markdown-reading-view .markdown-preview-view') || 
            document.querySelector('.markdown-preview-view') ||
            document.querySelector('.workspace-leaf.mod-active .view-content') ||
            document.querySelector('.workspace-leaf.mod-active');
            
          if (!contentEl) {
            new Notice('未找到渲染内容');
          return;
        }

          // 显示处理中提示
          new Notice('正在处理图片和链接，请稍候...');
          
          // 克隆内容
          const clonedContent = contentEl.cloneNode(true) as HTMLElement;
          
          // 处理所有内部链接和图片
          await this.processInternalLinks(clonedContent);
          
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
  <title>${document.title}</title>
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
  </style>
</head>
<body class="${document.body.className}">
  ${clonedContent.outerHTML}
</body>
</html>`;
          
          // 创建并触发下载
          const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${document.title.replace(/[^\w\s]/gi, '') || 'ObsidianExport'}_${Date.now()}.html`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          new Notice('HTML导出成功！包含内嵌图片和双链信息');
        } catch (error) {
          console.error('导出失败:', error);
          new Notice('导出失败: ' + error.message);
        }
      }
    });

    // 保存当前渲染内容到Obsidian库
    this.addCommand({
      id: 'save-rendered-content',
      name: '保存当前渲染内容（简洁版）',
      callback: async () => {
        try {
          // 尝试获取渲染内容 - 先尝试Markdown阅读视图，然后尝试其他可能的内容容器
          const contentEl = 
            document.querySelector('.markdown-reading-view .markdown-preview-view') || 
            document.querySelector('.markdown-preview-view') ||
            document.querySelector('.workspace-leaf.mod-active .view-content') ||
            document.querySelector('.workspace-leaf.mod-active');
            
          if (!contentEl) {
            new Notice('未找到渲染内容');
            return;
          }
          
          // 显示处理中提示
          new Notice('正在处理图片和链接，请稍候...');
          
          // 克隆内容
          const clonedContent = contentEl.cloneNode(true) as HTMLElement;
          
          // 处理所有内部链接和图片
          await this.processInternalLinks(clonedContent);
          
          // 创建一个简化版本的HTML文档
          let html = '<!DOCTYPE html>\n<html>\n<head>\n';
          html += '<meta charset="UTF-8">\n';
          html += `<title>${document.title || 'Obsidian内容'}</title>\n`;
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
          `;
          
          html += '</style>\n</head>\n<body class="' + document.body.className + '">\n';
          
          // 添加内容
          html += clonedContent.outerHTML;
          html += '\n</body>\n</html>';
          
          // 使用当前文档名作为文件名基础
          const baseFileName = document.title.replace(/[^\w\s]/gi, '') || 'ObsidianRendered';
          const fileName = `${baseFileName}_${Date.now()}.html`;
          
          await this.app.vault.create(fileName, html);
          new Notice(`渲染内容已保存: ${fileName}`);
        } catch (error) {
          console.error('保存内容失败:', error);
          new Notice('保存内容失败: ' + error.message);
        }
      },
    });
  }
}
