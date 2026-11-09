import { extractCore, composeElements } from "./extract.js";
import { contractText } from "./office.js";
import { workbook } from "./xlsx.js";

const $ = (id) => document.getElementById(id);
const state = { core: null, overrides: {}, manual: blankManual() };

function blankManual() {
  return { code: "", perfMode: "single", b1: "", b2: "", r1: "", r2: "", ongoing: false, openDate: "", channel: "house" };
}

$("file").addEventListener("change", (event) => { const file = event.target.files?.[0]; if (file) read(file); });
const drop = $("drop");
drop.addEventListener("dragover", (event) => { event.preventDefault(); drop.classList.add("dragging"); });
drop.addEventListener("dragleave", () => drop.classList.remove("dragging"));
drop.addEventListener("drop", (event) => {
  event.preventDefault();
  drop.classList.remove("dragging");
  const file = event.dataTransfer.files?.[0];
  if (file) read(file);
});

for (const id of ["code", "b1", "r1", "t1", "p1", "t2", "p2", "open-date"]) $(id).addEventListener("input", syncManual);
$("ongoing").addEventListener("change", syncManual);
for (const input of document.querySelectorAll('input[name="perf"],input[name="channel"]')) input.addEventListener("change", syncManual);

$("download").addEventListener("click", download);
$("copy").addEventListener("click", copyTable);
for (const button of document.querySelectorAll(".steps button")) {
  button.addEventListener("click", () => showStep(button.dataset.step));
}

async function read(file) {
  $("read-error").hidden = true;
  $("file-name").hidden = false;
  $("file-name").textContent = `正在读取 ${file.name}`;
  try {
    const text = await contractText(file);
    state.core = extractCore(text);
    state.overrides = {};
    state.manual = manualFrom(state.core);
    state.fileName = file.name.replace(/\.(docx|doc)$/i, "");
    paintManual();
    paintTable();
    $("file-name").textContent = file.name;
    showStep("manual");
  } catch (error) {
    $("file-name").hidden = true;
    $("read-error").hidden = false;
    $("read-error").textContent = error.message || "这份合同没有读出来。";
  }
}

function manualFrom(core) {
  const perf = core.performance || {};
  const manual = blankManual();
  if (perf.mode === "none") manual.perfMode = "none";
  else if (perf.mode === "tier") {
    manual.perfMode = "tier";
    manual.r1 = perf.r1 || "";
    manual.r2 = perf.r2 || "";
  } else {
    manual.perfMode = "single";
    manual.b1 = perf.benchmark || "";
    manual.r1 = perf.ratio || "";
  }
  return manual;
}

function paintManual() {
  $("code").value = state.manual.code;
  document.querySelector(`input[name="perf"][value="${state.manual.perfMode}"]`).checked = true;
  document.querySelector(`input[name="channel"][value="${state.manual.channel}"]`).checked = true;
  $("b1").value = state.manual.b1;
  $("r1").value = state.manual.r1;
  $("t1").value = state.manual.b1;
  $("p1").value = state.manual.r1;
  $("t2").value = state.manual.b2;
  $("p2").value = state.manual.r2;
  $("ongoing").checked = state.manual.ongoing;
  $("open-date").value = state.manual.openDate;
  $("open-date").hidden = !state.manual.ongoing;
  $("perf-single").hidden = state.manual.perfMode !== "single";
  $("perf-tier").hidden = state.manual.perfMode !== "tier";
  const perf = state.core?.performance || {};
  $("perf-hint").textContent = perf.mode === "none"
    ? "合同写明管理人不提取业绩报酬。若公告另有约定，可改成单一基准或阶梯计提。"
    : perf.mode === "tier"
      ? "合同有两档提取比例，没有写两档基准数字。基准留空时，要素表会提示以公告为准。"
      : perf.benchmark
        ? "合同里已经写了计提基准，可直接用，也可以改成公告上的新基准。"
        : "合同只写了提取比例，基准指向公告。填上基准后会写进要素表；不填则保留「以管理人公告为准」。";
  const notes = $("notes");
  notes.hidden = !state.core?.notes.length;
  notes.replaceChildren(...(state.core?.notes || []).map((note) => {
    const item = document.createElement("li");
    item.textContent = note;
    return item;
  }));
}

function syncManual() {
  const mode = document.querySelector('input[name="perf"]:checked').value;
  const ongoing = $("ongoing").checked;
  const modeChanged = mode !== state.manual.perfMode || ongoing !== state.manual.ongoing;
  state.manual = {
    code: $("code").value.trim(),
    perfMode: mode,
    b1: mode === "tier" ? $("t1").value.trim() : $("b1").value.trim(),
    r1: mode === "tier" ? $("p1").value.trim() : $("r1").value.trim(),
    b2: $("t2").value.trim(),
    r2: $("p2").value.trim(),
    ongoing,
    openDate: $("open-date").value.trim(),
    channel: document.querySelector('input[name="channel"]:checked').value,
  };
  delete state.overrides["产品名称"];
  delete state.overrides["开放期"];
  delete state.overrides["业绩报酬"];
  delete state.overrides["产品风险等级"];
  if (modeChanged) paintManual();
  paintTable();
}

function showStep(step) {
  state.step = step;
  $("upload").hidden = step !== "upload";
  $("manual").hidden = step !== "manual";
  $("result").hidden = step !== "result";
  for (const button of document.querySelectorAll(".steps button")) {
    const selected = button.dataset.step === step;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", selected ? "true" : "false");
  }
  if (step === "result") paintTable();
}

function rows() {
  if (!state.core) return [];
  return composeElements(state.core, state.manual).map(([label, value]) => [label, state.overrides[label] ?? value]);
}

function paintTable() {
  const root = $("table");
  root.replaceChildren();
  const data = rows();
  $("download").disabled = !data.length;
  $("copy").disabled = !data.length;
  if (!data.length) {
    const empty = document.createElement("p");
    empty.className = "section-heading";
    empty.textContent = "先在「上传合同」里选择 Word，这里才会生成要素表。手填的内容会保留。";
    root.append(empty);
    return;
  }
  for (const [label, value] of data) {
    const name = document.createElement("label");
    name.textContent = label;
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("aria-label", label);
    input.addEventListener("input", () => { state.overrides[label] = input.value; });
    root.append(name, input);
  }
}

function download() {
  const data = rows();
  const note = $("download-note");
  if (!data.length) return;
  try {
    const blob = new Blob([workbook(data)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const title = (state.fileName || "产品要素表").replace(/[\\/:*?"<>|\r\n]/g, "").slice(0, 80);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${title}-产品要素表.xlsx`;
    document.body.append(link);
    link.click();
    note.hidden = false;
    note.textContent = "已开始下载。若没有文件，多半是 Edge 因“网站不安全”拦截了下载，可先点「复制全文」，或在红页里向微软报告误报。";
    setTimeout(() => {
      link.remove();
      URL.revokeObjectURL(link.href);
    }, 2000);
  } catch (error) {
    note.hidden = false;
    note.textContent = error.message || "表格没有生成，请改用「复制全文」。";
  }
}

async function copyTable() {
  const text = rows().map(([label, value]) => `${label}\n${value}`).join("\n\n");
  await navigator.clipboard.writeText(text);
  $("copied").hidden = false;
  setTimeout(() => { $("copied").hidden = true; }, 1600);
}
