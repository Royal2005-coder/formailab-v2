import JSZip from "jszip";
import mammoth from "mammoth";

/**
 * Document text parser utility for importing DOCX, PDF, TXT, and CSV files
 * into the AI survey generator prompt.
 */

export interface ParsedDocumentResult {
  fileName: string;
  fileSize: number;
  extractedText: string;
  charCount: number;
  lineCount: number;
}

/**
 * Parses clean text from DOCX binary buffer using Mammoth & JSZip.
 */
async function parseDocxText(arrayBuffer: ArrayBuffer): Promise<string> {
  // 1. Try Mammoth raw text extraction (handles tables, paragraphs, bullet points)
  try {
    const result = await mammoth.extractRawText({ arrayBuffer });
    if (result.value && result.value.trim().length > 0) {
      return result.value.trim();
    }
  } catch (error) {
    console.warn("Mammoth docx parse warning, trying JSZip fallback", error);
  }

  // 2. JSZip fallback for word/document.xml
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const documentXmlFile = zip.file("word/document.xml");
    if (documentXmlFile) {
      const xmlContent = await documentXmlFile.async("string");
      const textMatches = xmlContent.match(/<w:t[^>]*>(.*?)<\/w:t>/g);
      if (textMatches && textMatches.length > 0) {
        const textParts = textMatches.map((tag) => tag.replace(/<[^>]+>/g, ""));
        return textParts.join(" ").replace(/\s+/g, " ").trim();
      }
    }
  } catch (error) {
    console.warn("JSZip docx parse warning", error);
  }

  return "";
}

/**
 * Parses clean printable text from PDF binary buffer.
 */
function parsePdfText(arrayBuffer: ArrayBuffer): Promise<string> {
  return new Promise((resolve) => {
    try {
      const decoder = new TextDecoder("latin1");
      const pdfString = decoder.decode(new Uint8Array(arrayBuffer));

      const textChunks: string[] = [];
      const matches = pdfString.match(/\(([^\(\)\\]|\\[\s\S])*\)\s*(Tj|TJ|\')/g);

      if (matches && matches.length > 0) {
        for (const match of matches) {
          const str = match
            .replace(/\)\s*(Tj|TJ|\')$/, "")
            .replace(/^\(/, "")
            .replace(/\\([\(\)\\])/g, "$1");
          if (str.trim().length > 0) {
            textChunks.push(str.trim());
          }
        }
      }

      if (textChunks.length > 0) {
        resolve(textChunks.join("\n"));
        return;
      }
    } catch (e) {
      console.warn("PDF stream parse warning", e);
    }

    resolve("");
  });
}

/**
 * Reads and extracts text from any uploaded document file (.docx, .pdf, .txt, .csv, .md, .json).
 */
export async function parseDocumentFile(file: File): Promise<ParsedDocumentResult> {
  const fileName = file.name;
  const fileSize = file.size;
  const extension = fileName.substring(fileName.lastIndexOf(".")).toLowerCase();

  let extractedText = "";

  if (extension === ".docx" || extension === ".doc") {
    const buffer = await file.arrayBuffer();
    extractedText = await parseDocxText(buffer);
  } else if (extension === ".pdf") {
    const buffer = await file.arrayBuffer();
    extractedText = await parsePdfText(buffer);
  } else {
    // .txt, .csv, .md, .json, etc.
    extractedText = await file.text();
  }

  // Clean up whitespace & control characters
  extractedText = extractedText
    .replace(/\r\n/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .trim();

  const lines = extractedText.split("\n").filter((l) => l.trim().length > 0);
  const charCount = extractedText.length;
  const lineCount = lines.length;

  return {
    fileName,
    fileSize,
    extractedText,
    charCount,
    lineCount,
  };
}
