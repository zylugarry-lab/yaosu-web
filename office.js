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
  if (!/基本情况|集合资产管理计划/.test(text)) throw new Error("这份旧版 DOC 没能读出正文。请在 Word 中另存为 DOCX 后再上传。");
  return text;
}

function decodeXml(value) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

async function unzip(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;
  const scanFrom = Math.max(0, bytes.length - 70000);
  for (let i = bytes.length - 22; i >= scanFrom; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("文件不是有效的 DOCX。");
  const count = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  const files = {};
  for (let n = 0; n < count; n++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break;
    const method = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOff = view.getUint32(ptr + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    const localNameLen = view.getUint16(localOff + 26, true);
    const localExtra = view.getUint16(localOff + 28, true);
    const start = localOff + 30 + localNameLen + localExtra;
    const slice = bytes.subarray(start, start + compSize);
    files[name] = method === 0 ? slice : method === 8 ? await inflate(slice) : slice;
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
