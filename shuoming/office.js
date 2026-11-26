import { unzip } from "./zip.js";

export async function contractText(file) {
  const buffer = await file.arrayBuffer();
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx")) return docxText(buffer);
  if (name.endsWith(".doc")) return docText(buffer);
  throw new Error("请上传 Word 合同（.doc 或 .docx）。");
}

export async function docxText(buffer) {
  const files = await unzip(buffer);
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("这份 DOCX 里没有正文，请确认是 Word 合同。");
  const source = new TextDecoder("utf-8").decode(xml);
  const paragraphs = [];
  for (const part of source.split(/<w:p[ >]/).slice(1)) {
    const bits = [...part.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => decodeXml(m[1]));
    paragraphs.push(bits.join(""));
  }
  const text = paragraphs.join("\n").trim();
  if (text.length < 200) throw new Error("合同正文过短，可能是扫描件。请换可复制文字的 Word。");
  return text;
}

export function docText(buffer) {
  const text = new TextDecoder("utf-16le").decode(buffer).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "\n");
  if (!/基本情况|资产管理计划/.test(text)) throw new Error("这份旧版 DOC 没能读出正文。请在 Word 中另存为 DOCX 后再上传。");
  return text;
}

function decodeXml(value) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

export { unzip };
