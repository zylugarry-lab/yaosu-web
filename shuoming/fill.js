import { unzip, zipStore } from "./zip.js";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function kids(el, local) {
  return [...el.childNodes].filter((n) => n.nodeType === 1 && n.namespaceURI === W && n.localName === local);
}

function descendants(el, local) {
  const out = [];
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType !== 1) continue;
      if (child.namespaceURI === W && child.localName === local) out.push(child);
      walk(child);
    }
  };
  walk(el);
  return out;
}

function textOf(el) {
  return descendants(el, "t").map((t) => t.textContent || "").join("");
}

function isYellow(el) {
  return descendants(el, "highlight").some((h) => {
    const val = h.getAttributeNS(W, "val") || h.getAttribute("w:val") || "";
    return val && val !== "none";
  });
}

function yellowText(el) {
  const parts = [];
  let buf = "";
  let cur = false;
  for (const run of descendants(el, "r")) {
    if (kids(run, "drawing").length) continue;
    const t = kids(run, "t").map((n) => n.textContent || "").join("");
    if (isYellow(run)) {
      buf += t;
      cur = true;
    } else {
      if (cur && buf.trim()) parts.push(buf.trim());
      buf = "";
      cur = false;
    }
  }
  if (cur && buf.trim()) parts.push(buf.trim());
  return parts;
}

function setYellowText(el, value) {
  let first = true;
  for (const run of descendants(el, "r")) {
    if (!isYellow(run)) continue;
    const ts = kids(run, "t");
    if (!ts.length) continue;
    ts[0].textContent = first ? value : "";
    ts[0].setAttribute("xml:space", "preserve");
    for (const extra of ts.slice(1)) extra.textContent = "";
    first = false;
  }
}

function clearHighlight(root) {
  for (const hl of descendants(root, "highlight")) hl.parentNode?.removeChild(hl);
}

function setCellText(tc, value, xml) {
  const lines = String(value ?? "").split("\n");
  for (const tbl of kids(tc, "tbl")) tc.removeChild(tbl);
  const paras = kids(tc, "p");
  const proto = paras[0];
  if (!proto) return;
  const makeP = (line) => {
    const p = proto.cloneNode(true);
    for (const r of kids(p, "r")) p.removeChild(r);
    const run = xml.createElementNS(W, "w:r");
    const protoRun = kids(proto, "r")[0];
    if (protoRun) {
      const rPr = kids(protoRun, "rPr")[0];
      if (rPr) run.appendChild(rPr.cloneNode(true));
    }
    const t = xml.createElementNS(W, "w:t");
    t.setAttribute("xml:space", "preserve");
    t.textContent = line;
    run.appendChild(t);
    p.appendChild(run);
    return p;
  };
  const fresh = lines.map(makeP);
  for (const p of paras) tc.removeChild(p);
  for (const p of fresh) tc.appendChild(p);
}

function replaceText(root, oldText, next) {
  if (!oldText || oldText === next) return 0;
  let n = 0;
  for (const t of descendants(root, "t")) {
    if (t.textContent && t.textContent.includes(oldText)) {
      t.textContent = t.textContent.split(oldText).join(next);
      n += 1;
    }
  }
  return n;
}

export async function fillProspectus(templateBuffer, data) {
  const files = await unzip(templateBuffer);
  const xmlBytes = files["word/document.xml"];
  const source = new TextDecoder("utf-8").decode(xmlBytes);
  const xml = new DOMParser().parseFromString(source, "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("说明书模板解析失败。");

  const product = String(data.产品简称 || "").trim();
  const year = String(data.年份 || "").trim();
  const fields = data.字段 || {};
  const tbl = descendants(xml, "tbl")[0];
  if (!tbl) throw new Error("模板里没有表格。");
  const rows = kids(tbl, "tr");
  let oldProduct = "";
  let oldYear = "";

  rows.forEach((tr, ri) => {
    const cells = kids(tr, "tc");
    if (ri === 0 && cells[0]) {
      const paras = kids(cells[0], "p");
      const ys0 = paras[0] ? yellowText(paras[0]) : [];
      const ys1 = paras[1] ? yellowText(paras[1]) : [];
      oldProduct = ys0[0] || "";
      oldYear = ys1[0] || "";
      if (product && paras[0]) setYellowText(paras[0], product);
      if (year && paras[1]) setYellowText(paras[1], year);
      return;
    }
    if (ri === 1 && product && cells[0]) {
      for (const p of kids(cells[0], "p")) {
        if (yellowText(p).length) setYellowText(p, product);
      }
      return;
    }

    let section = "";
    let label = "";
    let labelCi = -1;
    cells.forEach((cell, ci) => {
      const ys = yellowText(cell);
      const text = textOf(cell).trim();
      if (cells.length === 3 && ci === 0 && !ys.length) section = text;
      if (ys.length) {
        label = ys[ys.length - 1];
        labelCi = ci;
      }
    });
    if (!label) return;
    let valueCell = null;
    for (let i = cells.length - 1; i >= 0; i--) {
      if (i !== labelCi) {
        valueCell = cells[i];
        break;
      }
    }
    if (!valueCell) return;
    const key = label === "办理时间" && section ? `${section}·办理时间` : label;
    const value = fields[key] ?? fields[label] ?? (section ? fields[`${section}·${label}`] : undefined);
    if (value == null || value === "") return;
    setCellText(valueCell, value, xml);
  });

  if (product && oldProduct && product !== oldProduct) replaceText(xml, oldProduct, product);
  if (year && oldYear && year !== oldYear) replaceText(xml, oldYear, year);
  clearHighlight(xml);

  const out = new XMLSerializer().serializeToString(xml);
  files["word/document.xml"] = new TextEncoder().encode(out);
  for (const name of Object.keys(files)) {
    if (/word\/header\d+\.xml$/.test(name) || /word\/footer\d+\.xml$/.test(name)) {
      let text = new TextDecoder("utf-8").decode(files[name]);
      if (oldProduct && product) text = text.split(oldProduct).join(product);
      files[name] = new TextEncoder().encode(text);
    }
  }
  return zipStore(files);
}

export async function fillRisk(templateBuffer, data) {
  const files = await unzip(templateBuffer);
  const source = new TextDecoder("utf-8").decode(files["word/document.xml"]);
  const xml = new DOMParser().parseFromString(source, "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("风险揭示书模板解析失败。");

  const product = String(data.产品简称 || "").trim();
  const risk = String(data.风险等级 || "").trim();
  const suit = String(data.适合投资者 || "").trim();
  let oldProduct = "";
  let oldRisk = "";
  let oldSuit = "";

  const paras = descendants(xml.documentElement, "p");
  for (const p of paras.slice(0, 8)) {
    const ys = yellowText(p);
    const text = textOf(p);
    if (!oldProduct && ys[0] && (text.includes("资产管理计划") || text.includes("风险揭示书"))) oldProduct = ys[0];
    if (text.includes("投资品种") || text.includes("适合合格投资者") || text.includes("风险承受")) {
      for (const y of ys) {
        if (!oldRisk && /风险/.test(y)) oldRisk = y;
        if (!oldSuit && (/C[1-5]/.test(y) || /型/.test(y))) oldSuit = y;
      }
    }
  }
  if (product && oldProduct) {
    for (const p of paras.slice(0, 8)) {
      if (yellowText(p)[0] === oldProduct) setYellowText(p, product);
    }
  }
  if (risk && oldRisk) {
    for (const p of paras.slice(0, 12)) {
      for (const run of descendants(p, "r")) {
        if (!isYellow(run)) continue;
        const t = kids(run, "t")[0];
        if (!t) continue;
        if (t.textContent === oldRisk) t.textContent = risk;
        if (suit && oldSuit && t.textContent === oldSuit) t.textContent = suit;
      }
    }
  }

  if (product && oldProduct && product !== oldProduct) replaceText(xml, oldProduct, product);
  if (risk && oldRisk && risk !== oldRisk) replaceText(xml, oldRisk, risk);
  if (suit && oldSuit && suit !== oldSuit) replaceText(xml, oldSuit, suit);
  clearHighlight(xml);

  files["word/document.xml"] = new TextEncoder().encode(new XMLSerializer().serializeToString(xml));
  return zipStore(files);
}
