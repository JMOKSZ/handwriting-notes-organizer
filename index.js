/**
 * Handwriting Notes Organizer
 * 智能手写笔记整理工具
 */

require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const xlsx = require('xlsx');
const moment = require('moment');
const { PDFDocument, rgb } = require('pdf-lib');

class HandwritingNotesOrganizer {
  constructor() {
    this.notesDB = []; // 简单内存数据库
    this.uploadDir = './uploads';
    this.processedDir = './processed';
    this.organizedDir = './organized';
    this.initDirectories();
  }

  /**
   * 初始化目录
   */
  async initDirectories() {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
      await fs.mkdir(this.processedDir, { recursive: true });
      await fs.mkdir(this.organizedDir, { recursive: true });
      await fs.mkdir(path.join(this.organizedDir, 'by_date'), { recursive: true });
      await fs.mkdir(path.join(this.organizedDir, 'by_topic'), { recursive: true });
      await fs.mkdir(path.join(this.organizedDir, 'by_tag'), { recursive: true });
    } catch (error) {
      console.error('初始化目录时出错:', error.message);
    }
  }

  /**
   * 使用PaddleOCR识别手写内容
   */
  async recognizeHandwriting(imagePath) {
    try {
      // 使用Python脚本调用PaddleOCR
      const pythonScript = `
import sys
sys.path.append('/opt/homebrew/lib/python3.12/site-packages')
import cv2
import paddle
from paddleocr import PaddleOCR

# 初始化OCR，针对手写优化
ocr = PaddleOCR(use_angle_cls=True, lang='ch', det_model_dir=None, rec_model_dir=None)

# 读取图像
result = ocr.ocr('${imagePath}', cls=True)

# 提取文本及其位置信息
elements = []
for idx in range(len(result)):
    res = result[idx]
    for line in res:
        text = line[1][0]
        confidence = line[1][1]
        bbox = line[0]  # 边界框坐标
        elements.append({
            'text': text,
            'confidence': confidence,
            'bbox': bbox
        })

# 输出结果
import json
print(json.dumps(elements))
`;

      // 将Python脚本保存到临时文件
      const tempPyFile = path.join(this.uploadDir, 'temp_handwriting_ocr_script.py');
      await fs.writeFile(tempPyFile, pythonScript, 'utf8');

      // 执行Python脚本
      const { stdout, stderr } = await execAsync(`python3 ${tempPyFile}`);
      
      if (stderr) {
        console.error('Python脚本执行警告:', stderr);
      }

      // 解析OCR结果
      const elements = JSON.parse(stdout.trim());
      
      // 提取纯文本
      const extractedText = elements.map(el => el.text).join(' ');
      
      // 计算平均置信度
      const avgConfidence = elements.reduce((sum, el) => sum + el.confidence, 0) / elements.length;
      
      return {
        success: true,
        extractedText: extractedText,
        elements: elements,
        avgConfidence: avgConfidence,
        imagePath: imagePath
      };
    } catch (error) {
      console.error('手写识别过程中出错:', error.message);
      return {
        success: false,
        error: error.message,
        imagePath: imagePath
      };
    }
  }

  /**
   * 分析笔记内容并提取主题
   */
  async analyzeNoteContent(extractedText) {
    try {
      // 使用AI分析笔记内容
      const systemPrompt = `你是一位专业的笔记分析师，擅长从文本中提取主题、关键词和摘要。请分析以下笔记内容。`;

      const userPrompt = `请分析以下笔记内容并提供：
      1. 主题分类
      2. 关键词列表
      3. 内容摘要
      4. 建议标签
      5. 重要程度评级（低/中/高）
      
      笔记内容：
      ${extractedText.substring(0, 2000)}`;

      // 这里我们模拟AI分析结果
      // 在实际应用中，这里会调用OpenAI API
      const keywords = this.extractKeywords(extractedText);
      const topic = this.inferTopic(extractedText);
      const summary = extractedText.substring(0, 200) + (extractedText.length > 200 ? '...' : '');
      const tags = this.suggestTags(extractedText);

      return {
        topic: topic,
        keywords: keywords,
        summary: summary,
        tags: tags,
        importance: this.assessImportance(extractedText),
        wordCount: extractedText.split(/\s+/).length
      };
    } catch (error) {
      console.error('分析笔记内容时出错:', error.message);
      return {
        topic: '未知主题',
        keywords: [],
        summary: extractedText.substring(0, 100) + '...',
        tags: ['未分类'],
        importance: '中',
        wordCount: extractedText.split(/\s+/).length
      };
    }
  }

  /**
   * 提取关键词（简单实现）
   */
  extractKeywords(text) {
    // 简单的关键词提取逻辑
    const commonWords = ['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这'];
    const words = text.replace(/[^\u4e00-\u9fa5a-zA-Z\s]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !commonWords.includes(w));
    
    // 统计词频
    const wordFreq = {};
    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });
    
    // 返回频率最高的前5个词
    return Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(entry => entry[0]);
  }

  /**
   * 推断主题（简单实现）
   */
  inferTopic(text) {
    const textLower = text.toLowerCase();
    
    if (textLower.includes('会议') || textLower.includes('讨论') || textLower.includes('议题')) {
      return '会议记录';
    } else if (textLower.includes('学习') || textLower.includes('笔记') || textLower.includes('课堂')) {
      return '学习笔记';
    } else if (textLower.includes('项目') || textLower.includes('任务') || textLower.includes('计划')) {
      return '项目管理';
    } else if (textLower.includes('想法') || textLower.includes('思考') || textLower.includes('反思')) {
      return '思维笔记';
    } else if (textLower.includes('待办') || textLower.includes('todo') || textLower.includes('清单')) {
      return '待办事项';
    } else {
      return '通用笔记';
    }
  }

  /**
   * 建议标签（简单实现）
   */
  suggestTags(text) {
    const tags = [];
    const textLower = text.toLowerCase();
    
    if (textLower.includes('工作') || textLower.includes('项目') || textLower.includes('会议')) {
      tags.push('工作');
    }
    if (textLower.includes('学习') || textLower.includes('知识') || textLower.includes('教育')) {
      tags.push('学习');
    }
    if (textLower.includes('生活') || textLower.includes('日常') || textLower.includes('个人')) {
      tags.push('生活');
    }
    if (textLower.includes('技术') || textLower.includes('代码') || textLower.includes('开发')) {
      tags.push('技术');
    }
    
    return tags.length > 0 ? tags : ['未分类'];
  }

  /**
   * 评估重要程度（简单实现）
   */
  assessImportance(text) {
    const urgentTerms = ['紧急', '尽快', '立刻', '马上', 'deadline', '截止'];
    const importantTerms = ['重要', '关键', '核心', '主要', '重点', '必须'];
    
    if (urgentTerms.some(term => text.includes(term))) {
      return '高';
    } else if (importantTerms.some(term => text.includes(term))) {
      return '中';
    } else {
      return '低';
    }
  }

  /**
   * 保存笔记信息到数据库
   */
  async saveNote(noteData) {
    const noteRecord = {
      id: Date.now(), // 简单ID生成
      ...noteData,
      createdAt: new Date().toISOString()
    };

    this.notesDB.push(noteRecord);
    console.log(`笔记已保存: ${noteRecord.id}`);

    // 保存到文件（模拟数据库）
    await this.saveToFile();

    return noteRecord;
  }

  /**
   * 保存到文件（模拟数据库）
   */
  async saveToFile() {
    try {
      const dbPath = path.join(__dirname, 'notes.json');
      await fs.writeFile(dbPath, JSON.stringify(this.notesDB, null, 2), 'utf8');
    } catch (error) {
      console.error('保存数据库时出错:', error.message);
    }
  }

  /**
   * 从文件加载数据库
   */
  async loadFromFile() {
    try {
      const dbPath = path.join(__dirname, 'notes.json');
      const data = await fs.readFile(dbPath, 'utf8');
      this.notesDB = JSON.parse(data);
    } catch (error) {
      // 如果文件不存在，使用空数组
      this.notesDB = [];
    }
  }

  /**
   * 组织和分类笔记
   */
  async organizeNote(noteRecord) {
    try {
      // 按日期组织
      const dateDir = path.join(this.organizedDir, 'by_date', moment(noteRecord.createdAt).format('YYYY/MM/DD'));
      await fs.mkdir(dateDir, { recursive: true });
      
      // 复制原图到日期目录
      const dateImagePath = path.join(dateDir, path.basename(noteRecord.originalImagePath));
      await fs.copyFile(noteRecord.originalImagePath, dateImagePath);
      
      // 按主题组织
      const topicDir = path.join(this.organizedDir, 'by_topic', noteRecord.topic);
      await fs.mkdir(topicDir, { recursive: true });
      
      // 复制原图到主题目录
      const topicImagePath = path.join(topicDir, path.basename(noteRecord.originalImagePath));
      await fs.copyFile(noteRecord.originalImagePath, topicImagePath);
      
      // 按标签组织
      for (const tag of noteRecord.tags) {
        const tagDir = path.join(this.organizedDir, 'by_tag', tag);
        await fs.mkdir(tagDir, { recursive: true });
        
        // 复制原图到标签目录
        const tagImagePath = path.join(tagDir, path.basename(noteRecord.originalImagePath));
        await fs.copyFile(noteRecord.originalImagePath, tagImagePath);
      }
      
      console.log(`笔记已组织到相应目录: ${noteRecord.id}`);
    } catch (error) {
      console.error('组织笔记时出错:', error.message);
    }
  }

  /**
   * 处理单张笔记图片
   */
  async processNoteImage(imagePath) {
    console.log(`正在处理笔记: ${imagePath}`);
    
    // OCR识别
    const recognitionResult = await this.recognizeHandwriting(imagePath);
    
    if (!recognitionResult.success) {
      console.error(`OCR识别失败: ${recognitionResult.error}`);
      return recognitionResult;
    }

    // 分析笔记内容
    const analysis = await this.analyzeNoteContent(recognitionResult.extractedText);

    // 保存笔记信息
    const savedNote = await this.saveNote({
      originalImagePath: imagePath,
      extractedText: recognitionResult.extractedText,
      elements: recognitionResult.elements,
      avgConfidence: recognitionResult.avgConfidence,
      ...analysis
    });

    // 组织笔记
    await this.organizeNote(savedNote);

    // 移动原图到已处理目录
    const fileName = path.basename(imagePath);
    const newFilePath = path.join(this.processedDir, `${savedNote.id}_${fileName}`);
    await fs.copyFile(imagePath, newFilePath);

    console.log(`笔记处理完成: ${savedNote.id}`);
    
    return {
      ...recognitionResult,
      analysis: analysis,
      noteRecord: savedNote
    };
  }

  /**
   * 批量处理笔记
   */
  async processBatch(imagePaths) {
    console.log(`开始批量处理 ${imagePaths.length} 张笔记`);
    
    const results = [];
    
    for (let i = 0; i < imagePaths.length; i++) {
      console.log(`正在处理第 ${i + 1}/${imagePaths.length} 张笔记`);
      
      const result = await this.processNoteImage(imagePaths[i]);
      results.push(result);
      
      // 避免处理过快
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return results;
  }

  /**
   * 导出笔记数据
   */
  async exportData(format = 'json') {
    switch (format.toLowerCase()) {
      case 'csv':
        return this.exportToCSV();
      case 'excel':
      case 'xlsx':
        return this.exportToExcel();
      case 'pdf':
        return this.exportToPDF();
      default:
        return this.exportToJSON();
    }
  }

  /**
   * 导出为JSON
   */
  async exportToJSON() {
    const exportPath = path.join(__dirname, `notes_export_${Date.now()}.json`);
    await fs.writeFile(exportPath, JSON.stringify(this.notesDB, null, 2), 'utf8');
    return exportPath;
  }

  /**
   * 导出为CSV
   */
  async exportToCSV() {
    // 简单CSV导出
    const csvRows = [
      ['ID', '主题', '关键词', '摘要', '标签', '重要程度', '字数', '创建时间'].join(',')
    ];
    
    for (const note of this.notesDB) {
      const row = [
        note.id,
        `"${note.topic || ''}"`,
        `"${note.keywords.join(';')}"`,
        `"${note.summary || ''}"`,
        `"${note.tags.join(';')}"`,
        `"${note.importance || ''}"`,
        note.wordCount || '',
        `"${note.createdAt || ''}"`
      ].join(',');
      csvRows.push(row);
    }
    
    const csvContent = csvRows.join('\n');
    const exportPath = path.join(__dirname, `notes_export_${Date.now()}.csv`);
    await fs.writeFile(exportPath, csvContent, 'utf8');
    return exportPath;
  }

  /**
   * 导出为Excel
   */
  async exportToExcel() {
    // 创建工作簿
    const wb = xlsx.utils.book_new();
    
    // 准备数据
    const wsData = [
      ['ID', '主题', '关键词', '摘要', '标签', '重要程度', '字数', '创建时间']
    ];
    
    for (const note of this.notesDB) {
      wsData.push([
        note.id,
        note.topic || '',
        note.keywords.join(';'),
        note.summary || '',
        note.tags.join(';'),
        note.importance || '',
        note.wordCount || '',
        note.createdAt || ''
      ]);
    }
    
    // 创建工作表
    const ws = xlsx.utils.aoa_to_sheet(wsData);
    xlsx.utils.book_append_sheet(wb, ws, '笔记记录');
    
    // 保存文件
    const exportPath = path.join(__dirname, `notes_export_${Date.now()}.xlsx`);
    xlsx.writeFile(wb, exportPath);
    
    return exportPath;
  }

  /**
   * 导出为PDF
   */
  async exportToPDF() {
    const pdfDoc = await PDFDocument.create();
    
    for (const note of this.notesDB) {
      const page = pdfDoc.addPage([595, 842]); // A4 size in points
      const { width, height } = page.getSize();
      let yPosition = height - 50;
      
      // 添加标题
      page.drawText(`笔记 ID: ${note.id}`, {
        x: 50,
        y: yPosition,
        size: 18,
        color: rgb(0, 0, 0),
      });
      yPosition -= 30;
      
      // 添加主题
      page.drawText(`主题: ${note.topic}`, {
        x: 50,
        y: yPosition,
        size: 12,
        color: rgb(0, 0, 0),
      });
      yPosition -= 20;
      
      // 添加标签
      page.drawText(`标签: ${note.tags.join(', ')}`, {
        x: 50,
        y: yPosition,
        size: 10,
        color: rgb(0.5, 0.5, 0.5),
      });
      yPosition -= 20;
      
      // 添加重要程度
      page.drawText(`重要程度: ${note.importance}`, {
        x: 50,
        y: yPosition,
        size: 10,
        color: note.importance === '高' ? rgb(1, 0, 0) : note.importance === '中' ? rgb(0.8, 0.6, 0) : rgb(0, 0, 0),
      });
      yPosition -= 20;
      
      // 添加关键词
      page.drawText(`关键词: ${note.keywords.join(', ')}`, {
        x: 50,
        y: yPosition,
        size: 10,
        color: rgb(0, 0, 0),
      });
      yPosition -= 25;
      
      // 添加摘要/内容
      const content = note.extractedText || note.summary || '无内容';
      const lines = this.wrapText(content, 40); // 每行最多40个字符
      
      for (const line of lines) {
        if (yPosition < 100) {
          // 如果空间不够，添加新页面
          page.drawText('...', {
            x: 50,
            y: yPosition,
            size: 10,
            color: rgb(0.5, 0, 0),
          });
          break;
        }
        
        page.drawText(line, {
          x: 50,
          y: yPosition,
          size: 10,
          color: rgb(0, 0, 0),
        });
        yPosition -= 12;
      }
      
      // 添加分隔线
      yPosition -= 20;
      if (yPosition > 50) {
        page.drawLine({
          start: { x: 50, y: yPosition },
          end: { x: width - 50, y: yPosition },
          thickness: 1,
          color: rgb(0.8, 0.8, 0.8),
        });
        yPosition -= 20;
      }
    }
    
    const pdfBytes = await pdfDoc.save();
    const exportPath = path.join(__dirname, `notes_export_${Date.now()}.pdf`);
    await fs.writeFile(exportPath, pdfBytes);
    
    return exportPath;
  }

  /**
   * 文本换行处理
   */
  wrapText(text, maxWidth) {
    const lines = [];
    let currentLine = '';
    
    for (const word of text.split(' ')) {
      if ((currentLine + word).length <= maxWidth) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
        
        // 如果单个词超过最大宽度，强制分割
        if (currentLine.length > maxWidth) {
          while (currentLine.length > maxWidth) {
            lines.push(currentLine.substring(0, maxWidth));
            currentLine = currentLine.substring(maxWidth);
          }
        }
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines;
  }

  /**
   * 获取笔记统计信息
   */
  getStatistics() {
    if (this.notesDB.length === 0) {
      return {
        totalNotes: 0,
        totalWords: 0,
        avgWordsPerNote: 0,
        topics: {},
        tags: {},
        dateRange: null
      };
    }

    // 统计主题
    const topics = {};
    // 统计标签
    const tags = {};
    
    let totalWords = 0;
    
    for (const note of this.notesDB) {
      // 主题统计
      topics[note.topic] = (topics[note.topic] || 0) + 1;
      
      // 标签统计
      for (const tag of note.tags) {
        tags[tag] = (tags[tag] || 0) + 1;
      }
      
      totalWords += note.wordCount || 0;
    }

    const avgWordsPerNote = this.notesDB.length > 0 ? Math.round(totalWords / this.notesDB.length) : 0;

    // 日期范围
    const dates = this.notesDB
      .map(note => note.createdAt)
      .filter(date => date !== null)
      .sort();

    const dateRange = dates.length > 0 ? {
      start: dates[0],
      end: dates[dates.length - 1]
    } : null;

    return {
      totalNotes: this.notesDB.length,
      totalWords: totalWords,
      avgWordsPerNote: avgWordsPerNote,
      topics: topics,
      tags: tags,
      dateRange: dateRange
    };
  }

  /**
   * 搜索笔记
   */
  searchNotes(query) {
    const lowerQuery = query.toLowerCase();
    return this.notesDB.filter(note => {
      return (
        (note.topic && note.topic.toLowerCase().includes(lowerQuery)) ||
        (note.extractedText && note.extractedText.toLowerCase().includes(lowerQuery)) ||
        (note.summary && note.summary.toLowerCase().includes(lowerQuery)) ||
        (note.tags && note.tags.some(tag => tag.toLowerCase().includes(lowerQuery))) ||
        (note.keywords && note.keywords.some(kw => kw.toLowerCase().includes(lowerQuery)))
      );
    });
  }

  /**
   * 启动API服务
   */
  async startApiService(port = 3002) {
    const app = express();
    const upload = multer({ dest: this.uploadDir });

    // 加载现有数据
    await this.loadFromFile();

    // 中间件
    app.use(express.json());
    app.use('/uploads', express.static(this.uploadDir));
    app.use('/processed', express.static(this.processedDir));
    app.use('/organized', express.static(this.organizedDir));

    // 上传笔记接口
    app.post('/upload', upload.single('note'), async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: '请上传笔记图片' });
        }

        const result = await this.processNoteImage(req.file.path);
        
        res.json({
          success: true,
          result: result
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // 批量上传接口
    app.post('/upload/batch', upload.array('notes', 10), async (req, res) => {
      try {
        if (!req.files || req.files.length === 0) {
          return res.status(400).json({ error: '请上传笔记图片' });
        }

        const imagePaths = req.files.map(file => file.path);
        const results = await this.processBatch(imagePaths);
        
        res.json({
          success: true,
          results: results
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // 获取所有笔记
    app.get('/notes', (req, res) => {
      res.json({
        success: true,
        notes: this.notesDB
      });
    });

    // 搜索笔记
    app.get('/notes/search', (req, res) => {
      const { q } = req.query;
      if (!q) {
        return res.json({
          success: true,
          notes: this.notesDB
        });
      }

      const results = this.searchNotes(q);
      res.json({
        success: true,
        notes: results
      });
    });

    // 获取统计信息
    app.get('/stats', (req, res) => {
      const stats = this.getStatistics();
      res.json({
        success: true,
        stats: stats
      });
    });

    // 导出数据
    app.get('/export/:format', async (req, res) => {
      try {
        const { format } = req.params;
        const exportPath = await this.exportData(format);
        
        res.download(exportPath, (err) => {
          if (err) {
            console.error('下载文件时出错:', err);
          }
          // 可以选择删除临时导出文件
          // fs.unlink(exportPath).catch(() => {});
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    app.listen(port, () => {
      console.log(`手写笔记整理服务已启动，监听端口 ${port}`);
      console.log(`API端点:`);
      console.log(`  POST /upload - 上传单张笔记`);
      console.log(`  POST /upload/batch - 批量上传笔记`);
      console.log(`  GET /notes - 获取所有笔记`);
      console.log(`  GET /notes/search?q=keyword - 搜索笔记`);
      console.log(`  GET /stats - 获取统计信息`);
      console.log(`  GET /export/:format - 导出数据 (json/csv/xlsx/pdf)`);
    });
  }
}

// 如果直接运行此文件
if (require.main === module) {
  const args = process.argv.slice(2);
  const organizer = new HandwritingNotesOrganizer();
  
  // 解析命令行参数
  const imageIndex = args.indexOf('--image');
  const batchIndex = args.indexOf('--batch');
  const exportIndex = args.indexOf('--export');
  const apiIndex = args.indexOf('--api');
  const portIndex = args.indexOf('--port');
  
  (async () => {
    try {
      if (apiIndex !== -1) {
        // 启动API服务
        const port = portIndex !== -1 ? parseInt(args[portIndex + 1]) || 3002 : 3002;
        await organizer.startApiService(port);
      } else if (imageIndex !== -1) {
        // 处理单张图片
        const imagePath = args[imageIndex + 1];
        const result = await organizer.processNoteImage(imagePath);
        
        console.log('处理结果:');
        console.log(JSON.stringify(result, null, 2));
      } else if (batchIndex !== -1) {
        // 批量处理
        const dirPath = args[batchIndex + 1];
        const files = await fs.readdir(dirPath);
        const imageFiles = files.filter(file => 
          file.toLowerCase().endsWith('.jpg') || 
          file.toLowerCase().endsWith('.jpeg') || 
          file.toLowerCase().endsWith('.png') || 
          file.toLowerCase().endsWith('.bmp')
        );
        
        const imagePaths = imageFiles.map(file => path.join(dirPath, file));
        const results = await organizer.processBatch(imagePaths);
        
        console.log(`批量处理完成，成功处理 ${results.filter(r => r && r.success).length} 张笔记`);
      } else if (exportIndex !== -1) {
        // 导出数据
        const format = args[exportIndex + 1] || 'json';
        const exportPath = await organizer.exportData(format);
        
        console.log(`数据已导出到: ${exportPath}`);
      } else {
        // 显示帮助信息
        console.log('手写笔记整理工具');
        console.log('');
        console.log('使用方法:');
        console.log('  node index.js --image ./note.jpg');
        console.log('  node index.js --batch ./notes/');
        console.log('  node index.js --export pdf');
        console.log('  node index.js --api [--port 3002]');
        console.log('');
      }
    } catch (error) {
      console.error('执行过程中出错:', error);
    }
  })();
}

module.exports = HandwritingNotesOrganizer;