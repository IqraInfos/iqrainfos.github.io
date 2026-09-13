const SPREADSHEET_ID = "1veu4yClsNn27r6zpjvSEswuDme5Lz3eHc9IURz3kqy4"; 

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

  if (action === 'visitor') {
    return jsonResponse({ count: incrementVisitorCount() });
  }

  if (action === 'counts') {
    return jsonResponse(getAllFileCounts());
  }

  if (action === 'files') {
    const token = e.parameter.token || null;
    return jsonResponse(getFilesFromDrive(token));
  }

  if (action === 'allFiles') {
    return jsonResponse(getAllFilesFromDrive());
  }

  if (action === 'pdf') {
    return jsonResponse(getPdfData(e.parameter.fileId || ''));
  }

  if (action === 'log') {
    logFileClick(e.parameter.fileId || '', e.parameter.fileName || '');
    return jsonResponse({ success: true });
  }

  return jsonResponse({ error: 'Action tidak dikenal.' });
}

function incrementVisitorCount() {
  const props = PropertiesService.getScriptProperties();
  let totalVisitor = parseInt(props.getProperty('TOTAL_VISITOR') || '0', 10);
  totalVisitor++;
  props.setProperty('TOTAL_VISITOR', totalVisitor.toString());
  return totalVisitor;
}

function jsonResponse(data) {
  return ContentService
      .createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
}

// 1. Ambil total pengunjung web
function getVisitorCount() {
  const props = PropertiesService.getScriptProperties();
  return props.getProperty('TOTAL_VISITOR') || '0';
}

// 2. Ambil daftar file dari Google Drive
function getFilesFromDrive(token) {
  const folderId = "11-3uhsh4KkxiReh7cGUNCMUn0FkI0fHi"; 
  const fileList = [];
  const limit = 32;
  const cache = CacheService.getScriptCache();
  const cacheKey = token ? 'files_' + token : 'files_first_page';

  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);
  
  try {
    let files;
    if (token) {
      files = DriveApp.continueFileIterator(token);
    } else {
      const folder = DriveApp.getFolderById(folderId);
      files = folder.getFiles();
    }

    let count = 0;
    while (files.hasNext() && count < limit) {
      const file = files.next();
      let fileSize = 0;
      try { fileSize = file.getSize(); } catch (err) { fileSize = 0; }

      fileList.push({
        id: file.getId(),
        name: file.getName(),
        url: file.getUrl(),
        mimeType: file.getMimeType(),
        size: formatBytes(fileSize),
        thumbnail: "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w400"
      });
      count++;
    }
    
    const result = {
      files: fileList,
      nextToken: files.hasNext() ? files.getContinuationToken() : null
    };
    cache.put(cacheKey, JSON.stringify(result), 300);
    return result;
  } catch (e) {
    return { files: [], nextToken: null };
  }
}

function getAllFilesFromDrive() {
  const folderId = "11-3uhsh4KkxiReh7cGUNCMUn0FkI0fHi";
  const cache = CacheService.getScriptCache();
  const metaKey = 'files_all_meta';
  const cachedMeta = cache.get(metaKey);

  if (cachedMeta) {
    const meta = JSON.parse(cachedMeta);
    const cachedFiles = [];
    for (let index = 0; index < meta.chunks; index++) {
      const chunk = cache.get('files_all_' + index);
      if (!chunk) break;
      cachedFiles.push(...JSON.parse(chunk));
    }
    if (cachedFiles.length === meta.count) {
      return { files: cachedFiles, nextToken: null };
    }
  }

  try {
    const files = DriveApp.getFolderById(folderId).getFiles();
    const fileList = [];

    while (files.hasNext()) {
      const file = files.next();
      let fileSize = 0;
      try { fileSize = file.getSize(); } catch (err) { fileSize = 0; }

      fileList.push({
        id: file.getId(),
        name: file.getName(),
        url: file.getUrl(),
        mimeType: file.getMimeType(),
        size: formatBytes(fileSize),
        thumbnail: "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w400"
      });
    }

    const chunkSize = 64;
    const chunks = Math.ceil(fileList.length / chunkSize);
    for (let index = 0; index < chunks; index++) {
      cache.put('files_all_' + index, JSON.stringify(fileList.slice(index * chunkSize, (index + 1) * chunkSize)), 300);
    }
    cache.put(metaKey, JSON.stringify({ count: fileList.length, chunks }), 300);
    return { files: fileList, nextToken: null };
  } catch (error) {
    console.error('Gagal memuat seluruh daftar buku: ' + error.message);
    return { files: [], nextToken: null, error: 'Daftar buku tidak dapat dimuat.' };
  }
}

function getPdfData(fileId) {
  if (!fileId) return { error: 'ID file tidak ditemukan.' };

  try {
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();

    if (blob.getContentType() !== MimeType.PDF) {
      return { error: 'File bukan PDF.' };
    }

    return {
      name: file.getName(),
      mimeType: blob.getContentType(),
      data: Utilities.base64Encode(blob.getBytes())
    };
  } catch (e) {
    return { error: 'PDF tidak dapat diakses dari Google Drive.' };
  }
}

// 3. Catat klik buku ke Google Sheets
function logFileClick(fileId, fileName) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName("IQRA_Stats");
    
    if (!sheet) {
      sheet = ss.insertSheet("IQRA_Stats");
      sheet.appendRow(["File ID", "Nama File", "Total Dibaca", "Terakhir Dibaca"]);
    }

    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === fileId) {
        rowIndex = i + 1;
        break;
      }
    }

    const now = new Date();

    if (rowIndex > 0) {
      const currentCount = parseInt(sheet.getRange(rowIndex, 3).getValue() || 0, 10);
      sheet.getRange(rowIndex, 3).setValue(currentCount + 1);
      sheet.getRange(rowIndex, 4).setValue(now);
    } else {
      sheet.appendRow([fileId, fileName, 1, now]);
    }
  } catch (e) {
    console.log("Error Sheets: " + e.message);
  }
}

// 4. Ambil statistik semua buku untuk ditampilkan awal
function getAllFileCounts() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('file_counts');
  if (cached) return JSON.parse(cached);

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName("IQRA_Stats");
    if (!sheet) return {};

    const data = sheet.getDataRange().getValues();
    const counts = {};

    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) {
        counts[data[i][0]] = parseInt(data[i][2] || 0, 10);
      }
    }
    cache.put('file_counts', JSON.stringify(counts), 120);
    return counts;
  } catch (e) {
    return {};
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}




function testSheets() {
  logFileClick("test_id_123", "Buku Tes");
}

function mintaIzinSheets() {
  SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getAllFilesFromDrive() {
  const folderId = "11-3uhsh4KkxiReh7cGUNCMUn0FkI0fHi";
  const cache = CacheService.getScriptCache();
  const metaKey = 'files_all_meta';
  const cachedMeta = cache.get(metaKey);
  if (cachedMeta) {
    const meta = JSON.parse(cachedMeta);
    const cachedFiles = [];
    for (let index = 0; index < meta.chunks; index++) {
      const chunk = cache.get('files_all_' + index);
      if (!chunk) break;
      cachedFiles.push(...JSON.parse(chunk));
    }
    if (cachedFiles.length === meta.count) {
      return { files: cachedFiles, nextToken: null };
    }
  }

  try {
    const folder = DriveApp.getFolderById(folderId);
    const files = folder.getFiles();
    const fileList = [];

    while (files.hasNext()) {
      const file = files.next();
      let fileSize = 0;
      try { fileSize = file.getSize(); } catch (err) { fileSize = 0; }

      fileList.push({
        id: file.getId(),
        name: file.getName(),
        url: file.getUrl(),
        mimeType: file.getMimeType(),
        size: formatBytes(fileSize),
        thumbnail: "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w400"
      });
    }

    const chunkSize = 64;
    const chunks = Math.ceil(fileList.length / chunkSize);
    for (let index = 0; index < chunks; index++) {
      cache.put('files_all_' + index, JSON.stringify(fileList.slice(index * chunkSize, (index + 1) * chunkSize)), 300);
    }
    cache.put(metaKey, JSON.stringify({ count: fileList.length, chunks }), 300);
    return { files: fileList, nextToken: null };
  } catch (e) {
    return { files: [], nextToken: null, error: 'Daftar buku tidak dapat dimuat.' };
  }
}