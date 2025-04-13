import { Plugin, Notice } from 'obsidian';

export default class HTMLExporterPlugin extends Plugin {
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
          
          // 克隆内容
          const clonedContent = contentEl.cloneNode(true) as HTMLElement;
          
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
          
          // 替换所有内部链接和图片
          const links = clonedContent.querySelectorAll('a, img');
          links.forEach(link => {
            const src = link.getAttribute('src');
            const href = link.getAttribute('href');
            
            if (src && src.startsWith('app://')) {
              link.setAttribute('src', '');
              link.setAttribute('alt', '(应用内链接图片)');
            }
            
            if (href && href.startsWith('app://')) {
              link.setAttribute('href', '#');
              link.setAttribute('title', '(应用内链接)');
            }
          });
          
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
          
          new Notice('HTML导出成功！');
        } catch (error) {
          console.error('导出失败:', error);
          new Notice('导出失败: ' + error.message);
        }
      }
    });

    // 最简单的方法来抓取Obsidian渲染内容，专注于内容和样式
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
          `;
          
          html += '</style>\n</head>\n<body class="' + document.body.className + '">\n';
          
          // 克隆内容并复制所有类名
          const clonedContent = contentEl.cloneNode(true) as HTMLElement;
          
          // 替换所有内部链接和图片为绝对链接
          const links = clonedContent.querySelectorAll('a, img');
          links.forEach(link => {
            const src = link.getAttribute('src');
            const href = link.getAttribute('href');
            
            if (src && src.startsWith('app://')) {
              link.setAttribute('src', '');
              link.setAttribute('alt', '(应用内链接图片)');
            }
            
            if (href && href.startsWith('app://')) {
              link.setAttribute('href', '#');
              link.setAttribute('title', '(应用内链接)');
            }
          });
          
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
