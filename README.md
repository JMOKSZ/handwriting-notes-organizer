# Handwriting Notes Organizer

智能手写笔记整理工具，使用OCR识别和组织手写内容，帮助用户数字化和管理手写笔记。

## 功能特色

- ✍️ **手写文字识别** - 使用先进OCR技术识别手写内容
- 📝 **笔记分类** - 自动分类不同主题的笔记
- 🔍 **全文搜索** - 快速搜索笔记内容
- 📁 **智能组织** - 按主题、日期等自动整理笔记
- 📊 **笔记分析** - 提供关键词提取和摘要
- 📤 **多格式导出** - 支持导出为文本、PDF、Word等格式
- 🏷️ **标签系统** - 为笔记添加标签便于管理
- 📅 **时间线视图** - 按时间查看笔记记录

## 安装

```bash
git clone https://github.com/JMOKSZ/handwriting-notes-organizer.git
cd handwriting-notes-organizer
npm install
```

## 使用

```bash
# 处理单张笔记图片
node index.js --image ./note.jpg

# 批量处理笔记
node index.js --batch ./notes/

# 启动GUI界面
npm start

# 导出笔记数据
node index.js --export pdf
```

## 依赖

- PaddleOCR-VL-1.5 (已预配置)
- Node.js 16+
- Python 3.8+

## 配置

复制 `.env.example` 为 `.env` 并填入相应配置：

```bash
cp .env.example .env
```

## 贡献

欢迎提交Issue和Pull Request来帮助改进此项目。