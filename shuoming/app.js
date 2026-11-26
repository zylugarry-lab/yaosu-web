import { contractText } from "./office.js";
import { extractAll, fieldOrder, guessKind } from "./extract.js";
import { fillProspectus, fillRisk } from "./fill.js";

const $ = (id) => document.getElementById(id);
const state = { kind: "集合", core: null, overrides: {}, fileName: "" };

const templates = {
  集合: { sms: "./templates/集合说明书.docx", risk: "./templates/集合风险揭示书.docx" },
  单一: { sms: "./templates/单一说明书.docx", risk: "./templates/单一风险揭示书.docx" },
};

for (const input of document.querySelectorAll('input[name="kind"]')) {
  input.addEventListener("change", () => {
    state.kind = document.querySelector('input[name="kind"]:checked').value;
    paintKind();
    if (state.core?.raw) applyExtract(state.core.raw);
  });
}

$("file").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) read(file);
});
const drop = $("drop");
drop.addEventListener("dragover", (event) => { event.preventDefault(); drop.classList.add("dragging"); });
drop.addEventListener("dragleave", () => drop.classList.remove("dragging"));
drop.addEventListener("drop", (event) => {
  event.preventDefault();
  drop.classList.remove("dragging");
  const file = event.dataTransfer.files?.[0];
  if (file) read(file);
});

$("download-sms").addEventListener("click", () => download("sms"));
$("download-risk").addEventListener("click", () => download("risk"));
$("download-sms-2").addEventListener("click", () => download("sms"));
$("download-risk-2").addEventListener("click", () => download("risk"));
for (const button of document.querySelectorAll(".steps button")) {
  button.addEventListener("click", () => showStep(button.dataset.step));
}

paintKind();

function paintKind() {
  const kind = state.kind;
  $("kind-label").textContent = kind === "单一" ? "单一资产管理计划" : "集合资产管理计划";
  $("intro-copy").textContent = kind === "单一"
    ? "单一计划说明书是 22 行要素表：名称、类型、期限、投资、当事人、费用和披露。和集合那张 44 行表不一样。"
    : "集合计划说明书是 44 行要素表：基本信息、参与退出、成立条件、费用和披露。";
}

async function read(file) {
  $("read-error").hidden = true;
  $("file-name").hidden = false;
  $("file-name").textContent = `正在读取 ${file.name}`;
  try {
    const text = await contractText(file);
    const guessed = guessKind(text);
    if (guessed !== state.kind) {
      state.kind = guessed;
      document.querySelector(`input[name="kind"][value="${guessed}"]`).checked = true;
      paintKind();
    }
    state.fileName = file.name.replace(/\.(docx|doc)$/i, "");
    applyExtract(text);
    $("file-name").textContent = file.name;
    showStep("fields");
  } catch (error) {
    $("file-name").hidden = true;
    $("read-error").hidden = false;
    $("read-error").textContent = error.message || "这份合同没有读出来。";
  }
}

function applyExtract(text) {
  const extracted = extractAll(text, state.kind);
  extracted.raw = text;
  state.core = extracted;
  state.overrides = {};
  paintNotes();
  paintTable();
}

function paintNotes() {
  const notes = $("notes");
  const items = state.core?.notes || [];
  notes.hidden = !items.length;
  notes.replaceChildren(...items.map((note) => {
    const item = document.createElement("li");
    item.textContent = note;
    return item;
  }));
}

function rows() {
  if (!state.core) return [];
  const fields = { ...state.core.字段, ...state.overrides };
  return fieldOrder(state.kind).map((label) => [label, fields[label] || ""]);
}

function paintTable() {
  const root = $("table");
  root.replaceChildren();
  const data = rows();
  $("download-sms").disabled = !data.length;
  $("download-risk").disabled = !data.length;
  $("download-sms-2").disabled = !data.length;
  $("download-risk-2").disabled = !data.length;
  if (!data.length) {
    const empty = document.createElement("p");
    empty.className = "section-heading";
    empty.textContent = "先选择单一或集合，再上传管理合同。";
    root.append(empty);
    return;
  }
  const meta = document.createElement("div");
  meta.className = "meta-grid";
  meta.append(fieldInput("产品简称", state.core.产品简称, (v) => { state.core.产品简称 = v; }));
  meta.append(fieldInput("年份", state.core.年份, (v) => { state.core.年份 = v; }));
  meta.append(fieldInput("风险等级", state.core.风险等级, (v) => { state.core.风险等级 = v; }));
  meta.append(fieldInput("适合投资者", state.core.适合投资者, (v) => { state.core.适合投资者 = v; }));
  root.append(meta);
  const grid = document.createElement("div");
  grid.className = "element-table";
  for (const [label, value] of data) {
    const name = document.createElement("label");
    name.textContent = label;
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("aria-label", label);
    input.addEventListener("input", () => { state.overrides[label] = input.value; });
    grid.append(name, input);
  }
  root.append(grid);
}

function fieldInput(label, value, onInput) {
  const wrap = document.createElement("label");
  wrap.className = "mini-field";
  wrap.innerHTML = `<span>${label}</span>`;
  const input = document.createElement("input");
  input.value = value || "";
  input.addEventListener("input", () => onInput(input.value.trim()));
  wrap.append(input);
  return wrap;
}

function showStep(step) {
  $("upload").hidden = step !== "upload";
  $("fields").hidden = step !== "fields";
  $("result").hidden = step !== "result";
  for (const button of document.querySelectorAll(".steps button")) {
    const selected = button.dataset.step === step;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", selected ? "true" : "false");
  }
  if (step === "fields" || step === "result") paintTable();
}

async function download(which) {
  const note = $("download-note");
  note.hidden = true;
  if (!state.core) return;
  try {
    const tpl = await fetch(encodeURI(templates[state.kind][which]));
    if (!tpl.ok) throw new Error("模板没有加载到，请检查网络后刷新。");
    const buffer = await tpl.arrayBuffer();
    const fields = Object.fromEntries(rows());
    const data = {
      产品简称: state.core.产品简称,
      年份: state.core.年份,
      风险等级: state.core.风险等级,
      适合投资者: state.core.适合投资者,
      字段: fields,
    };
    const bytes = which === "sms" ? await fillProspectus(buffer, data) : await fillRisk(buffer, data);
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const title = (fields.名称 || state.core.产品简称 || state.fileName || "计划").replace(/[\\/:*?"<>|\r\n]/g, "").slice(0, 80);
    const suffix = which === "sms" ? "说明书-自动生成.docx" : "风险揭示书-自动生成.docx";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${title}${suffix}`;
    document.body.append(link);
    link.click();
    note.hidden = false;
    note.textContent = "已开始下载。格子里改过的内容会写进 Word。";
    setTimeout(() => { link.remove(); URL.revokeObjectURL(link.href); }, 2000);
    showStep("result");
  } catch (error) {
    note.hidden = false;
    note.textContent = error.message || "没有生成成功。";
  }
}
